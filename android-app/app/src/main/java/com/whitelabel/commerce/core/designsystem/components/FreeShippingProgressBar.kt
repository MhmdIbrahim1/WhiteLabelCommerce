package com.whitelabel.commerce.core.designsystem.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Celebration
import androidx.compose.material.icons.rounded.LocalShipping
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.formatPrice
import com.whitelabel.commerce.core.designsystem.localized

@Composable
fun FreeShippingProgressBar(
    enabled: Boolean,
    threshold: Double,
    subtotal: Double,
    currency: String,
    locale: String,
    modifier: Modifier = Modifier,
) {
    if (!enabled || threshold <= 0.0) return

    val brandColors = LocalBrandColors.current
    val remaining = (threshold - subtotal).coerceAtLeast(0.0)
    val unlocked = remaining <= 0.0
    val rawProgress = (subtotal / threshold).toFloat().coerceIn(0f, 1f)
    val animatedProgress by animateFloatAsState(
        targetValue = rawProgress,
        animationSpec = tween(durationMillis = 420, easing = FastOutSlowInEasing),
        label = "freeShippingProgress",
    )
    val accentColor by animateColorAsState(
        targetValue = if (unlocked) brandColors.success else MaterialTheme.colorScheme.primary,
        animationSpec = tween(durationMillis = 300),
        label = "freeShippingAccent",
    )
    val bgColor by animateColorAsState(
        targetValue = if (unlocked) {
            brandColors.success.copy(alpha = 0.12f)
        } else {
            MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.42f)
        },
        animationSpec = tween(durationMillis = 300),
        label = "freeShippingBg",
    )
    val pct = (rawProgress * 100f).toInt().coerceIn(0, 100)

    Surface(
        color = bgColor,
        shape = MaterialTheme.shapes.medium,
        border = BorderStroke(1.dp, accentColor.copy(alpha = 0.35f)),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Surface(
                    shape = CircleShape,
                    color = accentColor.copy(alpha = 0.16f),
                    contentColor = accentColor,
                    modifier = Modifier.size(32.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = if (unlocked) Icons.Rounded.Celebration else Icons.Rounded.LocalShipping,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }

                Text(
                    text = if (unlocked) {
                        localized(
                            "مبروك! حصلت على شحن مجاني على طلبك",
                            "Congrats! You unlocked Free Shipping",
                        )
                    } else {
                        val remStr = formatPrice(remaining, currency, locale)
                        localized(
                            "أضف منتجات بقيمة $remStr إضافية للحصول على شحن مجاني",
                            "Add $remStr more to unlock Free Shipping",
                        )
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = if (unlocked) brandColors.success else MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )

                Text(
                    text = "$pct%",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = accentColor,
                )
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.10f)),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(fraction = animatedProgress)
                        .fillMaxHeight()
                        .clip(RoundedCornerShape(999.dp))
                        .background(accentColor),
                )
            }
        }
    }
}
