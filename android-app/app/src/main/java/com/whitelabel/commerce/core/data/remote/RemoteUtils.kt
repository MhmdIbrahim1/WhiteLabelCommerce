package com.whitelabel.commerce.core.data.remote

import kotlin.coroutines.cancellation.CancellationException

/**
 * Coroutine-safe [runCatching] that always rethrows [CancellationException].
 */
internal inline fun <T> runSuspendCatching(block: () -> T): Result<T> = try {
    Result.success(block())
} catch (cancellation: CancellationException) {
    throw cancellation
} catch (throwable: Throwable) {
    if (com.whitelabel.commerce.BuildConfig.DEBUG) {
        android.util.Log.w("CommerceData", "Request failed (${throwable.javaClass.simpleName})")
    }
    Result.failure(throwable)
}

/**
 * Normalizes customer phone numbers (converting Arabic-Indic digits to ASCII and
 * stripping formatting characters) to match the `^[0-9]{8,15}$` constraint in
 * `public.store_checkout` and `public.track_guest_order`, with Egyptian mobile helpers.
 */
object PhoneNormalizer {
    private val generalPhoneRegex = Regex("^[0-9]{8,15}$")
    private val egyptLocalRegex = Regex("^01[0125][0-9]{8}$")
    private val egyptIntlRegex = Regex("^201[0125][0-9]{8}$")

    fun normalize(raw: String): String {
        val sb = StringBuilder(raw.length)
        for (ch in raw) {
            when (ch) {
                in '0'..'9' -> sb.append(ch)
                in '\u0660'..'\u0669' -> sb.append(('0'.code + (ch.code - '\u0660'.code)).toChar())
                in '\u06F0'..'\u06F9' -> sb.append(('0'.code + (ch.code - '\u06F0'.code)).toChar())
            }
        }
        val digits = sb.toString()
        // Convert `00201...` to `201...` and `+20 01...` -> `201...`
        return when {
            digits.startsWith("0020") && digits.length >= 14 -> digits.removePrefix("00")
            digits.startsWith("2001") && digits.length == 13 -> "20" + digits.substring(3)
            else -> digits
        }
    }

    /**
     * Normalizes Egyptian numbers into canonical local 11-digit (`01XXXXXXXXX`) or
     * international 12-digit (`201XXXXXXXXX`) form accepted by `store_checkout`.
     */
    fun normalizeForEgyptCheckout(raw: String): String {
        val digits = normalize(raw)
        return when {
            egyptIntlRegex.matches(digits) -> "0" + digits.removePrefix("20")
            else -> digits
        }
    }

    fun isValid(normalized: String): Boolean = generalPhoneRegex.matches(normalized)

    fun isValidEgyptianPhone(raw: String): Boolean {
        val normalized = normalize(raw)
        return egyptLocalRegex.matches(normalized) || egyptIntlRegex.matches(normalized)
    }

    fun formatWhatsAppDigits(raw: String): String {
        val digits = normalize(raw)
        return when {
            egyptLocalRegex.matches(digits) -> "20" + digits.removePrefix("0")
            else -> digits
        }
    }
}
