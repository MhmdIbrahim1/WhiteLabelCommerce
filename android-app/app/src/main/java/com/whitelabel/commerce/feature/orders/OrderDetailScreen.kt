package com.whitelabel.commerce.feature.orders

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.AssignmentReturn
import androidx.compose.material.icons.rounded.AccountBalanceWallet
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.Inventory2
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Phone
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.SupportAgent
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import com.whitelabel.commerce.core.designsystem.components.SearchAction
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.components.ColorSwatchMapper
import com.whitelabel.commerce.core.designsystem.components.OrderStatusBadge
import com.whitelabel.commerce.core.designsystem.components.OrderTimelineStepper
import com.whitelabel.commerce.core.designsystem.formatPrice
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.Order
import com.whitelabel.commerce.core.domain.model.OrderStatus
import com.whitelabel.commerce.core.domain.model.ReturnReasons
import com.whitelabel.commerce.core.domain.model.ReturnRefundMethod
import com.whitelabel.commerce.core.domain.model.ReturnRequest
import com.whitelabel.commerce.core.domain.model.ReturnRequestStatus
import com.whitelabel.commerce.core.domain.model.ReturnRequestType
import com.whitelabel.commerce.core.domain.model.ReturnSubmissionItem
import com.whitelabel.commerce.core.domain.model.StoreSettings

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderDetailScreen(
    orderId: String,
    onBack: () -> Unit,
    onSearch: () -> Unit,
    onOpenSupport: (orderId: String) -> Unit,
    onOpenAccount: () -> Unit,
    onShowMessage: (String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: OrdersViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val brandColors = LocalBrandColors.current
    var showReturnSheet by remember { mutableStateOf(false) }

    LaunchedEffect(orderId) {
        viewModel.loadOrderDetail(orderId)
    }

    val order = state.tracking.detailOrder
        ?: state.tracking.accountOrders.firstOrNull { it.id.equals(orderId, ignoreCase = true) }
    val returnReq = state.tracking.detailReturnRequest
        ?: state.tracking.returnsByOrderId[orderId]

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = localized("تفاصيل الطلب #${orderId.take(8)}", "Order #${orderId.take(8)}"),
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
                    IconButton(onClick = { viewModel.loadOrderDetail(orderId) }) {
                        Icon(
                            imageVector = Icons.Rounded.Refresh,
                            contentDescription = localized("تحديث", "Refresh"),
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        when {
            state.tracking.isLoadingDetail && order == null -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            }

            order == null -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                        .padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = localized("تعذر العثور على تفاصيل هذا الطلب.", "Could not load details for this order."),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(onClick = onBack) {
                        Text(localized("العودة إلى طلباتي", "Back to My Orders"))
                    }
                }
            }

            else -> {
                val locale = state.storeSettings.locale
                val canRequestReturn = order.status == OrderStatus.DELIVERED &&
                    order.items.isNotEmpty() &&
                    (returnReq == null || !returnReq.isActive)

                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    // 1. Order Status & Timeline Card
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            border = BorderStroke(1.dp, brandColors.hairline),
                            shape = MaterialTheme.shapes.medium,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(
                                modifier = Modifier.padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column {
                                        Text(
                                            text = localized("طلب #${order.id.take(8)}", "Order #${order.id.take(8)}"),
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.Bold,
                                        )
                                        Text(
                                            text = formatOrderDate(order.createdAt),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    OrderStatusBadge(status = order.status)
                                }

                                OrderTimelineStepper(currentStatus = order.status)

                                if (order.shippingAddress.isNotBlank() || !order.phone.isNullOrBlank()) {
                                    HorizontalDivider(color = brandColors.hairline)
                                    order.phone?.takeIf { it.isNotBlank() }?.let { phone ->
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        ) {
                                            Icon(
                                                imageVector = Icons.Rounded.Phone,
                                                contentDescription = null,
                                                modifier = Modifier.size(16.dp),
                                                tint = MaterialTheme.colorScheme.primary,
                                            )
                                            Text(text = phone, style = MaterialTheme.typography.bodySmall)
                                        }
                                    }
                                    Row(
                                        verticalAlignment = Alignment.Top,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        Icon(
                                            imageVector = Icons.Rounded.LocationOn,
                                            contentDescription = null,
                                            modifier = Modifier.size(16.dp),
                                            tint = MaterialTheme.colorScheme.primary,
                                        )
                                        Text(
                                            text = order.shippingAddress,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // 2. Returns & Exchanges Status Card / CTA
                    if (returnReq != null || canRequestReturn) {
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                returnReq?.let { req ->
                                    ReturnRequestStatusCard(
                                        returnRequest = req,
                                        currency = order.currency,
                                        locale = locale,
                                        walletBalance = state.tracking.refreshedWalletBalance,
                                        onOpenWallet = onOpenAccount,
                                    )
                                }

                                if (canRequestReturn) {
                                    OutlinedButton(
                                        onClick = {
                                            viewModel.clearReturnError()
                                            showReturnSheet = true
                                        },
                                        shape = MaterialTheme.shapes.medium,
                                        border = BorderStroke(1.2.dp, MaterialTheme.colorScheme.primary),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(48.dp),
                                    ) {
                                        Icon(
                                            imageVector = Icons.AutoMirrored.Rounded.AssignmentReturn,
                                            contentDescription = null,
                                            modifier = Modifier.size(18.dp),
                                        )
                                        Text(
                                            text = localized("طلب إرجاع أو استبدال", "Request Return or Exchange"),
                                            fontWeight = FontWeight.Bold,
                                            modifier = Modifier.padding(start = 8.dp),
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // 3. Order Items & Totals Breakdown
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            border = BorderStroke(1.dp, brandColors.hairline),
                            shape = MaterialTheme.shapes.medium,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(
                                modifier = Modifier.padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Text(
                                    text = localized("منتجات الطلب", "Order Items"),
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold,
                                )
                                order.items.forEach { line ->
                                    val variant = listOfNotNull(
                                        line.size,
                                        line.color?.let(ColorSwatchMapper::displayLabel),
                                    ).joinToString(" • ")
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.Top,
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = "${line.quantity} × ${line.productName}",
                                                style = MaterialTheme.typography.bodyMedium,
                                                fontWeight = FontWeight.SemiBold,
                                            )
                                            if (variant.isNotEmpty()) {
                                                Text(
                                                    text = variant,
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                )
                                            }
                                        }
                                        Text(
                                            text = formatPrice(line.lineTotal, order.currency, locale),
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }
                                }

                                HorizontalDivider(color = brandColors.hairline)

                                order.subtotal?.let { sub ->
                                    SummaryAmountRow(
                                        label = localized("قيمة المنتجات", "Subtotal"),
                                        value = formatPrice(sub, order.currency, locale),
                                    )
                                }
                                SummaryAmountRow(
                                    label = localized("الشحن", "Shipping"),
                                    value = if (order.shippingFee == 0.0) {
                                        localized("مجاني", "Free")
                                    } else {
                                        formatPrice(order.shippingFee, order.currency, locale)
                                    },
                                )
                                if (order.walletDiscount > 0.0) {
                                    SummaryAmountRow(
                                        label = localized("خصم المحفظة", "Wallet Credit Used"),
                                        value = "-${formatPrice(order.walletDiscount, order.currency, locale)}",
                                        valueColor = brandColors.success,
                                    )
                                }
                                order.total?.let { grand ->
                                    HorizontalDivider(color = brandColors.hairline)
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                    ) {
                                        Text(
                                            text = localized("الإجمالي", "Total"),
                                            style = MaterialTheme.typography.titleSmall,
                                            fontWeight = FontWeight.Bold,
                                        )
                                        Text(
                                            text = formatPrice(grand, order.currency, locale),
                                            style = MaterialTheme.typography.titleMedium,
                                            color = MaterialTheme.colorScheme.primary,
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // 4. Support Shortcut
                    item {
                        OutlinedButton(
                            onClick = { onOpenSupport(order.id) },
                            shape = MaterialTheme.shapes.small,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.SupportAgent,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                            )
                            Text(
                                text = localized("تواصل مع الدعم بخصوص هذا الطلب", "Contact Support About This Order"),
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        }
                    }
                }

                if (showReturnSheet) {
                    ReturnRequestBottomSheet(
                        order = order,
                        storeSettings = state.storeSettings,
                        isSubmitting = state.tracking.isSubmittingReturn,
                        errorMessage = state.tracking.returnSubmitError,
                        onDismiss = {
                            if (!state.tracking.isSubmittingReturn) {
                                showReturnSheet = false
                            }
                        },
                        onSubmit = { type, refundMethod, reason, notes, items ->
                            viewModel.submitReturnRequest(
                                orderId = order.id,
                                requestType = type,
                                refundMethod = refundMethod,
                                reason = reason,
                                customerNotes = notes,
                                items = items,
                                onSuccess = {
                                    showReturnSheet = false
                                    onShowMessage(
                                        localized(
                                            "تم إرسال طلب الإرجاع بنجاح وجارٍ مراجعته.",
                                            "Your return request has been submitted for review.",
                                        ),
                                    )
                                },
                            )
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun SummaryAmountRow(
    label: String,
    value: String,
    valueColor: Color = MaterialTheme.colorScheme.onSurface,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold,
            color = valueColor,
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ReturnRequestStatusCard(
    returnRequest: ReturnRequest,
    currency: String,
    locale: String,
    walletBalance: Double? = null,
    onOpenWallet: (() -> Unit)? = null,
) {
    val brandColors = LocalBrandColors.current
    val statusColors = when (returnRequest.status) {
        ReturnRequestStatus.REFUNDED -> brandColors.success.copy(alpha = 0.14f) to brandColors.success
        ReturnRequestStatus.REJECTED -> MaterialTheme.colorScheme.errorContainer to MaterialTheme.colorScheme.error
        ReturnRequestStatus.APPROVED, ReturnRequestStatus.RECEIVED ->
            MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.primary
        ReturnRequestStatus.PENDING ->
            MaterialTheme.colorScheme.secondaryContainer to MaterialTheme.colorScheme.secondary
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.2.dp, statusColors.second.copy(alpha = 0.38f)),
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(
                        imageVector = if (returnRequest.requestType == ReturnRequestType.EXCHANGE) {
                            Icons.Rounded.SwapHoriz
                        } else {
                            Icons.AutoMirrored.Rounded.AssignmentReturn
                        },
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp),
                    )
                    Column {
                        Text(
                            text = if (returnRequest.requestType == ReturnRequestType.EXCHANGE) {
                                localized("طلب استبدال #${returnRequest.id.take(8)}", "Exchange Request #${returnRequest.id.take(8)}")
                            } else {
                                localized("طلب إرجاع #${returnRequest.id.take(8)}", "Return Request #${returnRequest.id.take(8)}")
                            },
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = formatOrderDate(returnRequest.createdAt),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Surface(
                    color = statusColors.first,
                    contentColor = statusColors.second,
                    shape = MaterialTheme.shapes.extraSmall,
                ) {
                    Text(
                        text = returnRequest.status.label,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    )
                }
            }

            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.65f),
                    shape = MaterialTheme.shapes.extraSmall,
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            imageVector = if (returnRequest.refundMethod == ReturnRefundMethod.WALLET) {
                                Icons.Rounded.AccountBalanceWallet
                            } else {
                                Icons.Rounded.CreditCard
                            },
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = MaterialTheme.colorScheme.primary,
                        )
                        Text(
                            text = returnRequest.refundMethod.label,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }

                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f),
                    shape = MaterialTheme.shapes.extraSmall,
                ) {
                    Text(
                        text = localized(
                            "قيمة الاسترداد: ${formatPrice(returnRequest.refundAmount, currency, locale)}",
                            "Refund: ${formatPrice(returnRequest.refundAmount, currency, locale)}",
                        ),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }

                if (returnRequest.walletCredited) {
                    Surface(
                        color = brandColors.success.copy(alpha = 0.14f),
                        contentColor = brandColors.success,
                        shape = MaterialTheme.shapes.extraSmall,
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.CheckCircle,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp),
                            )
                            Text(
                                text = localized("أُودع في المحفظة", "Credited to Wallet"),
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                }

                if (returnRequest.restocked) {
                    Surface(
                        color = MaterialTheme.colorScheme.secondaryContainer,
                        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                        shape = MaterialTheme.shapes.extraSmall,
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Inventory2,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp),
                            )
                            Text(
                                text = localized("تم استلام المنتجات", "Items Received"),
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }
            }

            Text(
                text = localized("السبب: ", "Reason: ") + ReturnReasons.localize(returnRequest.reason),
                style = MaterialTheme.typography.bodySmall,
            )

            if (returnRequest.items.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    returnRequest.items.forEach { item ->
                        val variant = listOfNotNull(
                            item.size,
                            item.color?.let(ColorSwatchMapper::displayLabel),
                        ).joinToString(" • ")
                        Text(
                            text = "• ${item.quantity} × ${item.productName}" +
                                if (variant.isNotEmpty()) " ($variant)" else "",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            returnRequest.adminNotes?.takeIf { it.isNotBlank() }?.let { note ->
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(10.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Text(
                            text = localized("رد إدارة المتجر", "Merchant Response"),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Text(
                            text = note,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }

            if (returnRequest.walletCredited && walletBalance != null && onOpenWallet != null) {
                Surface(
                    onClick = onOpenWallet,
                    color = brandColors.success.copy(alpha = 0.1f),
                    shape = MaterialTheme.shapes.small,
                    border = BorderStroke(1.dp, brandColors.success.copy(alpha = 0.3f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = localized(
                                "رصيد محفظتك الحالي: ${formatPrice(walletBalance, currency, locale)}",
                                "Current Wallet Balance: ${formatPrice(walletBalance, currency, locale)}",
                            ),
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = brandColors.success,
                        )
                        Text(
                            text = localized("عرض المحفظة", "View Wallet"),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun ReturnRequestBottomSheet(
    order: Order,
    storeSettings: StoreSettings,
    isSubmitting: Boolean,
    errorMessage: String?,
    onDismiss: () -> Unit,
    onSubmit: (
        type: ReturnRequestType,
        refundMethod: ReturnRefundMethod,
        reason: String,
        notes: String?,
        items: List<ReturnSubmissionItem>,
    ) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val brandColors = LocalBrandColors.current
    var requestType by remember { mutableStateOf(ReturnRequestType.RETURN) }
    var refundMethod by remember { mutableStateOf(ReturnRefundMethod.WALLET) }
    var selectedReasonCode by remember { mutableStateOf(ReturnReasons.presets.first().code) }
    var customerNotes by remember { mutableStateOf("") }
    val selectedQuantities = remember(order.id) {
        mutableStateMapOf<String, Int>().apply {
            order.items.forEach { put(it.id, it.quantity) }
        }
    }

    val estimatedRefund = order.items.sumOf { item ->
        val qty = selectedQuantities[item.id] ?: 0
        qty * item.unitPrice
    }
    val totalSelectedPieces = selectedQuantities.values.sum()

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        CompositionLocalProvider(
            LocalLayoutDirection provides if (storeSettings.isRtl) LayoutDirection.Rtl else LayoutDirection.Ltr,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(
                            text = localized("طلب إرجاع أو استبدال", "Request Return or Exchange"),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "#${order.id.take(8)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(onClick = onDismiss, enabled = !isSubmitting) {
                        Icon(
                            imageVector = Icons.Rounded.Close,
                            contentDescription = localized("إغلاق", "Close"),
                        )
                    }
                }

                // 1. Request Type
                Text(
                    text = localized("1. نوع الطلب", "1. Request Type"),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    ReturnRequestType.entries.forEach { typeOpt ->
                        val selected = requestType == typeOpt
                        FilterChip(
                            selected = selected,
                            onClick = { requestType = typeOpt },
                            label = { Text(typeOpt.label, fontWeight = FontWeight.SemiBold) },
                            leadingIcon = {
                                Icon(
                                    imageVector = if (typeOpt == ReturnRequestType.EXCHANGE) {
                                        Icons.Rounded.SwapHoriz
                                    } else {
                                        Icons.AutoMirrored.Rounded.AssignmentReturn
                                    },
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp),
                                )
                            },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }

                // 2. Items & Quantities
                Text(
                    text = localized("2. اختر المنتجات والكميات", "2. Select Items & Quantities"),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                )
                order.items.forEach { item ->
                    val qty = selectedQuantities[item.id] ?: 0
                    val isChecked = qty > 0
                    Surface(
                        color = if (isChecked) {
                            MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.25f)
                        } else {
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
                        },
                        shape = MaterialTheme.shapes.small,
                        border = BorderStroke(
                            1.dp,
                            if (isChecked) MaterialTheme.colorScheme.primary.copy(alpha = 0.45f) else brandColors.hairline,
                        ),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 8.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Checkbox(
                                checked = isChecked,
                                onCheckedChange = { checked ->
                                    selectedQuantities[item.id] = if (checked) item.quantity else 0
                                },
                            )
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = item.productName,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Text(
                                    text = formatPrice(item.unitPrice, order.currency, storeSettings.locale),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                IconButton(
                                    onClick = { selectedQuantities[item.id] = (qty - 1).coerceAtLeast(0) },
                                    enabled = qty > 0,
                                    modifier = Modifier.size(30.dp),
                                ) {
                                    Icon(Icons.Rounded.Remove, contentDescription = null, modifier = Modifier.size(16.dp))
                                }
                                Text(
                                    text = "$qty/${item.quantity}",
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Bold,
                                )
                                IconButton(
                                    onClick = { selectedQuantities[item.id] = (qty + 1).coerceAtMost(item.quantity) },
                                    enabled = qty < item.quantity,
                                    modifier = Modifier.size(30.dp),
                                ) {
                                    Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }
                }

                // 3. Refund Method
                Text(
                    text = localized("3. طريقة الاسترداد", "3. Refund Method"),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                )
                ReturnRefundMethod.entries.forEach { method ->
                    val isSelected = refundMethod == method
                    Surface(
                        color = if (isSelected) {
                            MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f)
                        } else {
                            MaterialTheme.colorScheme.surface
                        },
                        shape = MaterialTheme.shapes.small,
                        border = BorderStroke(
                            width = if (isSelected) 1.5.dp else 1.dp,
                            color = if (isSelected) MaterialTheme.colorScheme.primary else brandColors.hairline,
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .selectable(
                                selected = isSelected,
                                role = Role.RadioButton,
                                onClick = { refundMethod = method },
                            ),
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            RadioButton(selected = isSelected, onClick = null)
                            Icon(
                                imageVector = if (method == ReturnRefundMethod.WALLET) {
                                    Icons.Rounded.AccountBalanceWallet
                                } else {
                                    Icons.Rounded.CreditCard
                                },
                                contentDescription = null,
                                tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = method.label,
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(
                                    text = if (method == ReturnRefundMethod.WALLET) {
                                        localized("إيداع فوري في رصيد محفظتك بالمتجر.", "Instant credit added to your store wallet.")
                                    } else {
                                        localized("استرداد عبر وسيلة الدفع الأصلية بعد المراجعة.", "Refunded to your original payment method after review.")
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }

                // 4. Reason Chips
                Text(
                    text = localized("4. سبب الطلب", "4. Reason"),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                )
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    ReturnReasons.presets.forEach { reasonOpt ->
                        FilterChip(
                            selected = selectedReasonCode == reasonOpt.code,
                            onClick = { selectedReasonCode = reasonOpt.code },
                            label = { Text(reasonOpt.label, style = MaterialTheme.typography.labelMedium) },
                        )
                    }
                }

                OutlinedTextField(
                    value = customerNotes,
                    onValueChange = { if (it.length <= 1000) customerNotes = it },
                    label = { Text(localized("ملاحظات إضافية (اختياري)", "Additional notes (optional)")) },
                    minLines = 2,
                    maxLines = 4,
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier.fillMaxWidth(),
                )

                errorMessage?.let { err ->
                    Text(
                        text = err,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = localized(
                                "الاسترداد التقديري ($totalSelectedPieces قطعة)",
                                "Estimated Refund ($totalSelectedPieces items)",
                            ),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = formatPrice(estimatedRefund, order.currency, storeSettings.locale),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }

                Button(
                    onClick = {
                        val payload = order.items.mapNotNull { item ->
                            val q = selectedQuantities[item.id] ?: 0
                            if (q > 0) ReturnSubmissionItem(orderItemId = item.id, quantity = q) else null
                        }
                        onSubmit(
                            requestType,
                            refundMethod,
                            selectedReasonCode,
                            customerNotes.trim().ifEmpty { null },
                            payload,
                        )
                    },
                    enabled = !isSubmitting && totalSelectedPieces > 0,
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                ) {
                    if (isSubmitting) {
                        CircularProgressIndicator(
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.size(18.dp),
                        )
                    } else {
                        Text(
                            text = localized("إرسال طلب الإرجاع", "Submit Request"),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }
    }
}
