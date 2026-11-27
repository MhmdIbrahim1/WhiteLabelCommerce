package com.whitelabel.commerce.feature.checkout

import com.whitelabel.commerce.core.data.remote.PhoneNormalizer

import com.whitelabel.commerce.core.designsystem.components.BannerFeedback
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.AccountBalanceWallet
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ConfirmationNumber
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.LocalShipping
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import com.whitelabel.commerce.core.designsystem.components.SearchAction
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.components.ColorSwatchMapper
import com.whitelabel.commerce.core.designsystem.components.FreeShippingProgressBar
import com.whitelabel.commerce.core.designsystem.formatPrice
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.PaymentMethod
import com.whitelabel.commerce.core.domain.model.SavedOrderReceipt


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckoutScreen(
    onBack: () -> Unit,
    onSearch: () -> Unit,
    onOpenAccount: () -> Unit,
    onTrackOrder: (orderNumber: String, phone: String, paymentOutcome: PaymentFlowOutcome?) -> Unit,
    onContinueShopping: () -> Unit,
    onShowMessage: (String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: CheckoutViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val brandColors = LocalBrandColors.current
    val online by viewModel.network.online.collectAsStateWithLifecycle(initialValue = true)
    var addressBusy by remember { mutableStateOf(false) }
    val confirmedReceipt = state.form.confirmedReceipt

    if (confirmedReceipt != null && confirmedReceipt.requiresOnlinePayment) {
        PaymentFlow(
            id = confirmedReceipt.orderNumber,
            phone = confirmedReceipt.phone,
            method = confirmedReceipt.method,
            initialWallet = state.form.wallet,
            onExit = { outcome ->
                onTrackOrder(confirmedReceipt.orderNumber, confirmedReceipt.phone, outcome)
            },
        )
        return
    }

    if (confirmedReceipt != null) {
        OrderConfirmationScreen(
            receipt = confirmedReceipt,
            locale = state.storeSettings.locale,
            onTrackOrder = { onTrackOrder(confirmedReceipt.orderNumber, confirmedReceipt.phone, null) },
            onContinueShopping = onContinueShopping,
            onCopied = { onShowMessage(localized("تم نسخ رقم الطلب بنجاح", "Order number copied")) },
            modifier = modifier,
        )
        return
    }

    val walletValid = state.paymentMethod != PaymentMethod.WALLET ||
        PhoneNormalizer.isValidEgyptianPhone(state.form.wallet)

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = localized("إتمام الطلب", "Checkout"),
                        style = MaterialTheme.typography.titleLarge,
                    )
                },
                actions = { SearchAction(onSearch) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = localized("رجوع", "Back"),
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface,
                ),
            )
        },
        bottomBar = {
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 6.dp,
            ) {
                Column {
                    HorizontalDivider(color = brandColors.hairline)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column {
                            Text(
                                text = localized("إجمالي الطلب", "Order total"),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text(
                                text = formatPrice(
                                    amount = state.grandTotal,
                                    currencyCode = state.storeSettings.currency,
                                    localeTag = state.storeSettings.locale,
                                ),
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.Bold,
                            )
                        }

                        Button(
                            onClick = viewModel::submitOrder,
                            enabled = online && !addressBusy && state.form.shippingRates != null && !state.form.isSubmitting &&
                                state.cartItems.isNotEmpty() &&
                                state.storeSettings.isSyncedFromRemote &&
                                (state.fullyPaidByWallet || state.fullyCoveredByCoupon || state.paymentMethod in state.storeSettings.paymentMethods) &&
                                walletValid,
                            shape = MaterialTheme.shapes.small,
                            modifier = Modifier
                                .weight(1f)
                                .height(48.dp),
                        ) {
                            if (state.form.isSubmitting) {
                                CircularProgressIndicator(
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.onPrimary,
                                    modifier = Modifier.size(20.dp),
                                )
                            } else {
                                Text(
                                    text = when {
                                        state.fullyCoveredByCoupon -> localized("تأكيد الطلب المجاني", "Confirm free order")
                                        state.fullyPaidByWallet -> localized(
                                            "إتمام الطلب برصيد المحفظة",
                                            "Complete with Store Wallet",
                                        )
                                        state.paymentMethod == PaymentMethod.COD -> localized(
                                            "تأكيد الطلب",
                                            "Confirm order",
                                        )
                                        else -> localized(
                                            "المتابعة للدفع الآمن",
                                            "Proceed to secure payment",
                                        )
                                    },
                                    style = MaterialTheme.typography.labelLarge,
                                )
                            }
                        }
                    }
                }
            }
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (state.form.rateLoadFailed) {
                TextButton(onClick = viewModel::loadShippingRates) {
                    Text(localized("تعذر تحميل رسوم الشحن. إعادة المحاولة", "Could not load shipping fees. Retry"))
                }
            }
            if (!online || !state.storeSettings.isSyncedFromRemote) {
                Text(localized("تعذر تحميل إعدادات الدفع. تحقق من اتصالك بالإنترنت.", "Checkout settings are unavailable. Check your connection."), color = MaterialTheme.colorScheme.error)
            }
            if (state.storeSettings.cartIncentiveEnabled && state.storeSettings.freeShippingThreshold > 0.0) {
                FreeShippingProgressBar(
                    enabled = state.storeSettings.cartIncentiveEnabled,
                    threshold = state.storeSettings.freeShippingThreshold,
                    subtotal = state.subtotal,
                    currency = state.storeSettings.currency,
                    locale = state.storeSettings.locale,
                )
            }
            // 0. Optional Account Sign-In / Signed-In Sync Banner (Guest Checkout remains fully open)
            Surface(
                color = if (state.signedInEmail != null) {
                    brandColors.success.copy(alpha = 0.12f)
                } else {
                    MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f)
                },
                shape = MaterialTheme.shapes.medium,
                border = BorderStroke(
                    1.dp,
                    if (state.signedInEmail != null) {
                        brandColors.success.copy(alpha = 0.35f)
                    } else {
                        MaterialTheme.colorScheme.primary.copy(alpha = 0.25f)
                    },
                ),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.AccountCircle,
                        contentDescription = null,
                        tint = if (state.signedInEmail != null) brandColors.success else MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(24.dp),
                    )
                    if (state.signedInEmail != null) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = localized("مسجّل الدخول: ${state.signedInEmail}", "Signed in: ${state.signedInEmail}"),
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = localized(
                                    "سيتم حفظ الطلب تلقائياً في حسابك ومزامنته مع الموقع.",
                                    "This order will automatically sync to your account across web & app.",
                                ),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    } else {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = localized("هل لديك حساب؟ (اختياري)", "Have an account? (Optional)"),
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = localized(
                                    "سجّل الدخول لملء بياناتك تلقائياً أو أكمل كزائر أدناه.",
                                    "Sign in to auto-fill shipping details, or continue as guest below.",
                                ),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        OutlinedButton(
                            onClick = onOpenAccount,
                            shape = MaterialTheme.shapes.small,
                        ) {
                            Text(localized("تسجيل الدخول", "Sign In"))
                        }
                    }
                }
            }

            // 1. Delivery Details Card
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
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.LocalShipping,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                        )
                        Text(
                            text = localized("بيانات التوصيل", "Delivery details"),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                        )
                    }

                    com.whitelabel.commerce.feature.addresses.AddressBook(
                        account = state.signedInEmail,
                        initial = state.form.delivery,
                        onDelivery = viewModel::setDelivery,
                        onBusy = { addressBusy = it },
                    )

                }
            }

            // 2. Store Credit Wallet Opt-In Card + Payment Methods Card
            if (state.canUseStoreWallet) {
                Surface(
                    color = if (state.form.useStoreWallet) {
                        brandColors.success.copy(alpha = 0.10f)
                    } else {
                        MaterialTheme.colorScheme.surface
                    },
                    shape = MaterialTheme.shapes.medium,
                    border = BorderStroke(
                        width = if (state.form.useStoreWallet) 1.5.dp else 1.dp,
                        color = if (state.form.useStoreWallet) brandColors.success else brandColors.hairline,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.AccountBalanceWallet,
                            contentDescription = null,
                            tint = brandColors.success,
                            modifier = Modifier.size(24.dp),
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            val balStr = formatPrice(
                                state.walletBalance,
                                state.storeSettings.currency,
                                state.storeSettings.locale,
                            )
                            Text(
                                text = localized(
                                    "استخدام رصيد المحفظة ($balStr)",
                                    "Use Wallet Credit ($balStr)",
                                ),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = if (state.form.useStoreWallet) {
                                    val dedStr = formatPrice(
                                        state.walletApplied,
                                        state.storeSettings.currency,
                                        state.storeSettings.locale,
                                    )
                                    localized(
                                        "سيتم خصم $dedStr فوراً من إجمالي الطلب.",
                                        "Deducting $dedStr from your payable total.",
                                    )
                                } else {
                                    localized(
                                        "فعّل لاستخدام رصيد محفظة المتجر على هذا الطلب.",
                                        "Toggle on to apply your available store credit.",
                                    )
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Switch(
                            checked = state.form.useStoreWallet,
                            onCheckedChange = viewModel::setUseStoreWallet,
                        )
                    }
                }
            }

            if (state.fullyPaidByWallet || state.fullyCoveredByCoupon) {
                Surface(
                    color = brandColors.success.copy(alpha = 0.14f),
                    contentColor = brandColors.success,
                    shape = MaterialTheme.shapes.medium,
                    border = BorderStroke(1.dp, brandColors.success.copy(alpha = 0.4f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.CheckCircle,
                            contentDescription = null,
                            modifier = Modifier.size(22.dp),
                        )
                        Text(
                            text = if (state.fullyCoveredByCoupon) localized(
                                "مغطّى بالكامل بكود الخصم — لا يلزم دفع إضافي",
                                "Covered in full by promo code — no payment required",
                            ) else localized(
                                "مغطّى بالكامل برصيد محفظة المتجر — لا يلزم دفع إضافي.",
                                "Paid in full via Store Wallet — no extra payment required.",
                            ),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            } else {
                // Payment Methods Card (strictly renders only store-enabled methods)
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
                            text = localized("طريقة الدفع", "Payment method"),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                        )

                        state.storeSettings.paymentMethods.forEach { option ->
                            val isSelected = state.paymentMethod == option
                            val icon = when (option) {
                                PaymentMethod.COD -> Icons.Rounded.Payments
                                PaymentMethod.COUPON -> Icons.Rounded.ConfirmationNumber
                                PaymentMethod.CARD -> Icons.Rounded.CreditCard
                                PaymentMethod.WALLET, PaymentMethod.STORE_WALLET -> Icons.Rounded.AccountBalanceWallet
                            }
                            val title = when (option) {
                                PaymentMethod.COD -> localized("الدفع عند الاستلام", "Cash on delivery")
                                PaymentMethod.COUPON -> localized("كوبون خصم", "Promo coupon")
                                PaymentMethod.CARD -> localized("بطاقة بنكية (فيزا / ماستركارد)", "Credit / Debit card")
                                PaymentMethod.WALLET -> localized("محفظة إلكترونية (فودافون / اتصالات / أورنج)", "Mobile wallet")
                                PaymentMethod.STORE_WALLET -> localized("محفظة المتجر", "Store wallet")
                            }
                            val subtitle = when (option) {
                                PaymentMethod.COD -> localized("ادفع نقداً للمندوب عند استلام طلبك.", "Pay in cash upon delivery.")
                                PaymentMethod.COUPON -> localized("مغطّى بالكامل بكود الخصم", "Covered in full by promo code")
                                PaymentMethod.CARD -> localized("دفع إلكتروني آمن ومشفّر عبر Paymob.", "Encrypted online card checkout via Paymob.")
                                PaymentMethod.WALLET -> localized("استلم طلب التأكيد على محفظتك المصرية.", "Confirm payment directly on your Egyptian wallet.")
                                PaymentMethod.STORE_WALLET -> localized("الدفع برصيد محفظتك في المتجر.", "Pay using your store wallet balance.")
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
                                        onClick = { viewModel.method(option) },
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

                        if (state.paymentMethod == PaymentMethod.WALLET) {
                            val walletInvalid = !PhoneNormalizer.isValidEgyptianPhone(state.form.wallet)
                            OutlinedTextField(
                                value = state.form.wallet,
                                onValueChange = viewModel::wallet,
                                singleLine = true,
                                label = { Text(localized("رقم المحفظة الإلكترونية", "Wallet mobile number")) },
                                placeholder = { Text("010xxxxxxxx") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                                isError = walletInvalid && state.form.wallet.isNotEmpty(),
                                supportingText = {
                                    if (walletInvalid) {
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
                    }
                }
            }

            // 3. Promo Code Card
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
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.ConfirmationNumber,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.secondary,
                        )
                        Text(
                            text = localized("كود الخصم", "Promo code"),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        OutlinedTextField(
                            value = state.form.coupon,
                            onValueChange = viewModel::coupon,
                            singleLine = true,
                            placeholder = { Text(localized("أدخل كود الخصم", "Enter promo code")) },
                            shape = MaterialTheme.shapes.small,
                            modifier = Modifier.weight(1f),
                        )
                        Button(
                            onClick = viewModel::applyCoupon,
                            enabled = state.form.coupon.isNotBlank() && !state.form.isApplyingCoupon,
                            shape = MaterialTheme.shapes.small,
                            modifier = Modifier.height(54.dp),
                        ) {
                            if (state.form.isApplyingCoupon) {
                                CircularProgressIndicator(
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.onPrimary,
                                    modifier = Modifier.size(18.dp),
                                )
                            } else {
                                Text(localized("تطبيق", "Apply"))
                            }
                        }
                    }

                    state.form.couponError?.let { BannerFeedback(it) }

                    if (state.appliedDiscount > 0.0) {
                        Surface(
                            color = brandColors.success.copy(alpha = 0.14f),
                            contentColor = brandColors.success,
                            shape = MaterialTheme.shapes.extraSmall,
                        ) {
                            Text(
                                text = localized(
                                    "تم تطبيق الخصم: -${formatPrice(state.appliedDiscount, state.storeSettings.currency, state.storeSettings.locale)}",
                                    "Coupon applied: -${formatPrice(state.appliedDiscount, state.storeSettings.currency, state.storeSettings.locale)}",
                                ),
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                            )
                        }
                    }
                }
            }

            // 4. Order Summary Card
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, brandColors.hairline),
                shape = MaterialTheme.shapes.medium,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = localized(
                            "ملخص المنتجات (${state.cartItems.sumOf { it.quantity }})",
                            "Order items (${state.cartItems.sumOf { it.quantity }})",
                        ),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    state.cartItems.forEach { line ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            val variant = listOfNotNull(
                                line.selectedSize,
                                line.selectedColor?.let(ColorSwatchMapper::displayLabel),
                            ).joinToString(" • ")
                            Text(
                                text = "${line.quantity} × ${line.displayName}" +
                                    if (variant.isNotEmpty()) " ($variant)" else "",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.weight(1f),
                            )
                            Text(
                                text = formatPrice(
                                    line.lineTotal,
                                    state.storeSettings.currency,
                                    state.storeSettings.locale,
                                ),
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                    HorizontalDivider(color = brandColors.hairline)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(localized("المجموع الفرعي", "Subtotal"), style = MaterialTheme.typography.bodyMedium)
                        Text(
                            formatPrice(
                                state.subtotal,
                                state.storeSettings.currency,
                                state.storeSettings.locale,
                            ),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                    if (state.appliedDiscount > 0.0) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                localized("الخصم", "Discount"),
                                style = MaterialTheme.typography.bodyMedium,
                                color = brandColors.success,
                            )
                            Text(
                                "-${formatPrice(state.appliedDiscount, state.storeSettings.currency, state.storeSettings.locale)}",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = brandColors.success,
                            )
                        }
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(localized("الشحن", "Shipping"), style = MaterialTheme.typography.bodyMedium)
                        Text(
                            text = if (state.shippingFee <= 0.0) {
                                localized("مجاني", "Free")
                            } else {
                                formatPrice(
                                    state.shippingFee,
                                    state.storeSettings.currency,
                                    state.storeSettings.locale,
                                )
                            },
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = if (state.shippingFee <= 0.0) FontWeight.Bold else FontWeight.Normal,
                            color = if (state.shippingFee <= 0.0) brandColors.success else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                    if (state.walletApplied > 0.0) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                localized("خصم رصيد المحفظة", "Wallet credit"),
                                style = MaterialTheme.typography.bodyMedium,
                                color = brandColors.success,
                            )
                            Text(
                                "-${formatPrice(state.walletApplied, state.storeSettings.currency, state.storeSettings.locale)}",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = brandColors.success,
                            )
                        }
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            localized("الإجمالي النهائي", "Grand total"),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            formatPrice(
                                state.grandTotal,
                                state.storeSettings.currency,
                                state.storeSettings.locale,
                            ),
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }

            // 5. Error Banner
            state.form.submitError?.let { BannerFeedback(it) }

            Spacer(modifier = Modifier.height(12.dp))
        }
    }
}

@Composable
private fun OrderConfirmationScreen(
    receipt: SavedOrderReceipt,
    locale: String,
    onTrackOrder: () -> Unit,
    onContinueShopping: () -> Unit,
    onCopied: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val brandColors = LocalBrandColors.current
    val clipboard = LocalClipboardManager.current
    var copied by remember { mutableStateOf(false) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Spacer(modifier = Modifier.height(12.dp))

        Surface(
            color = brandColors.success.copy(alpha = 0.14f),
            shape = CircleShape,
            modifier = Modifier.size(76.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = Icons.Rounded.CheckCircle,
                    contentDescription = null,
                    tint = brandColors.success,
                    modifier = Modifier.size(44.dp),
                )
            }
        }

        Text(
            text = localized("تم تأكيد طلبك بنجاح!", "Order confirmed!"),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )

        Text(
            text = localized(
                "احتفظ برقم الطلب التالي لمتابعة حالة الشحن في أي وقت. تم حفظ الفاتورة تلقائياً في سجل طلباتك على هذا الجهاز.",
                "Keep this number to track delivery. Your receipt is saved on this device.",
            ),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )

        // Order Number Card with One-Tap Copy
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.5.dp, MaterialTheme.colorScheme.primary),
            shape = MaterialTheme.shapes.medium,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    text = localized("رقم الطلب", "Order number"),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = receipt.orderNumber,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                )
                OutlinedButton(
                    onClick = {
                        clipboard.setText(AnnotatedString(receipt.orderNumber))
                        copied = true
                        onCopied()
                    },
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(
                        imageVector = if (copied) Icons.Rounded.Check else Icons.Rounded.ContentCopy,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = if (copied) {
                            localized("تم نسخ رقم الطلب", "Order number copied")
                        } else {
                            localized("نسخ رقم الطلب", "Copy order number")
                        },
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }
        }

        // Itemized Receipt Summary
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, brandColors.hairline),
            shape = MaterialTheme.shapes.medium,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Rounded.ReceiptLong,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        text = localized("إيصال الطلب", "Order receipt"),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                }

                receipt.items.forEach { item ->
                    val variant = listOfNotNull(
                        item.size,
                        item.color?.let(ColorSwatchMapper::displayLabel),
                    ).joinToString(" • ")
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = "${item.quantity} × ${item.displayName}" +
                                if (variant.isNotEmpty()) " ($variant)" else "",
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            text = formatPrice(item.lineTotal, receipt.currency, locale),
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }

                HorizontalDivider(color = brandColors.hairline)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = if (receipt.method == "wallet") localized("محفظة المتجر", "Store Wallet") else localized("الإجمالي عند الاستلام", "Total on delivery"),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = formatPrice(receipt.total, receipt.currency, locale),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }

        Button(
            onClick = onTrackOrder,
            shape = MaterialTheme.shapes.small,
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
        ) {
            Text(
                text = localized("تتبع الطلب", "Track order"),
                style = MaterialTheme.typography.labelLarge,
            )
        }

        OutlinedButton(
            onClick = onContinueShopping,
            shape = MaterialTheme.shapes.small,
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
        ) {
            Text(
                text = localized("متابعة التسوق", "Continue shopping"),
                style = MaterialTheme.typography.labelLarge,
            )
        }
    }
}
