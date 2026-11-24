package com.whitelabel.commerce.feature.checkout

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

data class CheckoutFormState(
    val coupon: String = "",
    val discount: Double = 0.0,
    val couponSubtotal: Double? = null,
    val isApplyingCoupon: Boolean = false,
    val couponError: String? = null,
    val wallet: String = "",
    val customerName: String = "",
    val phone: String = "",
    val address: String = "",
    val paymentMethod: PaymentMethod = PaymentMethod.COD,
    val nameError: String? = null,
    val phoneError: String? = null,
    val addressError: String? = null,
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
) {
    val shippingFee: Double
        get() = if (cartItems.isEmpty()) 0.0 else storeSettings.shippingFee

    val appliedDiscount: Double
        get() = if (form.couponSubtotal == subtotal) form.discount else 0.0

    val grandTotal: Double
        get() = (subtotal - appliedDiscount).coerceAtLeast(0.0) + shippingFee
}

@HiltViewModel
class CheckoutViewModel @Inject constructor(
    private val cartRepository: CartRepository,
    private val orderRepository: OrderRepository,
    private val authRepository: AuthRepository,
    storeRepository: StoreRepository,
) : ViewModel() {

    private val formState = MutableStateFlow(CheckoutFormState())

    // Held stable across retries for identical cart + form so `mobile_checkout` stays idempotent.
    private var idempotencyKey: String = UUID.randomUUID().toString()

    init {
        // Automatically pre-fill Checkout fields from the signed-in customer's saved profile
        // without overwriting anything the user has already typed.
        viewModelScope.launch {
            authRepository.sessionState.collect { session ->
                if (session is AuthSessionState.SignedIn) {
                    val profile = session.profile
                    val combinedAddr = profile.combinedShippingAddress()
                    val normalizedPhone = PhoneNormalizer.normalize(profile.phone)
                    formState.update { current ->
                        current.copy(
                            customerName = current.customerName.ifBlank { profile.fullName },
                            phone = current.phone.ifBlank { normalizedPhone },
                            wallet = current.wallet.ifBlank {
                                if (WALLET_REGEX.matches(normalizedPhone)) normalizedPhone else ""
                            },
                            address = current.address.ifBlank { combinedAddr },
                        )
                    }
                }
            }
        }
    }

    val uiState: StateFlow<CheckoutUiState> = combine(
        formState,
        cartRepository.cartItems,
        cartRepository.subtotal,
        storeRepository.storeSettings,
        authRepository.sessionState,
    ) { form, items, subtotal, settings, session ->
        val resolvedMethod = form.paymentMethod.takeIf { it in settings.paymentMethods }
            ?: settings.paymentMethods.firstOrNull()
            ?: PaymentMethod.COD
        CheckoutUiState(
            form = form.copy(paymentMethod = resolvedMethod),
            cartItems = items,
            subtotal = subtotal,
            storeSettings = settings,
            signedInEmail = (session as? AuthSessionState.SignedIn)?.email?.takeIf { it.isNotBlank() },
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = CheckoutUiState(storeSettings = storeRepository.storeSettings.value),
    )

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
        if (code.isEmpty()) return
        viewModelScope.launch {
            formState.update { it.copy(isApplyingCoupon = true, couponError = null, submitError = null) }
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

    fun onNameChange(value: String) {
        formState.update { it.copy(customerName = value, nameError = null, submitError = null) }
    }

    fun onPhoneChange(value: String) {
        formState.update { it.copy(phone = value, phoneError = null, submitError = null) }
    }

    fun onAddressChange(value: String) {
        formState.update { it.copy(address = value, addressError = null, submitError = null) }
    }

    fun submitOrder() {
        val current = uiState.value
        val form = current.form
        if (form.isSubmitting || form.confirmedReceipt != null) return

        if (form.paymentMethod !in current.storeSettings.paymentMethods || !current.storeSettings.isSyncedFromRemote) {
            formState.update {
                it.copy(submitError = localized("طريقة الدفع المختارة غير متاحة حالياً.", "Selected payment method is currently unavailable."))
            }
            return
        }

        val cleanWallet = PhoneNormalizer.normalize(form.wallet)
        if (form.paymentMethod == PaymentMethod.WALLET && !WALLET_REGEX.matches(cleanWallet)) {
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

        val cleanName = form.customerName.trim()
        val cleanAddress = form.address.trim()
        val rawPhone = form.phone.trim()

        val nameError = if (cleanName.length < 2) {
            localized("يرجى إدخال الاسم بالكامل", "Enter your full name.")
        } else {
            null
        }
        val phoneError = if (!PhoneNormalizer.isValidEgyptianPhone(rawPhone)) {
            localized(
                "يرجى إدخال رقم موبايل مصري صحيح (مثال: 010xxxxxxxx أو +2010xxxxxxxx)",
                "Enter a valid Egyptian mobile number.",
            )
        } else {
            null
        }
        val addressError = if (cleanAddress.length < 5) {
            localized(
                "يرجى إدخال عنوان التوصيل بالتفصيل (المحافظة، المنطقة، الشارع)",
                "Enter the full delivery address.",
            )
        } else {
            null
        }

        if (nameError != null || phoneError != null || addressError != null) {
            formState.update {
                it.copy(
                    nameError = nameError,
                    phoneError = phoneError,
                    addressError = addressError,
                )
            }
            return
        }

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

        viewModelScope.launch {
            formState.update { it.copy(isSubmitting = true, submitError = null) }

            orderRepository.placeOrder(
                method = form.paymentMethod,
                coupon = couponToSend,
                name = cleanName,
                shippingAddress = cleanAddress,
                customerPhone = normalizedPhone,
                items = cartSnapshot,
                requestKey = idempotencyKey,
            ).onSuccess { result ->
                val receipt = SavedOrderReceipt(
                    orderNumber = result.orderNumber,
                    method = form.paymentMethod.rawValue,
                    paymentStatus = if (form.paymentMethod == PaymentMethod.COD) "unpaid" else "pending",
                    customerName = cleanName,
                    phone = normalizedPhone,
                    shippingAddress = cleanAddress,
                    currency = result.currency,
                    subtotal = subtotalSnapshot,
                    shippingFee = shippingSnapshot,
                    total = result.amount,
                    status = OrderStatus.PENDING,
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
                // COD clears cart immediately; Paymob online methods keep cart intact until paid!
                if (form.paymentMethod == PaymentMethod.COD) {
                    cartRepository.settleReceipt(receipt)
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
