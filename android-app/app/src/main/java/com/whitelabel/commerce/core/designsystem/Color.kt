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

private val LightWash = Color(0xFFF8FAFC)
private val LightInk = Color(0xFF17242A)
private val LightMuted = Color(0xFF4E626B)
private val LightLine = Color(0xFFD7E1E5)
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

private fun contrastingOnColor(background: Color): Color =
    if (background.luminance() > 0.42f) LightInk else Color.White

private fun adaptForDarkTheme(brandColor: Color): Color =
    if (brandColor.luminance() < 0.24f) {
        lerp(brandColor, Color.White, 0.36f)
    } else {
        brandColor
    }

fun buildLightBrandColorScheme(colors: BrandColors): ColorScheme {
    val primary = parseHexColorOrDefault(colors.primary, DefaultPrimaryHex)
    val secondary = parseHexColorOrDefault(colors.secondary, DefaultSecondaryHex)
    val surface = parseHexColorOrDefault(colors.surface, DefaultSurfaceLight)

    val primaryContainer = lerp(primary, surface, 0.86f)
    val secondaryContainer = lerp(secondary, surface, 0.86f)

    return lightColorScheme(
        primary = primary,
        onPrimary = contrastingOnColor(primary),
        primaryContainer = primaryContainer,
        onPrimaryContainer = LightInk,
        secondary = secondary,
        onSecondary = contrastingOnColor(secondary),
        secondaryContainer = secondaryContainer,
        onSecondaryContainer = LightInk,
        tertiary = secondary,
        onTertiary = contrastingOnColor(secondary),
        background = parseHexColorOrDefault(colors.page, LightWash),
        onBackground = LightInk,
        surface = surface,
        onSurface = LightInk,
        surfaceVariant = LightSurfaceVariant,
        onSurfaceVariant = LightMuted,
        surfaceContainerLowest = surface,
        surfaceContainerLow = LightWash,
        surfaceContainer = surface,
        surfaceContainerHigh = LightSurfaceVariant,
        surfaceContainerHighest = LightLine,
        outline = LightMuted,
        outlineVariant = LightLine,
        error = LightError,
        onError = Color.White,
        errorContainer = LightErrorContainer,
        onErrorContainer = LightError,
    )
}

fun buildDarkBrandColorScheme(colors: BrandColors): ColorScheme {
    val rawPrimary = parseHexColorOrDefault(colors.primary, DefaultPrimaryHex)
    val rawSecondary = parseHexColorOrDefault(colors.secondary, DefaultSecondaryHex)

    val primary = adaptForDarkTheme(rawPrimary)
    val secondary = adaptForDarkTheme(rawSecondary)
    val primaryContainer = lerp(rawPrimary, DarkSurface, 0.45f)
    val secondaryContainer = lerp(rawSecondary, DarkSurface, 0.45f)

    return darkColorScheme(
        primary = primary,
        onPrimary = contrastingOnColor(primary),
        primaryContainer = primaryContainer,
        onPrimaryContainer = DarkInk,
        secondary = secondary,
        onSecondary = contrastingOnColor(secondary),
        secondaryContainer = secondaryContainer,
        onSecondaryContainer = DarkInk,
        tertiary = secondary,
        onTertiary = contrastingOnColor(secondary),
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
            hairline = LightLine,
            primaryBrand = rawPrimary,
            secondaryAccent = rawSecondary,
            success = LightSuccess,
            warning = LightWarning,
        )
    }
}
