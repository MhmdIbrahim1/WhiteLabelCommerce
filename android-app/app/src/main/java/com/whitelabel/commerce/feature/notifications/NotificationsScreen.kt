package com.whitelabel.commerce.feature.notifications

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.rounded.Campaign
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.DoneAll
import androidx.compose.material.icons.rounded.Inventory2
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.ShoppingCart
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import com.whitelabel.commerce.core.notifications.PushIssue
import com.whitelabel.commerce.core.designsystem.components.SearchAction
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.components.BrandEmptyState
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.notifications.AppNotification

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    onBack: () -> Unit,
    onSearch: () -> Unit,
    onOpenDeepLink: (String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: NotificationsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val brandColors = LocalBrandColors.current
    var showClearAllDialog by remember { mutableStateOf(false) }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = localized("الإشعارات", "Notifications"),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = localized("رجوع", "Back"),
                        )
                    }
                },
                actions = {
                    SearchAction(onSearch)
                    IconButton(onClick = viewModel::refresh) {
                        Icon(
                            imageVector = Icons.Rounded.Refresh,
                            contentDescription = localized("تحديث", "Refresh"),
                        )
                    }
                    if (state.items.any { !it.isRead }) {
                        IconButton(onClick = viewModel::markAllAsRead) {
                            Icon(
                                imageVector = Icons.Rounded.DoneAll,
                                contentDescription = localized("تحديد الكل كمقروء", "Mark all read"),
                            )
                        }
                    }
                    if (state.items.isNotEmpty()) {
                        IconButton(onClick = { showClearAllDialog = true }) {
                            Icon(
                                imageVector = Icons.Rounded.DeleteSweep,
                                contentDescription = localized("مسح الكل", "Clear All"),
                                tint = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface,
                ),
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            state.pushIssue?.let { issue ->
                Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                    Text(when (issue) {
                        PushIssue.APP_CONFIGURATION -> localized("التنبيهات الفورية غير مُفعّلة في هذه النسخة.", "Push notifications are unavailable in this build.")
                        PushIssue.PLAY_SERVICES -> localized("تحتاج التنبيهات الفورية إلى خدمات Google Play محدّثة.", "Push notifications need up-to-date Google Play services.")
                        PushIssue.REGISTRATION -> localized("تعذر تفعيل التنبيهات الفورية. تحقق من اتصالك ثم أعد المحاولة.", "Push notifications could not be enabled. Check your connection and try again.")
                    })
                    if (issue != PushIssue.APP_CONFIGURATION) {
                        androidx.compose.material3.TextButton(onClick = viewModel::retryPush) {
                            Text(localized("إعادة المحاولة", "Retry"))
                        }
                    }
                }
            }
            if (state.isRefreshing) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }

            if (state.items.isEmpty() && !state.isRefreshing) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    BrandEmptyState(
                        icon = Icons.Outlined.NotificationsNone,
                        title = localized("لا توجد إشعارات بعد", "No notifications yet"),
                        subtitle = localized(
                            "ستظهر هنا تحديثات طلباتك وعروض المتجر وتنبيهات توفر المنتجات فور وصولها.",
                            "Order updates, store promotions, and restock alerts will appear here in real time.",
                        ),
                        actionLabel = localized("تحديث", "Refresh"),
                        onAction = viewModel::refresh,
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(state.items, key = { it.id }) { item ->
                        NotificationItemCard(
                            item = item,
                            hairlineColor = brandColors.hairline,
                            onClick = {
                                viewModel.markAsRead(item.id)
                                onOpenDeepLink(item.deepLink)
                            },
                            onDelete = {
                                viewModel.deleteNotification(item.id)
                            },
                        )
                    }
                }
            }
        }
    }

    if (showClearAllDialog) {
        AlertDialog(
            onDismissRequest = { showClearAllDialog = false },
            title = {
                Text(localized("مسح جميع الإشعارات", "Clear All Notifications"))
            },
            text = {
                Text(
                    localized(
                        "هل تريد مسح جميع الإشعارات من صندوقك؟",
                        "Do you want to remove all notifications from your inbox?",
                    ),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showClearAllDialog = false
                        viewModel.clearAll()
                    },
                ) {
                    Text(
                        text = localized("مسح الكل", "Clear All"),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { showClearAllDialog = false }) {
                    Text(localized("إلغاء", "Cancel"))
                }
            },
        )
    }
}

@Composable
private fun NotificationItemCard(
    item: AppNotification,
    hairlineColor: androidx.compose.ui.graphics.Color,
    onClick: () -> Unit,
    onDelete: () -> Unit,
) {
    val icon = when (item.category) {
        "order_update" -> Icons.Rounded.Inventory2
        "abandoned_cart" -> Icons.Rounded.ShoppingCart
        "payment_recovery", "admin_alert" -> Icons.Rounded.WarningAmber
        "back_in_stock" -> Icons.Rounded.NotificationsActive
        else -> Icons.Rounded.Campaign
    }

    Card(
        onClick = onClick,
        shape = MaterialTheme.shapes.medium,
        border = BorderStroke(
            width = 1.dp,
            color = if (item.isRead) hairlineColor else MaterialTheme.colorScheme.primary.copy(alpha = 0.45f),
        ),
        colors = CardDefaults.cardColors(
            containerColor = if (item.isRead) {
                MaterialTheme.colorScheme.surface
            } else {
                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.28f)
            },
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 14.dp, top = 12.dp, bottom = 12.dp, end = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Surface(
                shape = MaterialTheme.shapes.small,
                color = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(40.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                    )
                }
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = item.displayTitle,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = if (item.isRead) FontWeight.Medium else FontWeight.Bold,
                        modifier = Modifier.weight(1f),
                    )
                    if (!item.isRead) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.primary),
                        )
                    }
                }
                Text(
                    text = item.displayBody,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            IconButton(
                onClick = onDelete,
                modifier = Modifier.size(34.dp),
            ) {
                Icon(
                    imageVector = Icons.Rounded.DeleteOutline,
                    contentDescription = localized("حذف", "Delete"),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}
