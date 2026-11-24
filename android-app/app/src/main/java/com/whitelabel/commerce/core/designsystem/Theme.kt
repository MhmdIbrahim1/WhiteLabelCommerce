package com.whitelabel.commerce.core.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import com.whitelabel.commerce.core.domain.model.StoreSettings

val LocalStoreSettings = staticCompositionLocalOf { StoreSettings() }

val LocalBrandColors = staticCompositionLocalOf {
    buildExtendedBrandColors(StoreSettings().colors, darkTheme = false)
}

/**
 * Root theme for the white-label native Android app.
 *
 * - Applies the 60-30-10 color system (Light & Dark) dynamically from [storeSettings].
 * - Derives Material 3 [androidx.compose.material3.Shapes] from [StoreSettings.borderRadius].
 * - Uses `IBM Plex Sans Arabic` typography across all text styles.
 * - Enforces [LayoutDirection.Rtl] whenever the store locale is RTL (default `ar-EG`).
 */
@Composable
fun WhiteLabelCommerceTheme(
    storeSettings: StoreSettings = StoreSettings(),
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = remember(storeSettings.colors, darkTheme) {
        if (darkTheme) {
            buildDarkBrandColorScheme(storeSettings.colors)
        } else {
            buildLightBrandColorScheme(storeSettings.colors)
        }
    }

    val extendedColors = remember(storeSettings.colors, darkTheme) {
        buildExtendedBrandColors(storeSettings.colors, darkTheme = darkTheme)
    }

    val shapes = remember(storeSettings.borderRadius) {
        buildBrandShapes(storeSettings.borderRadius)
    }

    val layoutDirection = if (storeSettings.isRtl) LayoutDirection.Rtl else LayoutDirection.Ltr

    CompositionLocalProvider(
        LocalLayoutDirection provides layoutDirection,
        LocalStoreSettings provides storeSettings,
        LocalBrandColors provides extendedColors,
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            shapes = shapes,
            typography = WhiteLabelTypography,
            content = content,
        )
    }
}
