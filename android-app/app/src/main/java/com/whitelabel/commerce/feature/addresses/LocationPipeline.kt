package com.whitelabel.commerce.feature.addresses

import com.whitelabel.commerce.core.domain.model.CustomerAddress
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withTimeoutOrNull

internal enum class LocationIssue { Permission, Disabled, Timeout }
internal class LocationFailure(val issue: LocationIssue) : Exception(issue.name)
internal const val FRESH_FIX_MS = 120_000L

internal fun freshFix(ageMs: Long) = ageMs in 0..FRESH_FIX_MS

internal suspend fun <T> attempt(timeoutMs: Long, read: suspend () -> T?): T? = try {
    withTimeoutOrNull(timeoutMs) { read() }
} catch (cancelled: CancellationException) {
    throw cancelled
} catch (_: Exception) {
    null
}

internal suspend fun <T> acquireFix(
    hasPermission: () -> Boolean,
    enabled: () -> Boolean,
    hasPlayServices: Boolean,
    balanced: suspend () -> T?,
    high: suspend () -> T?,
    lastFused: suspend () -> T?,
    network: suspend () -> T?,
    gps: suspend () -> T?,
): T {
    fun checkSettings() {
        if (!hasPermission()) throw LocationFailure(LocationIssue.Permission)
        if (!enabled()) throw LocationFailure(LocationIssue.Disabled)
    }
    checkSettings()
    if (hasPlayServices) {
        attempt(4_000, balanced)?.let { return it }
        attempt(6_000, high)?.let { return it }
        attempt(1_000, lastFused)?.let { return it }
    }
    attempt(5_000, network)?.let { return it }
    attempt(6_000, gps)?.let { return it }
    checkSettings()
    throw LocationFailure(LocationIssue.Timeout)
}

internal data class AddressParts(val governorate: String = "", val city: String = "", val street: String = "") {
    val complete get() = governorate.isNotBlank() && city.isNotBlank() && street.isNotBlank()
    fun fill(other: AddressParts) = AddressParts(governorate.ifBlank { other.governorate },
        city.ifBlank { other.city }, street.ifBlank { other.street })
}

internal data class LocatedAddress(val address: CustomerAddress, val complete: Boolean)

internal suspend fun resolvePin(
    draft: CustomerAddress, lat: Double, lng: Double,
    native: suspend () -> AddressParts?, fallback: suspend () -> AddressParts?,
): LocatedAddress {
    val first = attempt(3_500, native) ?: AddressParts()
    val parts = if (first.complete) first else first.fill(attempt(9_000, fallback) ?: AddressParts())
    return LocatedAddress(draft.copy(lat = lat, lng = lng,
        governorate = parts.governorate.ifBlank { draft.governorate },
        city = parts.city.ifBlank { draft.city }, street = parts.street.ifBlank { draft.street }), parts.complete)
}

internal class AddressCache(private val clock: () -> Long) {
    private data class Entry(val time: Long, val parts: AddressParts)
    private val entries = LinkedHashMap<String, Entry>(32, .75f, true)
    private var retryAt = 0L
    @Synchronized fun get(key: String) = entries[key]?.takeIf { clock() - it.time in 0 until 86_400_000L }?.parts
    @Synchronized fun put(key: String, value: AddressParts) {
        entries[key] = Entry(clock(), value)
        if (entries.size > 64) entries.remove(entries.keys.first())
    }
    @Synchronized fun canRequest() = clock() >= retryAt
    @Synchronized fun backOff(ms: Long) { retryAt = maxOf(retryAt, clock() + ms) }
}
internal fun spatialKey(lat: Double, lng: Double, lang: String) =
    String.format(java.util.Locale.US, "%.4f/%.4f/%s", lat, lng, lang)
