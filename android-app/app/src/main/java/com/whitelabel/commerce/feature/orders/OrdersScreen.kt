package com.whitelabel.commerce.feature.orders

import com.whitelabel.commerce.core.domain.model.formatOrderNumber
import com.whitelabel.commerce.core.domain.model.HistoryFilter
import com.whitelabel.commerce.core.domain.model.OrderCardSummary
import androidx.compose.material3.FilterChip
import com.whitelabel.commerce.core.designsystem.components.BannerFeedback
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.AccountBalanceWallet
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.LocalShipping
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Replay
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.SupportAgent
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.whitelabel.commerce.core.data.remote.PhoneNormalizer
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.components.BrandEmptyState
import com.whitelabel.commerce.core.designsystem.components.CarrierLocalizer
import com.whitelabel.commerce.core.designsystem.components.ColorSwatchMapper
import com.whitelabel.commerce.core.designsystem.components.OrderStatusBadge
import com.whitelabel.commerce.core.designsystem.components.OrderTimelineStepper
import com.whitelabel.commerce.core.designsystem.formatPrice
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.Order
import com.whitelabel.commerce.core.domain.model.OrderStatus
import com.whitelabel.commerce.core.domain.model.PaymentMethod
import com.whitelabel.commerce.core.domain.model.SavedOrderReceipt
import com.whitelabel.commerce.core.domain.model.StoreSettings
import com.whitelabel.commerce.feature.checkout.PaymentFlow
import com.whitelabel.commerce.feature.checkout.PaymentFlowOutcome
import com.whitelabel.commerce.feature.checkout.orderIneligibleMessage
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay

data class OrderRetrySelection(
    val orderId: String,
    val orderPhone: String,
    val currentMethod: String,
)

private data class ActiveRetrySession(
    val orderId: String,
    val orderPhone: String,
    val method: String,
    val walletPhone: String,
)

internal fun formatOrderDate(raw: String?): String {
    val clean = raw?.trim().orEmpty()
    if (clean.length >= 10 && clean[4] == '-' && clean[7] == '-') {
        return clean.substring(0, 10)
    }
    return clean.take(10)
}

@Composable
fun OrdersScreen(
    initialOrderNumber: String?,
    initialPhone: String?,
    initialPaymentOutcome: PaymentFlowOutcome?,
    onConsumePrefill: () -> Unit,
    initialRetry: OrderRetrySelection? = null,
    onConsumeRetry: () -> Unit = {},
    onOpenOrderDetail: (orderId: String) -> Unit = {},
    onOpenSupport: (orderId: String?) -> Unit,
    onOpenAccount: () -> Unit = {},
    onShowMessage: (String) -> Unit,
    onShowActionMessage: (message: String, actionLabel: String, onAction: () -> Unit) -> Unit = { msg, _, _ -> onShowMessage(msg) },
    modifier: Modifier = Modifier,
    viewModel: OrdersViewModel = hiltViewModel(),
) {
    val state = viewModel.uiState.collectAsStateWithLifecycle().value
    val brandColors = LocalBrandColors.current
    val clipboard = LocalClipboardManager.current
    var pendingRetryChooser by remember { mutableStateOf<OrderRetrySelection?>(null) }
    var activeRetrySession by remember { mutableStateOf<ActiveRetrySession?>(null) }
    var paymentBanner by remember { mutableStateOf<PaymentFlowOutcome?>(null) }
    var paymentBannerOrderId by remember { mutableStateOf<String?>(null) }
    var showGuestCodSignInPrompt by remember { mutableStateOf(false) }

    LaunchedEffect(initialRetry) {
        if (initialRetry != null) {
            pendingRetryChooser = initialRetry
            onConsumeRetry()
        }
    }

    val enabledOnlineMethods = remember(state.storeSettings) {
        state.storeSettings.paymentMethods.filter { it == PaymentMethod.CARD || it == PaymentMethod.WALLET }
    }
    val retryMethods = remember(state.storeSettings) {
        buildList {
            if (PaymentMethod.CARD in state.storeSettings.paymentMethods) add(PaymentMethod.CARD)
            if (PaymentMethod.WALLET in state.storeSettings.paymentMethods) add(PaymentMethod.WALLET)
            if (state.storeSettings.codEnabled) add(PaymentMethod.COD)
        }
    }

    // Full-screen in-app WebView when retrying a pending/failed Paymob order
    activeRetrySession?.let { session ->
        PaymentFlow(
            id = session.orderId,
            phone = session.orderPhone,
            method = session.method,
            initialWallet = session.walletPhone,
            onExit = { outcome ->
                activeRetrySession = null
                paymentBanner = outcome
                paymentBannerOrderId = session.orderId
                viewModel.prefillAndTrack(session.orderId, session.orderPhone)
                viewModel.loadAccountOrders()
            },
        )
        return
    }

    val onlineReceipts = state.localReceipts.filter {
        it.method in setOf("paymob_card", "paymob_wallet") && it.paymentStatus in setOf("unpaid", "pending")
    }
    LaunchedEffect(onlineReceipts.map { it.orderNumber }) {
        if (onlineReceipts.isEmpty()) return@LaunchedEffect
        launch { com.whitelabel.commerce.core.data.remote.runSuspendCatching { viewModel.observePayments(onlineReceipts) } }
        for (waitMs in listOf(0L, 2500L, 5000L, 10000L, 20000L, 40000L)) {
            delay(waitMs)
            viewModel.refreshPayments(onlineReceipts)
        }
    }

    LaunchedEffect(initialOrderNumber, initialPhone, initialPaymentOutcome) {
        if (initialPaymentOutcome != null) {
            paymentBanner = initialPaymentOutcome
            paymentBannerOrderId = initialOrderNumber
        }
        if (!initialOrderNumber.isNullOrBlank() && !initialPhone.isNullOrBlank()) {
            viewModel.prefillAndTrack(initialOrderNumber, initialPhone)
            onConsumePrefill()
        } else if (initialPaymentOutcome != null) {
            onConsumePrefill()
        }
    }

    var showLookup by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf(false) }
    val visibleReceipts = remember(state.localReceipts, state.tracking.accountOrders, state.tracking.filter) {
        val cloud = state.tracking.accountOrders.mapTo(hashSetOf()) { it.id.lowercase() }
        state.localReceipts.filter { it.orderNumber.lowercase() !in cloud && state.tracking.filter.accepts(it.status) }
    }
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // 0. Payment Confirmation / Retry Status Banner
        paymentBanner?.let { outcome ->
            item {
                val receipt = state.localReceipts.firstOrNull { it.orderNumber == paymentBannerOrderId }
                val tracked = state.tracking.trackedResult?.takeIf { it.id == paymentBannerOrderId }
                val resolvedOutcome = if (outcome == PaymentFlowOutcome.PENDING) {
                    when (receipt?.paymentStatus ?: tracked?.paymentStatus) {
                        "paid" -> PaymentFlowOutcome.SUCCESS
                        "failed" -> PaymentFlowOutcome.FAILED
                        "cod_pending" -> PaymentFlowOutcome.SWITCHED_TO_COD
                        else -> outcome
                    }
                } else outcome
                PaymentOutcomeBanner(
                    outcome = resolvedOutcome,
                    onDismiss = { paymentBanner = null },
                )
            }
        }

        if (showGuestCodSignInPrompt && !state.isSignedIn) {
            item {
                Surface(
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                    shape = MaterialTheme.shapes.medium,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.secondary.copy(alpha = 0.35f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.ErrorOutline,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.secondary,
                                modifier = Modifier.size(22.dp),
                            )
                            Text(
                                text = localized(
                                    "سجّل الدخول أولاً لتغيير طريقة الدفع",
                                    "Please sign in first to switch payment method",
                                ),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.weight(1f),
                            )
                            IconButton(
                                onClick = { showGuestCodSignInPrompt = false },
                                modifier = Modifier.size(28.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Close,
                                    contentDescription = localized("إغلاق", "Dismiss"),
                                    modifier = Modifier.size(18.dp),
                                )
                            }
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End,
                        ) {
                            Button(
                                onClick = {
                                    showGuestCodSignInPrompt = false
                                    onOpenAccount()
                                },
                                shape = MaterialTheme.shapes.small,
                            ) {
                                Text(localized("تسجيل الدخول", "Sign In"))
                            }
                        }
                    }
                }
            }
        }

        item(key = "history-filters") {
            androidx.compose.foundation.lazy.LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                items(HistoryFilter.entries.size, key = { HistoryFilter.entries[it].param }) { i ->
                    val filter = HistoryFilter.entries[i]
                    FilterChip(selected = state.tracking.filter == filter, onClick = { viewModel.chooseFilter(filter) },
                        label = { Text(localized(filter.ar, filter.en)) })
                }
            }
        }
        items(state.tracking.accountOrders, key = { accountListKey(it.id) }) { order ->
            HistoryCard(order, state.storeSettings.locale) { onOpenOrderDetail(order.id) }
        }
        if (state.tracking.hasMore || state.tracking.pageError) item(key = "order-page") {
            OutlinedButton(onClick = { viewModel.loadAccountOrders(append = state.tracking.hasMore) }, enabled = !state.tracking.isLoadingAccountOrders) {
                Text(if (state.tracking.pageError) localized("إعادة المحاولة","Try again") else localized("الطلبات السابقة","Older orders"))
            }
        }
        item(key = "guest-lookup-toggle") {
            TextButton(onClick = { showLookup = !showLookup }) { Text(localized("تتبع طلب زائر","Track a guest order")) }
        }
        if (showLookup) {
        // 1. Order Tracking Lookup Card
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
                        text = localized("تتبع طلبك", "Track your order"),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = localized(
                            "أدخل رقم الطلب ورقم الهاتف المستخدم عند الشراء لمعرفة الحالة المباشرة.",
                            "Enter your order number and the phone number used at checkout.",
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    OutlinedTextField(
                        value = state.tracking.orderNumberInput,
                        onValueChange = viewModel::onOrderNumberChange,
                        label = { Text(localized("رقم الطلب", "Order number")) },
                        placeholder = { Text("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx") },
                        singleLine = true,
                        shape = MaterialTheme.shapes.small,
                        modifier = Modifier.fillMaxWidth(),
                    )

                    OutlinedTextField(
                        value = state.tracking.phoneInput,
                        onValueChange = viewModel::onPhoneChange,
                        label = { Text(localized("رقم الهاتف", "Phone number")) },
                        placeholder = { Text("010xxxxxxxx") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        shape = MaterialTheme.shapes.small,
                        modifier = Modifier.fillMaxWidth(),
                    )

                    state.tracking.trackingError?.let { BannerFeedback(it) }

                    Button(
                        onClick = viewModel::trackOrder,
                        enabled = !state.tracking.isTracking,
                        shape = MaterialTheme.shapes.small,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(46.dp),
                    ) {
                        if (state.tracking.isTracking) {
                            CircularProgressIndicator(
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary,
                                modifier = Modifier.size(18.dp),
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Rounded.Search,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                            )
                            Text(
                                text = localized("تتبع حالة الطلب", "Track order"),
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        }
                    }
                }
            }
        }

        }
        // 2. Live Tracked Order Result + Timeline
        state.tracking.trackedResult?.let { tracked ->
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.5.dp, MaterialTheme.colorScheme.primary),
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
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = localized("نتيجة التتبع المباشر", "Live tracking"),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(
                                    text = "${formatOrderNumber(tracked.id)} • ${formatOrderDate(tracked.createdAt)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            OrderStatusBadge(status = tracked.status)
                        }

                        PaymentAndShippingSummary(
                            paymentStatus = tracked.paymentStatus,
                            fulfillmentStatus = tracked.status,
                            reservationExpiresAt = tracked.reservationExpiresAt ?: state.matchedReceiptForTracked?.reservationExpiresAt,
                            paymentReview = tracked.paymentReview ?: state.matchedReceiptForTracked?.paymentReview,
                            method = tracked.method,
                            carrier = tracked.carrier,
                            trackingNumber = tracked.trackingNumber,
                            hasOnlinePaymentEnabled = enabledOnlineMethods.isNotEmpty(),
                            onCopyTracking = { code ->
                                clipboard.setText(AnnotatedString(code))
                                onShowMessage(localized("تم نسخ رقم الشحنة", "Tracking number copied"))
                            },
                            onRetryPayment = {
                                pendingRetryChooser = OrderRetrySelection(
                                    orderId = tracked.id,
                                    orderPhone = state.tracking.phoneInput,
                                    currentMethod = tracked.method,
                                )
                            },
                        )

                        OrderTimelineStepper(currentStatus = tracked.status)

                        state.matchedReceiptForTracked?.let { matched ->
                            HorizontalDivider(color = brandColors.hairline)
                            ItemizedReceiptRows(
                                receipt = matched,
                                locale = state.storeSettings.locale,
                            )
                        }

                        OutlinedButton(
                            onClick = { onOpenSupport(tracked.id) },
                            shape = MaterialTheme.shapes.small,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.SupportAgent,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                            )
                            Text(
                                text = localized("تواصل بخصوص هذا الطلب", "Ask about this order"),
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        }
                    }
                }
            }
        }

        // 4. Local Saved Orders History (DataStore)
        if (visibleReceipts.isNotEmpty()) {
            item {
                Text(
                    text = localized(
                        "سجل طلباتي على هذا الجهاز (${state.localReceipts.size})",
                        "Orders on this device (${state.localReceipts.size})",
                    ),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
            }

            items(visibleReceipts, key = { receiptListKey(it.orderNumber) }) { receipt ->
                SavedReceiptCard(
                    receipt = receipt,
                    locale = state.storeSettings.locale,
                    isRefreshing = state.tracking.refreshingOrderNumber == receipt.orderNumber,
                    hasOnlinePaymentEnabled = enabledOnlineMethods.isNotEmpty(),
                    onRefreshStatus = { viewModel.refreshLocalReceiptStatus(receipt) },
                    onCopyOrderId = {
                        clipboard.setText(AnnotatedString(receipt.orderNumber))
                        onShowMessage(localized("تم نسخ رقم الطلب", "Order number copied"))
                    },
                    onCopyTracking = { code ->
                        clipboard.setText(AnnotatedString(code))
                        onShowMessage(localized("تم نسخ رقم الشحنة", "Tracking number copied"))
                    },
                    onRetryPayment = {
                        pendingRetryChooser = OrderRetrySelection(
                            orderId = receipt.orderNumber,
                            orderPhone = receipt.phone,
                            currentMethod = receipt.method,
                        )
                    },
                    onContactSupport = { onOpenSupport(receipt.orderNumber) },
                )
            }
        }

        // 6. Empty State
        if (!state.tracking.isLoadingAccountOrders && visibleReceipts.isEmpty() && state.tracking.accountOrders.isEmpty() && state.tracking.trackedResult == null) {
            item {
                BrandEmptyState(
                    icon = Icons.AutoMirrored.Outlined.ReceiptLong,
                    title = localized("لا توجد طلبات في هذه القائمة", "No orders in this view"),
                    subtitle = localized(
                        "ستجد هنا الطلبات المطابقة للحالة المحددة.",
                        "Orders matching the selected status will appear here.",
                    ),
                )
            }
        }
    }

    // Payment Method Chooser Bottom Sheet for "إعادة محاولة الدفع / Retry Payment" (Card + Wallet + COD)
    pendingRetryChooser?.let { selection ->
        RetryPaymentMethodSheet(
            storeSettings = state.storeSettings,
            enabledMethods = retryMethods,
            initialMethod = selection.currentMethod,
            defaultPhone = selection.orderPhone,
            onDismiss = { pendingRetryChooser = null },
            onConfirm = { chosenMethod, walletPhone ->
                pendingRetryChooser = null
                if (chosenMethod == PaymentMethod.COD) {
                    viewModel.switchOrderToCod(selection.orderId, selection.orderPhone) { outcome ->
                        when (outcome) {
                            SwitchToCodOutcome.Success -> {
                                showGuestCodSignInPrompt = false
                                paymentBanner = PaymentFlowOutcome.SWITCHED_TO_COD
                                onShowMessage(
                                    localized(
                                        "تم تحويل الطلب إلى الدفع عند الاستلام بنجاح",
                                        "Order switched to Cash on Delivery",
                                    ),
                                )
                            }
                            SwitchToCodOutcome.RequiresSignIn -> {
                                showGuestCodSignInPrompt = true
                                onShowActionMessage(
                                    localized(
                                        "سجّل الدخول أولاً لتغيير طريقة الدفع",
                                        "Please sign in first to switch payment method",
                                    ),
                                    localized("تسجيل الدخول", "Sign In"),
                                    onOpenAccount,
                                )
                            }
                            SwitchToCodOutcome.Ineligible -> onShowMessage(orderIneligibleMessage())
                            SwitchToCodOutcome.Failure -> {
                                onShowMessage(
                                    localized(
                                        "تعذر تحويل الطلب إلى الدفع عند الاستلام حالياً",
                                        "Could not switch order to Cash on Delivery right now",
                                    ),
                                )
                            }
                        }
                    }
                } else {
                    viewModel.updateRetryMethodLocally(selection.orderId, chosenMethod.rawValue)
                    activeRetrySession = ActiveRetrySession(
                        orderId = selection.orderId,
                        orderPhone = selection.orderPhone,
                        method = chosenMethod.rawValue,
                        walletPhone = if (chosenMethod == PaymentMethod.WALLET) walletPhone else "",
                    )
                }
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RetryPaymentMethodSheet(
    storeSettings: StoreSettings,
    enabledMethods: List<PaymentMethod>,
    initialMethod: String,
    defaultPhone: String,
    onDismiss: () -> Unit,
    onConfirm: (method: PaymentMethod, walletPhone: String) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val brandColors = LocalBrandColors.current
    val resolvedInitial = remember(enabledMethods, initialMethod) {
        enabledMethods.firstOrNull { it.rawValue.equals(initialMethod, ignoreCase = true) }
            ?: enabledMethods.firstOrNull()
    }
    var selectedMethod by remember(resolvedInitial) { mutableStateOf(resolvedInitial) }
    var walletPhone by remember(defaultPhone) {
        val prefill = PhoneNormalizer.normalizeForEgyptCheckout(defaultPhone)
        mutableStateOf(prefill.takeIf(PhoneNormalizer::isValidEgyptianPhone).orEmpty())
    }

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
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = localized("اختر طريقة الدفع", "Choose payment method"),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(
                            imageVector = Icons.Rounded.Close,
                            contentDescription = localized("إغلاق", "Close"),
                        )
                    }
                }

                Text(
                    text = localized(
                        "اختر طريقة الدفع الإلكتروني لإكمال هذا الطلب بنجاح.",
                        "Choose an enabled online payment method to complete this order.",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                enabledMethods.forEach { method ->
                    val isSelected = selectedMethod == method
                    val icon = when (method) {
                        PaymentMethod.CARD -> Icons.Rounded.CreditCard
                        PaymentMethod.WALLET, PaymentMethod.STORE_WALLET -> Icons.Rounded.AccountBalanceWallet
                        PaymentMethod.COD, PaymentMethod.COUPON -> Icons.Rounded.Payments
                    }
                    val title = when (method) {
                        PaymentMethod.CARD -> localized("بطاقة بنكية (فيزا / ماستركارد)", "Bank Card (Visa / Mastercard)")
                        PaymentMethod.WALLET -> localized("محفظة إلكترونية", "Mobile Wallet")
                        PaymentMethod.STORE_WALLET -> localized("رصيد محفظة المتجر", "Store Credit Wallet")
                        PaymentMethod.COD -> localized("الدفع عند الاستلام (كاش)", "Cash on Delivery (COD)")
                        PaymentMethod.COUPON -> localized("كوبون خصم", "Promo coupon")
                    }
                    val subtitle = when (method) {
                        PaymentMethod.CARD -> localized("دفع فوري وآمن عبر Paymob.", "Instant encrypted card checkout via Paymob.")
                        PaymentMethod.WALLET -> localized("فودافون كاش / اتصالات / أورنج / وي باي.", "Vodafone Cash / Etisalat / Orange / WE Pay.")
                        PaymentMethod.STORE_WALLET -> localized("الدفع باستخدام رصيد محفظتك في المتجر.", "Pay using your available store credit balance.")
                        PaymentMethod.COD -> localized(
                            "حوّل الطلب فوراً إلى الدفع نقداً عند الاستلام وابدأ التجهيز.",
                            "Switch immediately to pay cash on delivery and start processing.",
                        )
                        PaymentMethod.COUPON -> localized("مغطّى بالكامل بكود الخصم", "Covered in full by promo code")
                    }

                    Surface(
                        color = if (isSelected) {
                            MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f)
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
                                onClick = { selectedMethod = method },
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
                                imageVector = icon,
                                contentDescription = null,
                                tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = title,
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(
                                    text = subtitle,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }

                if (selectedMethod == PaymentMethod.WALLET) {
                    val walletValid = PhoneNormalizer.isValidEgyptianPhone(walletPhone)
                    OutlinedTextField(
                        value = walletPhone,
                        onValueChange = { walletPhone = PhoneNormalizer.normalizeForEgyptCheckout(it) },
                        singleLine = true,
                        label = { Text(localized("رقم المحفظة الإلكترونية", "Wallet phone number")) },
                        placeholder = { Text("010xxxxxxxx") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        isError = walletPhone.isNotEmpty() && !walletValid,
                        supportingText = {
                            if (!walletValid) {
                                Text(
                                    localized(
                                        "أدخل رقم موبايل مصري من 11 رقماً (010 / 011 / 012 / 015)",
                                        "Enter an 11-digit Egyptian mobile number (010 / 011 / 012 / 015)",
                                    ),
                                )
                            }
                        },
                        shape = MaterialTheme.shapes.small,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                val canProceed = selectedMethod != null && (
                    selectedMethod != PaymentMethod.WALLET || PhoneNormalizer.isValidEgyptianPhone(walletPhone)
                )

                Button(
                    onClick = {
                        selectedMethod?.let { chosen ->
                            onConfirm(chosen, walletPhone)
                        }
                    },
                    enabled = canProceed,
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                ) {
                    Text(
                        text = if (selectedMethod == PaymentMethod.COD) {
                            localized("تأكيد الدفع عند الاستلام", "Confirm Cash on Delivery")
                        } else {
                            localized("متابعة إلى بوابة الدفع", "Continue to Payment")
                        },
                        style = MaterialTheme.typography.labelLarge,
                    )
                }
            }
        }
    }
}

@Composable
private fun PaymentOutcomeBanner(
    outcome: PaymentFlowOutcome,
    onDismiss: () -> Unit,
) {
    val brandColors = LocalBrandColors.current
    val isSuccess = outcome == PaymentFlowOutcome.SUCCESS || outcome == PaymentFlowOutcome.SWITCHED_TO_COD
    val bg = when (outcome) {
        PaymentFlowOutcome.SUCCESS, PaymentFlowOutcome.SWITCHED_TO_COD -> brandColors.success.copy(alpha = 0.14f)
        PaymentFlowOutcome.PENDING -> MaterialTheme.colorScheme.secondaryContainer
        PaymentFlowOutcome.FAILED, PaymentFlowOutcome.CANCELLED -> MaterialTheme.colorScheme.errorContainer
    }
    val fg = when (outcome) {
        PaymentFlowOutcome.SUCCESS, PaymentFlowOutcome.SWITCHED_TO_COD -> brandColors.success
        PaymentFlowOutcome.PENDING -> MaterialTheme.colorScheme.onSecondaryContainer
        PaymentFlowOutcome.FAILED, PaymentFlowOutcome.CANCELLED -> MaterialTheme.colorScheme.onErrorContainer
    }

    Surface(
        color = bg,
        contentColor = fg,
        shape = MaterialTheme.shapes.medium,
        border = BorderStroke(1.dp, fg.copy(alpha = 0.35f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                imageVector = if (isSuccess) Icons.Rounded.CheckCircle else Icons.Rounded.ErrorOutline,
                contentDescription = null,
                modifier = Modifier.size(24.dp),
            )
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = when (outcome) {
                        PaymentFlowOutcome.SUCCESS -> localized("تم الشراء والدفع بنجاح", "Purchase & Payment Confirmed")
                        PaymentFlowOutcome.SWITCHED_TO_COD -> localized("تم التحويل إلى الدفع عند الاستلام", "Switched to Cash on Delivery")
                        PaymentFlowOutcome.PENDING -> localized("عملية الدفع قيد التأكيد", "Payment confirmation pending")
                        PaymentFlowOutcome.FAILED -> localized("لم تكتمل عملية الدفع", "Payment could not be completed")
                        PaymentFlowOutcome.CANCELLED -> localized("تم إلغاء عملية الدفع", "Payment was cancelled")
                    },
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = when (outcome) {
                        PaymentFlowOutcome.SUCCESS -> localized(
                            "شكراً لتسوقك معنا! تم تفريغ السلة وحفظ فاتورتك أدناه.",
                            "Thank you! Your cart has been cleared and your receipt is saved below.",
                        )
                        PaymentFlowOutcome.SWITCHED_TO_COD -> localized(
                            "تم تأكيد طلبك بالدفع نقداً عند الاستلام وجاري تجهيزه الآن.",
                            "Your order is now confirmed for Cash on Delivery and being processed.",
                        )
                        PaymentFlowOutcome.PENDING -> localized(
                            "سنحدّث حالة الدفع عند وصول التأكيد.",
                            "Your payment status will update when confirmation arrives.",
                        )
                        else -> localized(
                            "سلة التسوق لا تزال محفوظة، ويمكنك الضغط على \"إعادة محاولة الدفع\" أسفل الطلب.",
                            "Your cart is preserved. Tap \"Retry Payment\" on your order below to try again.",
                        )
                    },
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            IconButton(onClick = onDismiss, modifier = Modifier.size(28.dp)) {
                Icon(
                    imageVector = Icons.Rounded.Close,
                    contentDescription = localized("إغلاق", "Dismiss"),
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}

@Composable
internal fun PaymentAndShippingSummary(
    paymentStatus: String,
    fulfillmentStatus: OrderStatus,
    reservationExpiresAt: String?,
    paymentReview: String? = null,
    method: String,
    carrier: String?,
    trackingNumber: String?,
    hasOnlinePaymentEnabled: Boolean,
    onCopyTracking: (String) -> Unit,
    onRetryPayment: () -> Unit,
) {
    val brandColors = LocalBrandColors.current
    val context = LocalContext.current

    val methodLabel = orderMethodLabel(method)
    val statusLabel = paymentStatusLabel(paymentStatus, method)
    val badgeBg = when (paymentStatus.lowercase()) {
        "paid" -> brandColors.success.copy(alpha = 0.14f)
        "failed" -> MaterialTheme.colorScheme.errorContainer
        else -> MaterialTheme.colorScheme.secondaryContainer
    }
    val badgeFg = when (paymentStatus.lowercase()) {
        "paid" -> brandColors.success
        "failed" -> MaterialTheme.colorScheme.onErrorContainer
        else -> MaterialTheme.colorScheme.onSecondaryContainer
    }

    val localizedCarrier = CarrierLocalizer.displayCarrier(carrier)
    val externalUrl = CarrierLocalizer.buildTrackingUrl(carrier, trackingNumber)
    val window by produceState(
        initialValue = orderPaymentWindow(method, paymentStatus, fulfillmentStatus, reservationExpiresAt, System.currentTimeMillis()),
        method, paymentStatus, fulfillmentStatus, reservationExpiresAt,
    ) {
        while (true) {
            value = orderPaymentWindow(method, paymentStatus, fulfillmentStatus, reservationExpiresAt, System.currentTimeMillis())
            val remaining = value.remainingMillis ?: break
            delay((remaining - 1) % 60_000 + 1)
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                color = badgeBg,
                contentColor = badgeFg,
                shape = MaterialTheme.shapes.extraSmall,
            ) {
                Text(
                    text = "$methodLabel · $statusLabel",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
        }

        if (!localizedCarrier.isNullOrBlank() || !trackingNumber.isNullOrBlank()) {
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.LocalShipping,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(18.dp),
                        )
                        Column {
                            localizedCarrier?.let {
                                Text(
                                    text = it,
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                            trackingNumber?.takeIf { it.isNotBlank() }?.let { code ->
                                Text(
                                    text = code,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        trackingNumber?.takeIf { it.isNotBlank() }?.let { code ->
                            IconButton(
                                onClick = { onCopyTracking(code) },
                                modifier = Modifier.size(32.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.ContentCopy,
                                    contentDescription = localized("نسخ رقم الشحنة", "Copy tracking number"),
                                    modifier = Modifier.size(16.dp),
                                )
                            }
                        }
                        if (externalUrl != null) {
                            TextButton(
                                onClick = {
                                    runCatching {
                                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(externalUrl)))
                                    }
                                },
                            ) {
                                Text(
                                    text = localized("تتبع الشحنة", "Track"),
                                    style = MaterialTheme.typography.labelMedium,
                                )
                                Icon(
                                    imageVector = Icons.AutoMirrored.Rounded.OpenInNew,
                                    contentDescription = null,
                                    modifier = Modifier
                                        .padding(start = 4.dp)
                                        .size(14.dp),
                                )
                            }
                        }
                    }
                }
            }
        }

        if (paymentReview != null) PaymentReviewBanner()
        if (window.ended) {
            Text(localized("انتهت صلاحية حجز الدفع لهذا الطلب.", "The payment reservation for this order has ended."),
                style = MaterialTheme.typography.bodySmall)
        }
        window.remainingMillis?.let { remaining ->
            val minutes = (remaining + 59_999) / 60_000
            Text(localized("الوقت المتبقي للدفع: ⁦$minutes⁩ دقيقة", "Payment window: $minutes min remaining"),
                style = MaterialTheme.typography.bodySmall.copy(fontFeatureSettings = "tnum"))
        }
        if (hasOnlinePaymentEnabled && window.canRetry) {
            Button(
                onClick = onRetryPayment,
                shape = MaterialTheme.shapes.small,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.secondary,
                    contentColor = MaterialTheme.colorScheme.onSecondary,
                ),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(
                    imageVector = Icons.Rounded.Replay,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Text(
                    text = localized("إعادة محاولة الدفع", "Retry Payment"),
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun SavedReceiptCard(
    receipt: SavedOrderReceipt,
    locale: String,
    isRefreshing: Boolean,
    hasOnlinePaymentEnabled: Boolean,
    onRefreshStatus: () -> Unit,
    onCopyOrderId: () -> Unit,
    onCopyTracking: (String) -> Unit,
    onRetryPayment: () -> Unit,
    onContactSupport: () -> Unit,
) {
    var expanded by androidx.compose.runtime.saveable.rememberSaveable(receipt.orderNumber) { mutableStateOf(false) }
    if (!expanded) {
        val row = remember(receipt) {
            OrderCardSummary(
                id = receipt.orderNumber, status = receipt.status.rawValue, createdAt = receipt.createdAt,
                total = receipt.total, currency = receipt.currency, paymentStatus = receipt.paymentStatus,
                paymentMethod = receipt.method,
                paymentReview = receipt.paymentReview,
                itemCount = receipt.items.sumOf { it.quantity },
                thumbnails = receipt.items.mapNotNull { it.imageUrl }.take(3),
            )
        }
        HistoryCard(row, locale) { expanded = true }
        return
    }
    val brandColors = LocalBrandColors.current
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, brandColors.hairline),
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
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = localized("طلب ${formatOrderNumber(receipt.orderNumber)}", "Order ${formatOrderNumber(receipt.orderNumber)}"),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                    )
                    IconButton(
                        onClick = onCopyOrderId,
                        modifier = Modifier.size(28.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.ContentCopy,
                            contentDescription = localized("نسخ رقم الطلب", "Copy order number"),
                            modifier = Modifier.size(15.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                OrderStatusBadge(status = receipt.status)
            }

            Text(
                text = "${formatOrderDate(receipt.createdAt)} • ${receipt.phone}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            TextButton(onClick = { expanded = false }) { Text(localized("إخفاء التفاصيل", "Hide details")) }
            PaymentAndShippingSummary(
                paymentStatus = receipt.paymentStatus,
                fulfillmentStatus = receipt.status,
                reservationExpiresAt = receipt.reservationExpiresAt,
                paymentReview = receipt.paymentReview,
                method = receipt.method,
                carrier = receipt.carrier,
                trackingNumber = receipt.trackingNumber,
                hasOnlinePaymentEnabled = hasOnlinePaymentEnabled,
                onCopyTracking = onCopyTracking,
                onRetryPayment = onRetryPayment,
            )

            OrderTimelineStepper(currentStatus = receipt.status)

            HorizontalDivider(color = brandColors.hairline)

            ItemizedReceiptRows(receipt = receipt, locale = locale)

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                TextButton(
                    onClick = onRefreshStatus,
                    enabled = !isRefreshing,
                ) {
                    if (isRefreshing) {
                        CircularProgressIndicator(
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(16.dp),
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Rounded.Refresh,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            text = localized("تحديث الحالة", "Refresh status"),
                            modifier = Modifier.padding(start = 6.dp),
                        )
                    }
                }
                TextButton(onClick = onContactSupport) {
                    Text(localized("استفسار عن الطلب", "Ask about order"))
                }
            }
        }
    }
}

@Composable
private fun ItemizedReceiptRows(
    receipt: SavedOrderReceipt,
    locale: String,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        receipt.items.forEach { item ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                val variant = listOfNotNull(
                    item.size,
                    item.color?.let(ColorSwatchMapper::displayLabel),
                ).joinToString(" • ")
                Text(
                    text = "${item.quantity} × ${item.displayName}" +
                        if (variant.isNotEmpty()) " ($variant)" else "",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = formatPrice(item.lineTotal, receipt.currency, locale),
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
        Spacer(modifier = Modifier.height(2.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = localized(
                    "الإجمالي (شامل الشحن ${formatPrice(receipt.shippingFee, receipt.currency, locale)})",
                    "Total (includes shipping ${formatPrice(receipt.shippingFee, receipt.currency, locale)})",
                ),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = formatPrice(receipt.total, receipt.currency, locale),
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
private fun HistoryCard(row: OrderCardSummary, locale: String, open: () -> Unit) {
    val status = OrderStatus.fromRaw(row.status)
    val dateLocale = localized("ar-EG", "en-EG")
    val day = remember(row.createdAt, dateLocale) {
        val ms = com.whitelabel.commerce.core.domain.model.FlashSalePricing.parseIsoTimestampMillis(row.createdAt)
        if (ms == null) row.createdAt.take(10) else java.text.DateFormat.getDateInstance(java.text.DateFormat.MEDIUM,
            java.util.Locale.forLanguageTag(dateLocale)).format(java.util.Date(ms))
    }
    Card(onClick = open, modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, LocalBrandColors.current.hairline)) {
        Column(Modifier.fillMaxWidth().padding(15.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column { Text(formatOrderNumber(row.id), fontWeight = FontWeight.Bold); Text(day, style = MaterialTheme.typography.bodySmall) }
                OrderStatusBadge(status)
            }
            Text(paymentStatusLabel(row.paymentStatus, row.paymentMethod), style = MaterialTheme.typography.labelMedium)
            if (row.paymentReview != null) PaymentReviewBanner()
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                row.thumbnails.forEach { path -> coil.compose.AsyncImage(
                    com.whitelabel.commerce.core.data.remote.SupabaseStorageUrls.resolveProductImageUrl(path), null, Modifier.size(38.dp)) }
                Text(if (row.itemCount == 1) localized("قطعة واحدة", "1 item") else localized("${row.itemCount} قطع", "${row.itemCount} items"))
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(row.total?.let { formatPrice(it, row.currency, locale) } ?: localized("قيد التسعير", "Total pending"),
                    fontWeight = FontWeight.Bold)
                Text(localized("تفاصيل الطلب","View order"), color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

internal fun orderMethodLabel(method: String): String = when (method.lowercase()) {
    "coupon" -> localized("كوبون خصم", "Promo coupon")
    "paymob_card" -> localized("بطاقة بنكية", "Card")
    "wallet" -> localized("محفظة المتجر", "Store Wallet")
    "paymob_wallet" -> localized("محفظة إلكترونية", "Wallet")
    else -> localized("الدفع عند الاستلام", "COD")
}

@Composable
private fun PaymentReviewBanner() {
    Surface(
        modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.errorContainer, contentColor = MaterialTheme.colorScheme.onErrorContainer,
    ) {
        Text(
            localized("يراجع المتجر دفعة هذا الطلب. تواصل مع الدعم للاستفسار.", "The store is reviewing this payment. Contact support if you have questions."),
            style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(10.dp),
        )
    }
}
