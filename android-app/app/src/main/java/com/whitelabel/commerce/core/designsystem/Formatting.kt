package com.whitelabel.commerce.core.designsystem

import java.text.NumberFormat
import java.util.Locale

/**
 * Formats monetary values cleanly using the merchant's configured currency (e.g. `250 ج.م` or `250 EGP`).
 */
fun formatPrice(
    amount: Double,
    currencyCode: String,
    localeTag: String = "ar-EG",
    arabicLabels: Boolean = arabicLanguage.value && localeTag.startsWith("ar", ignoreCase = true),
): String {
    val formattedNumber = NumberFormat.getNumberInstance(Locale.US).apply {
        minimumFractionDigits = if (amount % 1.0 == 0.0) 0 else 2
        maximumFractionDigits = 2
    }.format(amount)

    val label = if (arabicLabels) {
        when (currencyCode.uppercase(Locale.US)) {
            "EGP" -> "ج.م"
            "SAR" -> "ر.س"
            "AED" -> "د.إ"
            "KWD" -> "د.ك"
            "QAR" -> "ر.ق"
            "USD" -> "$"
            else -> currencyCode.uppercase(Locale.US)
        }
    } else {
        currencyCode.uppercase(Locale.US)
    }
    return "$formattedNumber $label"
}
