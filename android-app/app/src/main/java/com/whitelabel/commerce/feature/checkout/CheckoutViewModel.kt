package com.whitelabel.commerce.feature.checkout

import com.whitelabel.commerce.core.domain.model.CustomerAddress
import com.whitelabel.commerce.core.domain.model.DeliveryPin
import com.whitelabel.commerce.core.domain.model.EgyptLocations
import com.whitelabel.commerce.BuildConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.serialization.Serializable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.whitelabel.commerce.core.data.remote.PhoneNormalizer
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.AuthSessionState
import com.whitelabel.commerce.core.domain.model.CartItem
import com.whitelabel.commerce.core.domain.model.OrderStatus
import com.whitelabel.commerce.core.domain.model.PaymentMethod
import com.whitelabel.commerce.core.domain.model.SavedOrderLine
import com.whitelabel.commerce.core.domain.model.SavedOrderReceipt
import com.whitelabel.commerce.core.domain.model.StoreSettings
import com.whitelabel.commerce.core.domain.repository.AuthRepository
import com.whitelabel.commerce.core.domain.repository.CartRepository
import com.whitelabel.commerce.core.domain.repository.OrderRepository
import com.whitelabel.commerce.core.domain.repository.StoreRepository
import com.whitelabel.commerce.core.domain.repository.WalletRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import javax.inject.Inject

private val WALLET_REGEX = Regex("^01[0125][0-9]{8}$")

@Serializable
private data class ShippingRate(val governorate: String, val fee: Double)

data class CheckoutFormState(
    val coupon: String = "",
    val discount: Double = 0.0,
    val couponSubtotal: Double? = null,
    val isApplyingCoupon: Boolean = false,
    val couponError: String? = null,
    val wallet: String = "",
    val useStoreWallet: Boolean = false,
    val delivery: CustomerAddress = CustomerAddress(),
    val shippingRates: Map<String, Double>? = null,
    val rateLoadFailed: Boolean = false,
    val paymentMethod: PaymentMethod = PaymentMethod.COD,
    val isSubmitting: Boolean = false,
    val submitError: String? = null,
    val confirmedReceipt: SavedOrderReceipt? = null,
)

data class CheckoutUiState(
    val form: CheckoutFormState = CheckoutFormState(),
    val cartItems: List<CartItem> = emptyList(),
    val subtotal: Double = 0.0,
    val storeSettings: StoreSettings = StoreSettings(),
    val signedInEmail: String? = null,
    val walletBalance: Double = 0.0,
) {
    val shippingFee: Double
        get() = if (cartItems.isEmpty() || storeSettings.isFreeShippingUnlocked(subtotal)) 0.0
            else form.shippingRates?.get(form.delivery.governorate) ?: storeSettings.shippingFee

    val appliedDiscount: Double
        get() = if (form.couponSubtotal == subtotal) form.discount else 0.0

    val preWalletTotal: Double
        get() = (subtotal - appliedDiscount).coerceAtLeast(0.0) + shippingFee

    val canUseStoreWallet: Boolean
        get() = signedInEmail != null && walletBalance > 0.0

    val walletApplied: Double
        get() = if (canUseStoreWallet && form.useStoreWallet) {
            minOf(walletBalance, preWalletTotal)
        } else {
            0.0
        }

    val grandTotal: Double
        get() = (preWalletTotal - walletApplied).coerceAtLeast(0.0)

    val fullyPaidByWallet: Boolean
        get() = walletApplied > 0.0 && grandTotal <= 0.0
}

@HiltViewModel
class CheckoutViewModel @Inject constructor(
    val network: com.whitelabel.commerce.core.data.remote.NetworkState,
    private val cartRepository: CartRepository,
    private val orderRepository: OrderRepository,
    private val authRepository: AuthRepository,
    private val walletRepository: WalletRepository,
    storeRepository: StoreRepository,
    private val db: SupabaseClient,
) : ViewModel() {

    private val formState = MutableStateFlow(CheckoutFormState())
    private val walletBalanceState = MutableStateFlow(0.0)

    // Held stable across retries for identical cart + form so `mobile_checkout` stays idempotent.
    private var idempotencyKey: String = UUID.randomUUID().toString()

    init {
        loadShippingRates()
        // Automatically pre-fill Checkout fields from the signed-in customer's saved profile
        // without overwriting anything the user has already typed.
        viewModelScope.launch {
            authRepository.sessionState.collect { session ->
                if (session is AuthSessionState.SignedIn) {
                    val profile = session.profile
                    val normalizedPhone = PhoneNormalizer.normalize(profile.phone)
                    formState.update { current ->
                        current.copy(
                            delivery = if (current.delivery == CustomerAddress()) CustomerAddress(
                                recipientName = profile.fullName, phone = normalizedPhone,
                                governorate = EgyptLocations.findGovernorate(profile.governorate)?.id.orEmpty(),
                                city = profile.city, street = profile.address,
                            ) else current.delivery,
                            wallet = current.wallet.ifBlank { normalizedPhone.takeIf(WALLET_REGEX::matches).orEmpty() },
                        )
                    }
                    refreshWalletBalance()
                } else if (session is AuthSessionState.SignedOut) {
                    walletBalanceState.value = 0.0
                    formState.update { it.copy(useStoreWallet = false, delivery = CustomerAddress()) }
                }
            }
        }
    }

    fun loadShippingRates() {
        formState.update { it.copy(rateLoadFailed = false) }
        viewModelScope.launch {
            runCatching {
                db.from("governorate_shipping_rates").select(Columns.list("governorate","fee")) {
                    filter { eq("store_id", BuildConfig.STORE_ID) }
                }.decodeList<ShippingRate>().associate { it.governorate to it.fee }
            }.onSuccess { rates -> formState.update { it.copy(shippingRates = rates) } }
                .onFailure { formState.update { it.copy(rateLoadFailed = true) } }
        }
    }

    private fun refreshWalletBalance() {
        viewModelScope.launch {
            walletRepository.getMyWalletSummary()
                .onSuccess { summary -> walletBalanceState.value = summary.balance.coerceAtLeast(0.0) }
        }
    }

    val uiState: StateFlow<CheckoutUiState> = combine(
        formState,
        cartRepository.cartItems,
        cartRepository.subtotal,
        storeRepository.storeSettings,
        combine(authRepository.sessionState, walletBalanceState) { s, bal -> s to bal },
    ) { form, items, subtotal, settings, (session, walletBal) ->
        val resolvedMethod = form.paymentMethod.takeIf { it in settings.paymentMethods }
            ?: settings.paymentMethods.firstOrNull()
            ?: PaymentMethod.COD
        CheckoutUiState(
            form = form.copy(paymentMethod = resolvedMethod),
            cartItems = items,
            subtotal = subtotal,
            storeSettings = settings,
            signedInEmail = (session as? AuthSessionState.SignedIn)?.email?.takeIf { it.isNotBlank() },
            walletBalance = walletBal,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = CheckoutUiState(storeSettings = storeRepository.storeSettings.value),
    )

    fun setUseStoreWallet(enabled: Boolean) {
        formState.update { it.copy(useStoreWallet = enabled, submitError = null) }
    }

    fun method(value: PaymentMethod) {
        formState.update { it.copy(paymentMethod = value, submitError = null) }
    }

    fun wallet(value: String) {
        val normalized = PhoneNormalizer.normalize(value)
        formState.update { it.copy(wallet = normalized, submitError = null) }
    }

    fun coupon(value: String) {
        formState.update {
            it.copy(
                coupon = value,
                discount = 0.0,
                couponSubtotal = null,
                couponError = null,
                submitError = null,
            )
        }
    }

    fun applyCoupon() {
        val current = uiState.value
        val code = current.form.coupon.trim()
        if (code.isEmpty() || formState.value.isApplyingCoupon) return
        formState.update { it.copy(isApplyingCoupon = true, couponError = null, submitError = null) }
        viewModelScope.launch {
            val result = orderRepository.couponDiscount(code, current.subtotal)
            formState.update {
                if (it.coupon.trim() != code) {
                    it.copy(isApplyingCoupon = false)
                } else {
                    it.copy(
                        isApplyingCoupon = false,
                        discount = result.getOrDefault(0.0),
                        couponSubtotal = if (result.isSuccess) current.subtotal else null,
                        couponError = if (result.isFailure) {
                            localized("كود الخصم غير صالح أو لا ينطبق على سلتك.", "Invalid or ineligible promo code.")
                        } else {
                            null
                        },
                    )
                }
            }
        }
    }

    fun setDelivery(value: CustomerAddress) {
        formState.update { it.copy(delivery = value, submitError = null) }
    }

    fun submitOrder() {
        val current = uiState.value
        val form = formState.value
        if (form.isSubmitting || form.shippingRates == null || form.confirmedReceipt != null) return

        val effectiveMethod = if (current.fullyPaidByWallet) {
            PaymentMethod.STORE_WALLET
        } else {
            form.paymentMethod
        }

        if (!current.storeSettings.isSyncedFromRemote ||
            (!current.fullyPaidByWallet && effectiveMethod !in current.storeSettings.paymentMethods)
        ) {
            formState.update {
                it.copy(submitError = localized("طريقة الدفع المختارة غير متاحة حالياً.", "Selected payment method is currently unavailable."))
            }
            return
        }

        val cleanWallet = PhoneNormalizer.normalize(form.wallet)
        if (effectiveMethod == PaymentMethod.WALLET && !WALLET_REGEX.matches(cleanWallet)) {
            formState.update {
                it.copy(
                    submitError = localized(
                        "يرجى إدخال رقم محفظة مصري صحيح من 11 رقماً (010/011/012/015).",
                        "Enter a valid 11-digit Egyptian wallet number (010/011/012/015).",
                    ),
                )
            }
            return
        }

        val cleanName = form.delivery.recipientName.trim()
        val cleanGov = form.delivery.governorate.trim()
        val cleanCity = form.delivery.city.trim()
        val cleanStreet = form.delivery.street.trim()
        val rawPhone = form.delivery.phone.trim()

        val nameError = if (cleanName.length < 2) {
            localized("يرجى إدخال الاسم بالكامل", "Enter your full name.")
        } else {
            null
        }
        val phoneError = if (!PhoneNormalizer.isValid(PhoneNormalizer.normalizeForEgyptCheckout(rawPhone))) {
            localized(
                "يرجى إدخال رقم موبايل مصري صحيح (مثال: 010xxxxxxxx أو +2010xxxxxxxx)",
                "Enter a valid Egyptian mobile number.",
            )
        } else {
            null
        }
        val govError = if (cleanGov.isEmpty()) {
            localized("يرجى اختيار المحافظة", "Please select a governorate.")
        } else {
            null
        }
        val cityError = if (cleanCity.isEmpty()) {
            localized("يرجى اختيار المدينة / المركز", "Please select a city or district.")
        } else {
            null
        }
        val addressError = if (cleanStreet.isBlank()) {
            localized(
                "يرجى إدخال اسم الشارع",
                "Enter your street.",
            )
        } else {
            null
        }

        if (nameError != null || phoneError != null || govError != null || cityError != null || addressError != null) {
            formState.update {
                it.copy(
                    submitError = nameError ?: phoneError ?: govError ?: cityError ?: addressError,
                )
            }
            return
        }

        val cleanAddress = form.delivery.addressLine()

        if (current.cartItems.isEmpty()) {
            formState.update {
                it.copy(submitError = localized("السلة فارغة ولا يمكن إتمام الطلب.", "Your cart is empty."))
            }
            return
        }

        val normalizedPhone = PhoneNormalizer.normalizeForEgyptCheckout(rawPhone)
        val cartSnapshot = current.cartItems
        val subtotalSnapshot = current.subtotal
        val shippingSnapshot = current.shippingFee
        val couponToSend = form.coupon.trim().takeIf { it.isNotEmpty() && form.couponSubtotal == current.subtotal }
        val useWalletFlag = current.canUseStoreWallet && form.useStoreWallet

        formState.update { it.copy(isSubmitting = true, submitError = null) }
        viewModelScope.launch {

            orderRepository.placeOrder(
                method = effectiveMethod,
                coupon = couponToSend,
                name = cleanName,
                shippingAddress = cleanAddress,
                customerPhone = normalizedPhone,
                items = cartSnapshot,
                requestKey = idempotencyKey,
                useWallet = useWalletFlag,
                delivery = DeliveryPin(cleanGov, form.delivery.lat, form.delivery.lng),
            ).onSuccess { result ->
                val isPaidViaWallet = effectiveMethod == PaymentMethod.STORE_WALLET || result.amount <= 0.0
                val receiptMethod = if (isPaidViaWallet) PaymentMethod.STORE_WALLET.rawValue else effectiveMethod.rawValue
                val receiptPaymentStatus = when {
                    isPaidViaWallet -> "paid"
                    effectiveMethod == PaymentMethod.COD -> "unpaid"
                    else -> "pending"
                }
                val receipt = SavedOrderReceipt(
                    orderNumber = result.orderNumber,
                    method = receiptMethod,
                    paymentStatus = receiptPaymentStatus,
                    customerName = cleanName,
                    phone = normalizedPhone,
                    shippingAddress = cleanAddress,
                    currency = result.currency,
                    subtotal = subtotalSnapshot,
                    shippingFee = shippingSnapshot,
                    total = result.amount,
                    status = if (isPaidViaWallet) OrderStatus.CONFIRMED else OrderStatus.PENDING,
                    createdAt = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).format(Date()),
                    items = cartSnapshot.map { line ->
                        SavedOrderLine(
                            productId = line.productId,
                            productName = line.productName,
                            productNameEn = line.productNameEn,
                            unitPrice = line.unitPrice,
                            quantity = line.quantity,
                            size = line.selectedSize,
                            color = line.selectedColor,
                        )
                    },
                )
                orderRepository.saveLocalOrderReceipt(receipt)
                // COD & full Store Wallet clear cart immediately; Paymob online methods keep cart intact until paid!
                if (effectiveMethod == PaymentMethod.COD || isPaidViaWallet) {
                    cartRepository.settleReceipt(receipt)
                }
                if (useWalletFlag) {
                    refreshWalletBalance()
                }
                idempotencyKey = UUID.randomUUID().toString()

                formState.update {
                    it.copy(
                        isSubmitting = false,
                        confirmedReceipt = receipt,
                    )
                }
            }.onFailure { error ->
                val rawMessage = error.message.orEmpty()
                if ("checkout_key_conflict" in rawMessage) {
                    idempotencyKey = UUID.randomUUID().toString()
                }
                formState.update {
                    it.copy(
                        isSubmitting = false,
                        submitError = mapCheckoutError(rawMessage),
                    )
                }
            }
        }
    }

    private fun mapCheckoutError(raw: String): String = when {
        "insufficient_wallet_balance" in raw -> localized(
            "رصيد المحفظة لم يعد كافياً لتغطية كامل قيمة الطلب.",
            "Your wallet balance is no longer sufficient to cover the full order.",
        )
        "stock_unavailable" in raw -> localized(
            "بعض المنتجات غير متوفرة حالياً بالكمية المطلوبة. يرجى مراجعة السلة.",
            "Some items are no longer available in this quantity.",
        )
        "invalid_variant" in raw -> localized(
            "المقاس أو اللون المختار لم يعد متاحاً لأحد المنتجات.",
            "A selected size or color is unavailable.",
        )
        "invalid_coupon" in raw -> localized(
            "كود الخصم غير صالح أو انتهت صلاحيته.",
            "Promo code is invalid or expired.",
        )
        "payment_method_disabled" in raw -> localized(
            "طريقة الدفع المختارة غير مفعّلة لهذا المتجر.",
            "Selected payment method is disabled for this store.",
        )
        "invalid_checkout" in raw -> localized(
            "يرجى التأكد من صحة رقم الهاتف وعنوان التوصيل.",
            "Check your phone and delivery address.",
        )
        "invalid_cart" in raw -> localized("السلة غير صالحة أو فارغة.", "Invalid or empty cart.")
        "checkout_key_conflict" in raw -> localized(
            "تغيرت تفاصيل الطلب. يرجى المحاولة مرة أخرى.",
            "Order details changed. Please try again.",
        )
        "function public.mobile_checkout" in raw || "PGRST202" in raw ->
            localized("خدمة تأكيد الطلبات غير متاحة حالياً.", "Checkout is currently unavailable.")
        else -> localized(
            "تعذر إتمام الطلب حالياً. يرجى المحاولة مرة أخرى.",
            "Unable to complete checkout. Please try again.",
        )
    }
}
