package com.whitelabel.commerce.core.designsystem

import java.text.NumberFormat
import java.util.Locale

/**
 * Formats monetary values cleanly using the merchant's configured currency (e.g. `250 ج.م` or `250 EGP`).
 */
fun formatPrice(amount: Double, currencyCode: String, localeTag: String = "ar-EG"): String {
    val formattedNumber = NumberFormat.getNumberInstance(Locale.US).apply {
        minimumFractionDigits = if (amount % 1.0 == 0.0) 0 else 2
        maximumFractionDigits = 2
    }.format(amount)

    val label = if (arabicLanguage.value && localeTag.startsWith("ar", ignoreCase = true)) {
        when (currencyCode.uppercase(Locale.US)) {
            "EGP" -> localized("ج.م", "EGP")
            "SAR" -> localized("ر.س", "SAR")
            "AED" -> localized("د.إ", "AED")
            "KWD" -> localized("د.ك", "KWD")
            "QAR" -> localized("ر.ق", "QAR")
            "USD" -> "$"
            else -> currencyCode.uppercase(Locale.US)
        }
    } else {
        currencyCode.uppercase(Locale.US)
    }
    return "$formattedNumber $label"
}
