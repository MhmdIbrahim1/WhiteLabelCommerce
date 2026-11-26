package com.whitelabel.commerce.feature.addresses

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Address
import android.location.Geocoder
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.CancellationSignal
import android.os.SystemClock
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.android.gms.tasks.Task
import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.domain.model.CustomerAddress
import com.whitelabel.commerce.core.domain.model.EgyptLocations
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume

private suspend fun Task<Location>.awaitFix(cancel: () -> Unit = {}): Location? =
    suspendCancellableCoroutine { continuation ->
        continuation.invokeOnCancellation { cancel() }
        addOnCompleteListener { task ->
            if (continuation.isActive) continuation.resume(if (task.isSuccessful) task.result else null)
        }
    }

private fun Location.isFresh() = freshFix((SystemClock.elapsedRealtimeNanos() - elapsedRealtimeNanos) / 1_000_000)

@SuppressLint("MissingPermission")
internal suspend fun deviceLocation(context: Context,
    hasPlay: Boolean = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS,
): Location {
    val manager = context.getSystemService(LocationManager::class.java)
    val fused by lazy { LocationServices.getFusedLocationProviderClient(context) }
    suspend fun current(priority: Int): Location? {
        val token = CancellationTokenSource()
        val request = CurrentLocationRequest.Builder().setPriority(priority).setMaxUpdateAgeMillis(FRESH_FIX_MS).build()
        return fused.getCurrentLocation(request, token.token).awaitFix(token::cancel)?.takeIf { it.isFresh() }
    }
    suspend fun platform(provider: String): Location? {
        if (!manager.isProviderEnabled(provider)) return null
        manager.getLastKnownLocation(provider)?.takeIf { it.isFresh() }?.let { return it }
        return suspendCancellableCoroutine<Location?> { continuation ->
            val signal = CancellationSignal()
            continuation.invokeOnCancellation { signal.cancel() }
            LocationManagerCompat.getCurrentLocation(manager, provider, signal, ContextCompat.getMainExecutor(context)) {
                if (continuation.isActive) continuation.resume(it?.takeIf { fix -> fix.isFresh() })
            }
        }
    }
    return acquireFix(
        hasPermission = { ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED },
        enabled = { LocationManagerCompat.isLocationEnabled(manager) }, hasPlayServices = hasPlay,
        balanced = { current(Priority.PRIORITY_BALANCED_POWER_ACCURACY) },
        high = { current(Priority.PRIORITY_HIGH_ACCURACY) }, lastFused = { fused.lastLocation.awaitFix()?.takeIf { it.isFresh() } },
        network = { platform(LocationManager.NETWORK_PROVIDER) }, gps = { platform(LocationManager.GPS_PROVIDER) },
    )
}

// The pre-33 Geocoder can block a binder thread. Bound its concurrency and let the UI time out.
private val legacyGeocoder = Executors.newSingleThreadExecutor()

@Suppress("DEPRECATION")
private suspend fun nativeAddress(context: Context, location: Location, lang: String): Address? {
    if (!Geocoder.isPresent()) return null
    val geocoder = Geocoder(context, Locale.forLanguageTag(lang))
    return if (Build.VERSION.SDK_INT >= 33) {
        suspendCancellableCoroutine { cont ->
            geocoder.getFromLocation(location.latitude, location.longitude, 1, object : Geocoder.GeocodeListener {
                override fun onGeocode(addresses: MutableList<Address>) {
                    if (cont.isActive) cont.resume(addresses.firstOrNull())
                }
                override fun onError(errorMessage: String?) { if (cont.isActive) cont.resume(null) }
            })
        }
    } else suspendCancellableCoroutine { cont ->
        val task = legacyGeocoder.submit {
            val address = runCatching { geocoder.getFromLocation(location.latitude, location.longitude, 1)?.firstOrNull() }.getOrNull()
            if (cont.isActive) cont.resume(address)
        }
        cont.invokeOnCancellation { task.cancel(true) }
    }
}

private val http = OkHttpClient.Builder().callTimeout(5, TimeUnit.SECONDS).build()
private val addresses = AddressCache(SystemClock::elapsedRealtime)

internal suspend fun lookupAddress(location: Location, lang: String): AddressParts? = withContext(Dispatchers.IO) {
    val key = spatialKey(location.latitude, location.longitude, lang)
    addresses.get(key)?.let { return@withContext it }
    if (!addresses.canRequest()) return@withContext null
    val (lat, lng) = key.split('/')
    val body = JSONObject().put("lat", lat.toDouble()).put("lng", lng.toDouble()).put("lang", lang)
    val request = Request.Builder().url(BuildConfig.SUPABASE_URL.trimEnd('/') + "/functions/v1/reverse-geocode")
        .header("apikey", BuildConfig.SUPABASE_ANON_KEY)
        .header("Authorization", "Bearer " + BuildConfig.SUPABASE_ANON_KEY)
        .post(body.toString().toRequestBody("application/json".toMediaType())).build()
    fun responseJson(request: Request): JSONObject? = http.newCall(request).execute().use { response ->
        if (response.code == 429 || response.code == 503) {
            val retry = response.header("Retry-After")
            val seconds = retry?.toLongOrNull()?.coerceIn(1, 86400)
            val waitMs = seconds?.times(1000) ?: response.headers.getDate("Retry-After")?.let { it.time - System.currentTimeMillis() } ?: 60_000
            addresses.backOff(waitMs.coerceIn(1000, 86_400_000))
        }
        if (response.isSuccessful) response.body?.string()?.let(::JSONObject) else null
    }
    val slot = responseJson(request) ?: return@withContext null
    val cached = slot.optJSONObject("cached")
    val parts = if (cached != null) {
        AddressParts(cached.optString("governorate"), cached.optString("city"), cached.optString("street"))
    } else {
        val endpoint = slot.optString("url")
        if (!endpoint.startsWith("https://")) return@withContext null
        val lookup = Request.Builder().url(endpoint)
            .header("User-Agent", "WhiteLabelCommerce/" + BuildConfig.VERSION_NAME + " (https://github.com/MhmdIbrahim1/WhiteLabelCommerce)")
            .header("Accept", "application/json").build()
        val a = responseJson(lookup)?.optJSONObject("address") ?: return@withContext null
        if (!a.optString("country_code").equals("eg", true)) return@withContext null
        fun field(vararg names: String) = names.firstNotNullOfOrNull { a.optString(it).takeIf(String::isNotBlank) }.orEmpty()
        AddressParts(sequenceOf("ISO3166-2-lvl4", "state", "province").firstNotNullOfOrNull {
            EgyptLocations.findGovernorate(a.optString(it))?.id }.orEmpty(),
            field("suburb", "city_district", "town", "village", "city", "county"), field("road", "pedestrian", "residential"))
    }
    if (parts != AddressParts()) addresses.put(key, parts)
    parts
}

internal suspend fun locateAddress(context: Context, lang: String, draft: CustomerAddress): LocatedAddress {
    val location = deviceLocation(context)
    return resolvePin(draft, location.latitude, location.longitude, native = {
        nativeAddress(context, location, lang)?.takeIf { it.countryCode.equals("EG", true) }?.let {
            AddressParts(EgyptLocations.findGovernorate(it.adminArea)?.id.orEmpty(),
                listOf(it.subLocality, it.locality, it.subAdminArea).firstOrNull { city -> !city.isNullOrBlank() }.orEmpty(),
                it.thoroughfare.orEmpty())
        }
    }, fallback = { lookupAddress(location, lang) })
}
