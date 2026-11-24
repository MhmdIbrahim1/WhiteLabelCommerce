package com.whitelabel.commerce.core.designsystem.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Cancel
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Inventory
import androidx.compose.material.icons.rounded.LocalShipping
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.OrderStatus
import com.whitelabel.commerce.core.domain.model.TicketStatus

@Composable
fun OrderStatusBadge(
    status: OrderStatus,
    modifier: Modifier = Modifier,
) {
    val brandColors = LocalBrandColors.current
    val (bg, fg) = when (status) {
        OrderStatus.PENDING -> MaterialTheme.colorScheme.secondaryContainer to MaterialTheme.colorScheme.secondary
        OrderStatus.CONFIRMED -> MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.primary
        OrderStatus.SHIPPED -> MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.primary
        OrderStatus.DELIVERED -> brandColors.success.copy(alpha = 0.14f) to brandColors.success
        OrderStatus.CANCELLED -> MaterialTheme.colorScheme.errorContainer to MaterialTheme.colorScheme.error
    }

    Surface(
        modifier = modifier,
        color = bg,
        contentColor = fg,
        shape = MaterialTheme.shapes.extraSmall,
    ) {
        Text(
            text = status.arabicLabel,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
        )
    }
}

@Composable
fun TicketStatusBadge(
    status: TicketStatus,
    modifier: Modifier = Modifier,
) {
    val brandColors = LocalBrandColors.current
    val (bg, fg) = when (status) {
        TicketStatus.OPEN -> MaterialTheme.colorScheme.secondaryContainer to MaterialTheme.colorScheme.secondary
        TicketStatus.IN_PROGRESS -> MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.primary
        TicketStatus.CLOSED -> brandColors.success.copy(alpha = 0.14f) to brandColors.success
    }
    Surface(
        modifier = modifier,
        color = bg,
        contentColor = fg,
        shape = MaterialTheme.shapes.extraSmall,
    ) {
        Text(
            text = status.arabicLabel,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
        )
    }
}

private data class TimelineStep(
    val status: OrderStatus,
    val labelAr: String,
    val labelEn: String,
    val icon: ImageVector,
)

private val orderTimelineSteps = listOf(
    TimelineStep(OrderStatus.PENDING, "قيد الانتظار", "Pending", Icons.Rounded.Schedule),
    TimelineStep(OrderStatus.CONFIRMED, "قيد التجهيز", "Processing", Icons.Rounded.Inventory),
    TimelineStep(OrderStatus.SHIPPED, "تم الشحن", "Shipped", Icons.Rounded.LocalShipping),
    TimelineStep(OrderStatus.DELIVERED, "تم التوصيل", "Delivered", Icons.Rounded.CheckCircle),
)

/**
 * Fluid animated Order Status Tracker (`Pending -> Processing -> Shipped -> Delivered`)
 * featuring:
 * - `animateFloatAsState` smooth progress bar track fill
 * - `rememberInfiniteTransition` soft pulsing glow halo around the active stage icon
 * - Animated checkmark transitions for completed steps
 * - Optional Bosta / carrier tracking pill
 * - Dedicated Cancelled state banner
 */
@Composable
fun OrderTimelineStepper(
    currentStatus: OrderStatus,
    modifier: Modifier = Modifier,
    carrier: String? = null,
    trackingNumber: String? = null,
) {
    val brandColors = LocalBrandColors.current

    if (currentStatus == OrderStatus.CANCELLED) {
        Surface(
            modifier = modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.errorContainer,
            contentColor = MaterialTheme.colorScheme.onErrorContainer,
            shape = MaterialTheme.shapes.small,
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Icon(
                    imageVector = Icons.Rounded.Cancel,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error,
                )
                Column {
                    Text(
                        text = localized("تم إلغاء الطلب", "Order cancelled"),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = localized(
                            "في حال وجود أي استفسار يرجى التواصل مع فريق الدعم.",
                            "Contact support if you have questions.",
                        ),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
        return
    }

    val activeIndex = orderTimelineSteps.indexOfFirst { it.status == currentStatus }.coerceAtLeast(0)
    val targetFraction = activeIndex.toFloat() / (orderTimelineSteps.size - 1).coerceAtLeast(1)
    val animatedProgress by animateFloatAsState(
        targetValue = targetFraction,
        animationSpec = tween(durationMillis = 650, easing = FastOutSlowInEasing),
        label = "order_tracker_progress",
    )

    val pulseTransition = rememberInfiniteTransition(label = "order_active_pulse")
    val pulseScale by pulseTransition.animateFloat(
        initialValue = 1.0f,
        targetValue = 1.48f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "pulse_scale",
    )
    val pulseAlpha by pulseTransition.animateFloat(
        initialValue = 0.45f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "pulse_alpha",
    )

    val primaryColor = MaterialTheme.colorScheme.primary
    val successColor = brandColors.success

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 6.dp),
        ) {
            // Animated continuous progress track centered behind the 4 step nodes
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 36.dp)
                    .padding(top = 18.dp)
                    .height(4.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(brandColors.hairline),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(animatedProgress.coerceIn(0f, 1f))
                        .fillMaxHeight()
                        .clip(RoundedCornerShape(999.dp))
                        .background(
                            Brush.horizontalGradient(
                                colors = listOf(successColor, primaryColor),
                            ),
                        ),
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top,
            ) {
                orderTimelineSteps.forEachIndexed { index, step ->
                    val isCompleted = index < activeIndex ||
                        (currentStatus == OrderStatus.DELIVERED && index == activeIndex)
                    val isCurrent = index == activeIndex && currentStatus != OrderStatus.DELIVERED

                    val nodeBg = when {
                        isCompleted -> successColor
                        isCurrent -> primaryColor
                        else -> MaterialTheme.colorScheme.surfaceVariant
                    }
                    val iconTint = when {
                        isCompleted || isCurrent -> Color.White
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    }

                    Column(
                        modifier = Modifier.weight(1f),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Box(
                            modifier = Modifier.size(40.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            if (isCurrent) {
                                Box(
                                    modifier = Modifier
                                        .size(34.dp)
                                        .scale(pulseScale)
                                        .alpha(pulseAlpha)
                                        .clip(CircleShape)
                                        .background(primaryColor),
                                )
                            }

                            Box(
                                modifier = Modifier
                                    .size(32.dp)
                                    .clip(CircleShape)
                                    .background(nodeBg)
                                    .then(
                                        if (isCurrent) {
                                            Modifier.border(
                                                width = 2.dp,
                                                color = MaterialTheme.colorScheme.primaryContainer,
                                                shape = CircleShape,
                                            )
                                        } else {
                                            Modifier
                                        },
                                    ),
                                contentAlignment = Alignment.Center,
                            ) {
                                AnimatedContent(
                                    targetState = isCompleted,
                                    transitionSpec = {
                                        (fadeIn(tween(220)) + scaleIn(initialScale = 0.7f))
                                            .togetherWith(fadeOut(tween(150)))
                                    },
                                    label = "step_icon_${step.status.rawValue}",
                                ) { completed ->
                                    Icon(
                                        imageVector = if (completed) Icons.Rounded.Check else step.icon,
                                        contentDescription = localized(step.labelAr, step.labelEn),
                                        tint = iconTint,
                                        modifier = Modifier.size(16.dp),
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(4.dp))

                        Text(
                            text = localized(step.labelAr, step.labelEn),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = if (isCurrent || isCompleted) FontWeight.Bold else FontWeight.Normal,
                            color = when {
                                isCurrent -> primaryColor
                                isCompleted -> MaterialTheme.colorScheme.onSurface
                                else -> MaterialTheme.colorScheme.onSurfaceVariant
                            },
                            textAlign = TextAlign.Center,
                            maxLines = 2,
                        )
                    }
                }
            }
        }

        val localizedCarrier = CarrierLocalizer.displayCarrier(carrier)
        if (!localizedCarrier.isNullOrBlank() || !trackingNumber.isNullOrBlank()) {
            Surface(
                color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f),
                shape = RoundedCornerShape(999.dp),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.LocalShipping,
                        contentDescription = null,
                        tint = primaryColor,
                        modifier = Modifier.size(14.dp),
                    )
                    Text(
                        text = listOfNotNull(localizedCarrier, trackingNumber?.takeIf { it.isNotBlank() })
                            .joinToString(" • "),
                        style = MaterialTheme.typography.labelSmall,
                        color = primaryColor,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

@Composable
fun BrandEmptyState(
    icon: ImageVector,
    title: String,
    subtitle: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Surface(
            color = MaterialTheme.colorScheme.primaryContainer,
            shape = CircleShape,
            modifier = Modifier.size(64.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(30.dp),
                )
            }
        }
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center,
        )
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        if (actionLabel != null && onAction != null) {
            Spacer(modifier = Modifier.height(4.dp))
            Button(
                onClick = onAction,
                shape = MaterialTheme.shapes.small,
            ) {
                Text(actionLabel)
            }
        }
    }
}
