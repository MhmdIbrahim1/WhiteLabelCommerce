package com.whitelabel.commerce.core.designsystem

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import com.whitelabel.commerce.core.domain.model.BrandColors

// Default 60-30-10 palette matching `shared/brand-config.json` and `web-store/src/app/(shop)/shop.css`.
val DefaultPrimaryHex = Color(0xFF164E63)
val DefaultSecondaryHex = Color(0xFFC2410C)
val DefaultSurfaceLight = Color(0xFFFFFFFF)

private val LightWash = Color(0xFFF6F8F9)
private val LightInk = Color(0xFF17242A)
private val LightMuted = Color(0xFF4E626B)
private val LightLine = Color(0xFFDCE5E7)
private val LightSurfaceVariant = Color(0xFFEEF3F6)

private val DarkWash = Color(0xFF101A20)
private val DarkSurface = Color(0xFF18252C)
private val DarkSurfaceVariant = Color(0xFF21323B)
private val DarkInk = Color(0xFFF3F6F8)
private val DarkMuted = Color(0xFFC0CDD4)
private val DarkLine = Color(0xFF40505A)

private val LightError = Color(0xFFB91C1C)
private val LightErrorContainer = Color(0xFFFEE2E2)
private val DarkError = Color(0xFFF87171)
private val DarkErrorContainer = Color(0xFF450A0A)

private val LightSuccess = Color(0xFF15803D)
private val DarkSuccess = Color(0xFF4ADE80)
private val LightWarning = Color(0xFFB45309)
private val DarkWarning = Color(0xFFFBBF24)

/**
 * Semantic 60-30-10 brand tokens exposed alongside Material 3 [ColorScheme].
 */
@Immutable
data class BrandExtendedColors(
    val wash: Color,
    val surfaceCard: Color,
    val ink: Color,
    val mutedInk: Color,
    val hairline: Color,
    val primaryBrand: Color,
    val secondaryAccent: Color,
    val success: Color,
    val warning: Color,
)

fun parseHexColorOrDefault(raw: String?, fallback: Color): Color {
    val cleaned = raw?.trim()?.removePrefix("#").orEmpty()
    if (cleaned.isEmpty()) return fallback
    return runCatching {
        val argbLong = when (cleaned.length) {
            3 -> {
                val r = cleaned[0]
                val g = cleaned[1]
                val b = cleaned[2]
                "FF$r$r$g$g$b$b".toLong(16)
            }
            6 -> "FF$cleaned".toLong(16)
            8 -> cleaned.toLong(16)
            else -> return fallback
        }
        Color(argbLong.toInt())
    }.getOrDefault(fallback)
}

private fun contrast(a: Color, b: Color): Float {
    val first = a.luminance()
    val second = b.luminance()
    return (maxOf(first, second) + 0.05f) / (minOf(first, second) + 0.05f)
}

private data class ControlColors(val fill: Color, val ink: Color)

// Same WCAG foreground selection and one-channel-step adjustment as the storefront.
private fun controlColors(accent: Color): ControlColors {
    val matte = Color(0xFF0B0B0C)
    val ink = if (contrast(accent, Color.White) >= contrast(accent, matte)) Color.White else matte
    val step = (if (ink == Color.White) -1f else 1f) / 255f
    var fill = accent.copy(alpha = 1f)
    while (contrast(fill, ink) < 4.5f) {
        fill = fill.copy(
            red = (fill.red + step).coerceIn(0f, 1f),
            green = (fill.green + step).coerceIn(0f, 1f),
            blue = (fill.blue + step).coerceIn(0f, 1f),
        )
    }
    return ControlColors(fill, ink)
}

private fun adaptForDarkTheme(brandColor: Color): Color {
    var color = brandColor
    while (contrast(color, DarkSurface) < 4.5f) {
        color = lerp(color, Color.White, 0.1f)
    }
    return color
}

fun buildLightBrandColorScheme(colors: BrandColors): ColorScheme {
    val primary = parseHexColorOrDefault(colors.primary, DefaultPrimaryHex)
    val secondary = parseHexColorOrDefault(colors.secondary, DefaultSecondaryHex)
    val surface = parseHexColorOrDefault(colors.surface, DefaultSurfaceLight)
    val page = parseHexColorOrDefault(colors.page, LightWash)
    val line = parseHexColorOrDefault(colors.line, LightLine)
    val primaryControl = controlColors(primary)
    val secondaryControl = controlColors(secondary)

    val primaryContainer = lerp(primary, surface, 0.86f)
    val secondaryContainer = lerp(secondary, surface, 0.86f)

    return lightColorScheme(
        primary = primaryControl.fill,
        onPrimary = primaryControl.ink,
        primaryContainer = primaryContainer,
        onPrimaryContainer = LightInk,
        secondary = secondaryControl.fill,
        onSecondary = secondaryControl.ink,
        secondaryContainer = secondaryContainer,
        onSecondaryContainer = LightInk,
        tertiary = secondaryControl.fill,
        onTertiary = secondaryControl.ink,
        background = page,
        onBackground = LightInk,
        surface = surface,
        onSurface = LightInk,
        surfaceVariant = LightSurfaceVariant,
        onSurfaceVariant = LightMuted,
        surfaceContainerLowest = surface,
        surfaceContainerLow = page,
        surfaceContainer = surface,
        surfaceContainerHigh = LightSurfaceVariant,
        surfaceContainerHighest = line,
        outline = LightMuted,
        outlineVariant = line,
        error = LightError,
        onError = Color.White,
        errorContainer = LightErrorContainer,
        onErrorContainer = LightError,
    )
}

fun buildDarkBrandColorScheme(colors: BrandColors): ColorScheme {
    val rawPrimary = parseHexColorOrDefault(colors.primary, DefaultPrimaryHex)
    val rawSecondary = parseHexColorOrDefault(colors.secondary, DefaultSecondaryHex)

    val primary = controlColors(adaptForDarkTheme(rawPrimary))
    val secondary = controlColors(adaptForDarkTheme(rawSecondary))
    val primaryContainer = lerp(rawPrimary, DarkSurface, 0.45f)
    val secondaryContainer = lerp(rawSecondary, DarkSurface, 0.45f)

    return darkColorScheme(
        primary = primary.fill,
        onPrimary = primary.ink,
        primaryContainer = primaryContainer,
        onPrimaryContainer = DarkInk,
        secondary = secondary.fill,
        onSecondary = secondary.ink,
        secondaryContainer = secondaryContainer,
        onSecondaryContainer = DarkInk,
        tertiary = secondary.fill,
        onTertiary = secondary.ink,
        background = DarkWash,
        onBackground = DarkInk,
        surface = DarkSurface,
        onSurface = DarkInk,
        surfaceVariant = DarkSurfaceVariant,
        onSurfaceVariant = DarkMuted,
        surfaceContainerLowest = DarkWash,
        surfaceContainerLow = DarkSurface,
        surfaceContainer = DarkSurface,
        surfaceContainerHigh = DarkSurfaceVariant,
        surfaceContainerHighest = DarkLine,
        outline = DarkMuted,
        outlineVariant = DarkLine,
        error = DarkError,
        onError = DarkWash,
        errorContainer = DarkErrorContainer,
        onErrorContainer = DarkError,
    )
}

fun buildExtendedBrandColors(colors: BrandColors, darkTheme: Boolean): BrandExtendedColors {
    val rawPrimary = parseHexColorOrDefault(colors.primary, DefaultPrimaryHex)
    val rawSecondary = parseHexColorOrDefault(colors.secondary, DefaultSecondaryHex)
    val rawSurface = parseHexColorOrDefault(colors.surface, DefaultSurfaceLight)

    return if (darkTheme) {
        BrandExtendedColors(
            wash = DarkWash,
            surfaceCard = DarkSurface,
            ink = DarkInk,
            mutedInk = DarkMuted,
            hairline = DarkLine,
            primaryBrand = adaptForDarkTheme(rawPrimary),
            secondaryAccent = adaptForDarkTheme(rawSecondary),
            success = DarkSuccess,
            warning = DarkWarning,
        )
    } else {
        BrandExtendedColors(
            wash = parseHexColorOrDefault(colors.page, LightWash),
            surfaceCard = rawSurface,
            ink = LightInk,
            mutedInk = LightMuted,
            hairline = parseHexColorOrDefault(colors.line, LightLine),
            primaryBrand = rawPrimary,
            secondaryAccent = rawSecondary,
            success = LightSuccess,
            warning = LightWarning,
        )
    }
}
