package com.whitelabel.commerce.core.designsystem.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.whitelabel.commerce.core.designsystem.LocalStoreSettings
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.FlashSalePricing
import kotlinx.coroutines.delay

val FlashRoseColor = Color(0xFFBE123C)
val FlashPillBgColor = Color(0xFF1E293B)
val FlashPillBorderColor = Color(0x4DF43F5E)

/**
 * Calm, zero-jitter Flash Sale countdown pill with an isolated 1-second ticker so
 * parent product grids/lists never recompose on tick. Uses tabular digits (`tnum`)
 * and forces LTR on the time segment so seconds align cleanly in both AR (RTL) and EN (LTR).
 */
@Composable
fun FlashSaleCountdownPill(
    endsAt: String?,
    startsAt: String? = null,
    modifier: Modifier = Modifier,
    compact: Boolean = true,
    showLabel: Boolean = false,
    onExpired: () -> Unit = {},
) {
    if (endsAt.isNullOrBlank()) return
    val isRtl = LocalStoreSettings.current.isRtl

    var remainingMs by remember(endsAt, startsAt) {
        mutableLongStateOf(FlashSalePricing.remainingMillis(endsAt))
    }

    LaunchedEffect(endsAt, startsAt) {
        while (true) {
            val now = System.currentTimeMillis()
            val startsMs = FlashSalePricing.parseIsoTimestampMillis(startsAt)
            if (startsMs != null && now < startsMs) {
                remainingMs = 0L
                break
            }
            val left = FlashSalePricing.remainingMillis(endsAt, now)
            remainingMs = left
            if (left <= 0L) {
                onExpired()
                break
            }
            delay(1_000L)
        }
    }

    if (remainingMs <= 0L) return

    val formatted = FlashSalePricing.formatCountdown(remainingMs, isRtl = isRtl)

    Surface(
        color = FlashPillBgColor,
        contentColor = Color(0xFFF8FAFC),
        shape = CircleShape,
        border = BorderStroke(1.dp, FlashPillBorderColor),
        modifier = modifier,
    ) {
        Row(
            modifier = Modifier.padding(
                horizontal = if (compact) 7.dp else 11.dp,
                vertical = if (compact) 3.dp else 5.dp,
            ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(if (compact) 4.dp else 6.dp),
        ) {
            Icon(
                imageVector = Icons.Rounded.Schedule,
                contentDescription = null,
                tint = Color(0xFFFDA4AF),
                modifier = Modifier.size(if (compact) 12.dp else 14.dp),
            )
            if (showLabel) {
                Text(
                    text = localized("ينتهي خلال", "Ends in"),
                    style = if (compact) MaterialTheme.typography.labelSmall else MaterialTheme.typography.labelMedium,
                    color = Color(0xFFE2E8F0),
                )
            }
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Text(
                    text = formatted,
                    style = (if (compact) MaterialTheme.typography.labelSmall else MaterialTheme.typography.labelMedium).copy(
                        fontFeatureSettings = "tnum",
                        fontWeight = FontWeight.Bold,
                    ),
                    color = Color(0xFFF8FAFC),
                    maxLines = 1,
                    softWrap = false,
                )
            }
        }
    }
}
