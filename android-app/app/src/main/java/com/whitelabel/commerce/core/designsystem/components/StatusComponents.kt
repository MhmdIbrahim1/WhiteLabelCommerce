package com.whitelabel.commerce.core.designsystem.components

import com.whitelabel.commerce.core.designsystem.localized

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
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
    val title: String,
    val icon: ImageVector,
)

private val orderTimelineSteps = listOf(
    TimelineStep(OrderStatus.PENDING, "قيد المراجعة", Icons.Rounded.Schedule),
    TimelineStep(OrderStatus.CONFIRMED, "جاري التجهيز", Icons.Rounded.Inventory),
    TimelineStep(OrderStatus.SHIPPED, "تم الشحن", Icons.Rounded.LocalShipping),
    TimelineStep(OrderStatus.DELIVERED, "تم التوصيل", Icons.Rounded.CheckCircle),
)

/**
 * Step-by-step visual order timeline (`pending -> confirmed -> shipped -> delivered`)
 * with an explicit cancelled banner when `status == CANCELLED`.
 */
@Composable
fun OrderTimelineStepper(
    currentStatus: OrderStatus,
    modifier: Modifier = Modifier,
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
                        text = localized("في حال وجود أي استفسار يرجى التواصل مع فريق الدعم.", "Contact support if you have questions."),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
        return
    }

    val activeIndex = orderTimelineSteps.indexOfFirst { it.status == currentStatus }.coerceAtLeast(0)

    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top,
    ) {
        orderTimelineSteps.forEachIndexed { index, step ->
            val isCompleted = index < activeIndex
            val isCurrent = index == activeIndex
            val circleColor: Color = when {
                isCompleted -> brandColors.success
                isCurrent -> MaterialTheme.colorScheme.primary
                else -> MaterialTheme.colorScheme.surfaceVariant
            }
            val iconTint: Color = when {
                isCompleted || isCurrent -> Color.White
                else -> MaterialTheme.colorScheme.onSurfaceVariant
            }

            Column(
                modifier = Modifier.weight(1f),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Leading connector
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(2.5.dp)
                            .background(
                                when {
                                    index == 0 -> Color.Transparent
                                    index <= activeIndex -> brandColors.success
                                    else -> brandColors.hairline
                                },
                            ),
                    )
                    // Step node
                    Box(
                        modifier = Modifier
                            .size(30.dp)
                            .clip(CircleShape)
                            .background(circleColor)
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
                        Icon(
                            imageVector = if (isCompleted) Icons.Rounded.Check else step.icon,
                            contentDescription = step.status.arabicLabel,
                            tint = iconTint,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                    // Trailing connector
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(2.5.dp)
                            .background(
                                when {
                                    index == orderTimelineSteps.lastIndex -> Color.Transparent
                                    index < activeIndex -> brandColors.success
                                    else -> brandColors.hairline
                                },
                            ),
                    )
                }

                Spacer(modifier = Modifier.height(6.dp))

                Text(
                    text = step.status.arabicLabel,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = if (isCurrent || isCompleted) FontWeight.SemiBold else FontWeight.Normal,
                    color = if (isCurrent) {
                        MaterialTheme.colorScheme.primary
                    } else if (isCompleted) {
                        MaterialTheme.colorScheme.onSurface
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                )
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
