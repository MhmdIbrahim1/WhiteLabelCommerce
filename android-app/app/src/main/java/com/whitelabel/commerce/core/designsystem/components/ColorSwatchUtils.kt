package com.whitelabel.commerce.core.designsystem.components

import androidx.compose.ui.graphics.Color
import com.whitelabel.commerce.core.designsystem.parseHexColorOrDefault

/**
 * Resolves merchant-defined color names (Arabic, English, or `#RRGGBB` hex) into visual swatch colors.
 */
object ColorSwatchMapper {
    private val knownColors: Map<String, Color> = mapOf(
        // Arabic color names
        "أسود" to Color(0xFF18181B),
        "اسود" to Color(0xFF18181B),
        "أبيض" to Color(0xFFFAFAFA),
        "ابيض" to Color(0xFFFAFAFA),
        "رمادي" to Color(0xFF71717A),
        "رصاصي" to Color(0xFF71717A),
        "أحمر" to Color(0xFFDC2626),
        "احمر" to Color(0xFFDC2626),
        "نبيتي" to Color(0xFF881337),
        "عنابي" to Color(0xFF881337),
        "أزرق" to Color(0xFF2563EB),
        "ازرق" to Color(0xFF2563EB),
        "كحلي" to Color(0xFF1E3A5F),
        "سماوي" to Color(0xFF0EA5E9),
        "أخضر" to Color(0xFF16A34A),
        "اخضر" to Color(0xFF16A34A),
        "زيتي" to Color(0xFF4D5D3B),
        "أصفر" to Color(0xFFEAB308),
        "اصفر" to Color(0xFFEAB308),
        "برتقالي" to Color(0xFFEA580C),
        "بني" to Color(0xFF78350F),
        "بيج" to Color(0xFFD6C7AE),
        "كريمي" to Color(0xFFF5EFE6),
        "وردي" to Color(0xFFEC4899),
        "زهري" to Color(0xFFF472B6),
        "بنفسجي" to Color(0xFF7C3AED),
        "موف" to Color(0xFF9333EA),
        "ذهبي" to Color(0xFFD97706),
        "فضي" to Color(0xFFA1A1AA),
        // English color names
        "black" to Color(0xFF18181B),
        "white" to Color(0xFFFAFAFA),
        "gray" to Color(0xFF71717A),
        "grey" to Color(0xFF71717A),
        "red" to Color(0xFFDC2626),
        "burgundy" to Color(0xFF881337),
        "maroon" to Color(0xFF7F1D1D),
        "blue" to Color(0xFF2563EB),
        "navy" to Color(0xFF1E3A5F),
        "teal" to Color(0xFF0F766E),
        "cyan" to Color(0xFF06B6D4),
        "green" to Color(0xFF16A34A),
        "olive" to Color(0xFF4D5D3B),
        "yellow" to Color(0xFFEAB308),
        "orange" to Color(0xFFEA580C),
        "brown" to Color(0xFF78350F),
        "beige" to Color(0xFFD6C7AE),
        "cream" to Color(0xFFF5EFE6),
        "pink" to Color(0xFFEC4899),
        "purple" to Color(0xFF7C3AED),
        "gold" to Color(0xFFD97706),
        "silver" to Color(0xFFA1A1AA),
    )

    fun displayLabel(label: String): String = when (label.trim().lowercase()) {
        "black", "أسود", "اسود" -> com.whitelabel.commerce.core.designsystem.localized("أسود", "Black")
        "white", "أبيض", "ابيض" -> com.whitelabel.commerce.core.designsystem.localized("أبيض", "White")
        "gray", "رمادي", "رصاصي", "grey" -> com.whitelabel.commerce.core.designsystem.localized("رمادي", "Gray")
        "red", "أحمر", "احمر" -> com.whitelabel.commerce.core.designsystem.localized("أحمر", "Red")
        "burgundy", "نبيتي", "عنابي" -> com.whitelabel.commerce.core.designsystem.localized("نبيتي", "Burgundy")
        "blue", "أزرق", "ازرق" -> com.whitelabel.commerce.core.designsystem.localized("أزرق", "Blue")
        "navy", "كحلي" -> com.whitelabel.commerce.core.designsystem.localized("كحلي", "Navy")
        "sky blue", "سماوي" -> com.whitelabel.commerce.core.designsystem.localized("سماوي", "Sky blue")
        "green", "أخضر", "اخضر" -> com.whitelabel.commerce.core.designsystem.localized("أخضر", "Green")
        "olive", "زيتي" -> com.whitelabel.commerce.core.designsystem.localized("زيتي", "Olive")
        "yellow", "أصفر", "اصفر" -> com.whitelabel.commerce.core.designsystem.localized("أصفر", "Yellow")
        "orange", "برتقالي" -> com.whitelabel.commerce.core.designsystem.localized("برتقالي", "Orange")
        "brown", "بني" -> com.whitelabel.commerce.core.designsystem.localized("بني", "Brown")
        "beige", "بيج" -> com.whitelabel.commerce.core.designsystem.localized("بيج", "Beige")
        "cream", "كريمي" -> com.whitelabel.commerce.core.designsystem.localized("كريمي", "Cream")
        "pink", "وردي", "زهري" -> com.whitelabel.commerce.core.designsystem.localized("وردي", "Pink")
        "purple", "بنفسجي" -> com.whitelabel.commerce.core.designsystem.localized("بنفسجي", "Purple")
        "mauve", "موف" -> com.whitelabel.commerce.core.designsystem.localized("موف", "Mauve")
        "gold", "ذهبي" -> com.whitelabel.commerce.core.designsystem.localized("ذهبي", "Gold")
        "silver", "فضي" -> com.whitelabel.commerce.core.designsystem.localized("فضي", "Silver")
        "teal", "فيروزي" -> com.whitelabel.commerce.core.designsystem.localized("فيروزي", "Teal")
        "cyan", "سيان" -> com.whitelabel.commerce.core.designsystem.localized("سيان", "Cyan")
        "maroon", "خمري" -> com.whitelabel.commerce.core.designsystem.localized("خمري", "Maroon")
        else -> label
    }

    fun resolveOrNull(label: String): Color? {
        val clean = label.trim()
        if (clean.isEmpty()) return null
        if (clean.startsWith("#")) {
            val sentinel = Color(0x01020304)
            val parsed = parseHexColorOrDefault(clean, sentinel)
            return parsed.takeIf { it != sentinel }
        }
        return knownColors[clean.lowercase()]
    }
}
