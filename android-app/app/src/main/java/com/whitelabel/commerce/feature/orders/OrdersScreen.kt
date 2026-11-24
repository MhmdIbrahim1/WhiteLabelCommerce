package com.whitelabel.commerce.feature.orders

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
import com.whitelabel.commerce.core.designsystem.LocalStoreSettings
import com.whitelabel.commerce.core.designsystem.components.BrandEmptyState
import com.whitelabel.commerce.core.designsystem.components.CarrierLocalizer
import com.whitelabel.commerce.core.designsystem.components.ColorSwatchMapper
import com.whitelabel.commerce.core.designsystem.components.OrderStatusBadge
import com.whitelabel.commerce.core.designsystem.components.OrderTimelineStepper
import com.whitelabel.commerce.core.designsystem.formatPrice
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.Order
import com.whitelabel.commerce.core.domain.model.PaymentMethod
import com.whitelabel.commerce.core.domain.model.SavedOrderReceipt
import com.whitelabel.commerce.core.domain.model.StoreSettings
import com.whitelabel.commerce.feature.checkout.PaymentFlow
import com.whitelabel.commerce.feature.checkout.PaymentFlowOutcome
import kotlinx.coroutines.delay

private val RETRY_WALLET_REGEX = Regex("^01[0125][0-9]{8}$")

private data class PendingRetrySelection(
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
    onOpenSupport: (orderId: String?) -> Unit,
    onShowMessage: (String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: OrdersViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val brandColors = LocalBrandColors.current
    val clipboard = LocalClipboardManager.current
    var pendingRetryChooser by remember { mutableStateOf<PendingRetrySelection?>(null) }
    var activeRetrySession by remember { mutableStateOf<ActiveRetrySession?>(null) }
    var paymentBanner by remember { mutableStateOf<PaymentFlowOutcome?>(null) }

    val enabledOnlineMethods = remember(state.storeSettings) {
        state.storeSettings.paymentMethods.filter { it == PaymentMethod.CARD || it == PaymentMethod.WALLET }
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
                viewModel.prefillAndTrack(session.orderId, session.orderPhone)
                viewModel.loadAccountOrders()
            },
        )
        return
    }

    val onlineReceipts = state.localReceipts.filter { it.method != "cod" && it.paymentStatus == "pending" }
    LaunchedEffect(onlineReceipts.map { it.orderNumber }) {
        while (onlineReceipts.isNotEmpty()) {
            viewModel.refreshPayments(onlineReceipts)
            delay(10_000)
        }
    }

    LaunchedEffect(initialOrderNumber, initialPhone, initialPaymentOutcome) {
        if (initialPaymentOutcome != null) {
            paymentBanner = initialPaymentOutcome
        }
        if (!initialOrderNumber.isNullOrBlank() && !initialPhone.isNullOrBlank()) {
            viewModel.prefillAndTrack(initialOrderNumber, initialPhone)
            onConsumePrefill()
        } else if (initialPaymentOutcome != null) {
            onConsumePrefill()
        }
    }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // 0. Payment Confirmation / Retry Status Banner
        paymentBanner?.let { outcome ->
            item {
                PaymentOutcomeBanner(
                    outcome = outcome,
                    onDismiss = { paymentBanner = null },
                )
            }
        }

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

                    state.tracking.trackingError?.let { error ->
                        Text(
                            text = error,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }

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
                                    text = "#${tracked.id.take(8)} • ${formatOrderDate(tracked.createdAt)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            OrderStatusBadge(status = tracked.status)
                        }

                        PaymentAndShippingSummary(
                            paymentStatus = tracked.paymentStatus,
                            method = tracked.method,
                            carrier = tracked.carrier,
                            trackingNumber = tracked.trackingNumber,
                            hasOnlinePaymentEnabled = enabledOnlineMethods.isNotEmpty(),
                            onCopyTracking = { code ->
                                clipboard.setText(AnnotatedString(code))
                                onShowMessage(localized("تم نسخ رقم الشحنة", "Tracking number copied"))
                            },
                            onRetryPayment = {
                                pendingRetryChooser = PendingRetrySelection(
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

        // 3. Quick Support Banner
        item {
            Surface(
                onClick = { onOpenSupport(null) },
                color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.55f),
                contentColor = MaterialTheme.colorScheme.onSurface,
                shape = MaterialTheme.shapes.medium,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.25f)),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.SupportAgent,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(28.dp),
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = localized("الدعم الفني وخدمة العملاء", "Customer support"),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = localized(
                                "أرسل تذكرة دعم أو تواصل معنا مباشرة عبر واتساب.",
                                "Send a support ticket or contact us on WhatsApp.",
                            ),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        // 4. Local Saved Orders History (DataStore)
        if (state.localReceipts.isNotEmpty()) {
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

            items(state.localReceipts, key = { it.orderNumber }) { receipt ->
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
                        pendingRetryChooser = PendingRetrySelection(
                            orderId = receipt.orderNumber,
                            orderPhone = receipt.phone,
                            currentMethod = receipt.method,
                        )
                    },
                    onContactSupport = { onOpenSupport(receipt.orderNumber) },
                )
            }
        }

        // 5. Authenticated Account Orders (when signed in)
        if (state.tracking.accountOrders.isNotEmpty()) {
            item {
                Text(
                    text = localized(
                        "طلبات حسابك (${state.tracking.accountOrders.size})",
                        "Account orders (${state.tracking.accountOrders.size})",
                    ),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
            }
            items(state.tracking.accountOrders, key = { it.id }) { order ->
                AccountOrderCard(
                    order = order,
                    locale = state.storeSettings.locale,
                    hasOnlinePaymentEnabled = enabledOnlineMethods.isNotEmpty(),
                    onCopyTracking = { code ->
                        clipboard.setText(AnnotatedString(code))
                        onShowMessage(localized("تم نسخ رقم الشحنة", "Tracking number copied"))
                    },
                    onRetryPayment = {
                        pendingRetryChooser = PendingRetrySelection(
                            orderId = order.id,
                            orderPhone = order.phone.orEmpty(),
                            currentMethod = order.paymentMethod?.rawValue ?: "paymob_card",
                        )
                    },
                    onContactSupport = { onOpenSupport(order.id) },
                )
            }
        }

        // 6. Empty State
        if (state.localReceipts.isEmpty() && state.tracking.accountOrders.isEmpty() && state.tracking.trackedResult == null) {
            item {
                BrandEmptyState(
                    icon = Icons.AutoMirrored.Outlined.ReceiptLong,
                    title = localized("لا توجد طلبات محفوظة بعد", "No saved orders yet"),
                    subtitle = localized(
                        "ستظهر هنا جميع الطلبات التي تقوم بها من هذا الجهاز مع الفواتير التفصيلية وإمكانية تتبعها بضغطة واحدة.",
                        "Orders placed on this device will appear here with itemized receipts and live tracking.",
                    ),
                )
            }
        }
    }

    // Payment Method Chooser Bottom Sheet for "إعادة محاولة الدفع / Retry Payment"
    pendingRetryChooser?.let { selection ->
        RetryPaymentMethodSheet(
            storeSettings = state.storeSettings,
            enabledMethods = enabledOnlineMethods,
            initialMethod = selection.currentMethod,
            defaultPhone = selection.orderPhone,
            onDismiss = { pendingRetryChooser = null },
            onConfirm = { chosenMethod, walletPhone ->
                pendingRetryChooser = null
                viewModel.updateRetryMethodLocally(selection.orderId, chosenMethod.rawValue)
                activeRetrySession = ActiveRetrySession(
                    orderId = selection.orderId,
                    orderPhone = selection.orderPhone,
                    method = chosenMethod.rawValue,
                    walletPhone = if (chosenMethod == PaymentMethod.WALLET) walletPhone else "",
                )
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
        mutableStateOf(if (RETRY_WALLET_REGEX.matches(prefill)) prefill else "")
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
                    val icon = if (method == PaymentMethod.CARD) {
                        Icons.Rounded.CreditCard
                    } else {
                        Icons.Rounded.AccountBalanceWallet
                    }
                    val title = if (method == PaymentMethod.CARD) {
                        localized("بطاقة بنكية (فيزا / ماستركارد)", "Bank Card (Visa / Mastercard)")
                    } else {
                        localized("محفظة إلكترونية", "Mobile Wallet")
                    }
                    val subtitle = if (method == PaymentMethod.CARD) {
                        localized("دفع فوري وآمن عبر Paymob.", "Instant encrypted card checkout via Paymob.")
                    } else {
                        localized("فودافون كاش / اتصالات / أورنج / وي باي.", "Vodafone Cash / Etisalat / Orange / WE Pay.")
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
                    val walletValid = RETRY_WALLET_REGEX.matches(walletPhone)
                    OutlinedTextField(
                        value = walletPhone,
                        onValueChange = { walletPhone = PhoneNormalizer.normalize(it) },
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
                    selectedMethod != PaymentMethod.WALLET || RETRY_WALLET_REGEX.matches(walletPhone)
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
                        text = localized("متابعة إلى بوابة الدفع", "Continue to Payment"),
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
    val isSuccess = outcome == PaymentFlowOutcome.SUCCESS
    val bg = when (outcome) {
        PaymentFlowOutcome.SUCCESS -> brandColors.success.copy(alpha = 0.14f)
        PaymentFlowOutcome.PENDING -> MaterialTheme.colorScheme.secondaryContainer
        PaymentFlowOutcome.FAILED, PaymentFlowOutcome.CANCELLED -> MaterialTheme.colorScheme.errorContainer
    }
    val fg = when (outcome) {
        PaymentFlowOutcome.SUCCESS -> brandColors.success
        PaymentFlowOutcome.PENDING -> MaterialTheme.colorScheme.secondary
        PaymentFlowOutcome.FAILED, PaymentFlowOutcome.CANCELLED -> MaterialTheme.colorScheme.error
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
private fun PaymentAndShippingSummary(
    paymentStatus: String,
    method: String,
    carrier: String?,
    trackingNumber: String?,
    hasOnlinePaymentEnabled: Boolean,
    onCopyTracking: (String) -> Unit,
    onRetryPayment: () -> Unit,
) {
    val brandColors = LocalBrandColors.current
    val context = LocalContext.current

    val methodLabel = when (method.lowercase()) {
        "paymob_card" -> localized("بطاقة بنكية", "Card")
        "paymob_wallet" -> localized("محفظة إلكترونية", "Wallet")
        else -> localized("الدفع عند الاستلام", "COD")
    }
    val statusLabel = when (paymentStatus.lowercase()) {
        "paid" -> localized("مدفوع", "Paid")
        "failed" -> localized("فشل الدفع", "Payment failed")
        "refunded" -> localized("تم رد المبلغ", "Refunded")
        "pending" -> localized("قيد الدفع", "Payment pending")
        else -> localized("عند الاستلام", "Pay on delivery")
    }
    val badgeBg = when (paymentStatus.lowercase()) {
        "paid" -> brandColors.success.copy(alpha = 0.14f)
        "failed" -> MaterialTheme.colorScheme.errorContainer
        else -> MaterialTheme.colorScheme.secondaryContainer
    }
    val badgeFg = when (paymentStatus.lowercase()) {
        "paid" -> brandColors.success
        "failed" -> MaterialTheme.colorScheme.error
        else -> MaterialTheme.colorScheme.secondary
    }

    val localizedCarrier = CarrierLocalizer.displayCarrier(carrier)
    val externalUrl = CarrierLocalizer.buildTrackingUrl(carrier, trackingNumber)
    val canRetry = hasOnlinePaymentEnabled &&
        method.lowercase() in setOf("paymob_card", "paymob_wallet") &&
        paymentStatus.lowercase() in setOf("pending", "failed")

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

        if (canRetry) {
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
                        text = localized("طلب #${receipt.orderNumber.take(8)}", "Order #${receipt.orderNumber.take(8)}"),
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

            PaymentAndShippingSummary(
                paymentStatus = receipt.paymentStatus,
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
private fun AccountOrderCard(
    order: Order,
    locale: String,
    hasOnlinePaymentEnabled: Boolean,
    onCopyTracking: (String) -> Unit,
    onRetryPayment: () -> Unit,
    onContactSupport: () -> Unit,
) {
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
                Column {
                    Text(
                        text = localized("طلب #${order.id.take(8)}", "Order #${order.id.take(8)}"),
                        style = MaterialTheme.typography.titleSmall,
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

            PaymentAndShippingSummary(
                paymentStatus = order.paymentStatus,
                method = order.paymentMethod?.rawValue ?: "cod",
                carrier = order.carrier,
                trackingNumber = order.trackingNumber,
                hasOnlinePaymentEnabled = hasOnlinePaymentEnabled,
                onCopyTracking = onCopyTracking,
                onRetryPayment = onRetryPayment,
            )

            OrderTimelineStepper(currentStatus = order.status)

            if (order.items.isNotEmpty()) {
                HorizontalDivider(color = brandColors.hairline)
                order.items.forEach { line ->
                    val variant = listOfNotNull(
                        line.size,
                        line.color?.let(ColorSwatchMapper::displayLabel),
                    ).joinToString(" • ")
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = "${line.quantity} × ${line.productName}" +
                                if (variant.isNotEmpty()) " ($variant)" else "",
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            text = formatPrice(line.lineTotal, order.currency, locale),
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }

            order.total?.let { totalAmount ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = localized("الإجمالي", "Total"),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = formatPrice(totalAmount, order.currency, locale),
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }

            TextButton(onClick = onContactSupport) {
                Text(localized("تواصل بخصوص الطلب", "Contact support"))
            }
        }
    }
}
