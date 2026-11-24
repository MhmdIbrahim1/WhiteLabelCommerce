package com.whitelabel.commerce.core.designsystem

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * Dynamically derives the Material 3 [Shapes] scale from `store_settings.border_radius`
 * (default `12dp` from `brand-config.json`), clamping to a safe visual range `0..28dp`.
 */
fun buildBrandShapes(borderRadiusDp: Int): Shapes {
    val base = borderRadiusDp.coerceIn(0, 28)
    if (base == 0) {
        val sharp = RoundedCornerShape(0.dp)
        return Shapes(
            extraSmall = sharp,
            small = sharp,
            medium = sharp,
            large = sharp,
            extraLarge = sharp,
        )
    }

    return Shapes(
        extraSmall = RoundedCornerShape((base * 0.5f).coerceAtLeast(4f).dp),
        small = RoundedCornerShape((base * 0.75f).coerceAtLeast(6f).dp),
        medium = RoundedCornerShape(base.dp),
        large = RoundedCornerShape((base * 1.33f).coerceAtMost(28f).dp),
        extraLarge = RoundedCornerShape((base * 1.75f).coerceAtMost(32f).dp),
    )
}
