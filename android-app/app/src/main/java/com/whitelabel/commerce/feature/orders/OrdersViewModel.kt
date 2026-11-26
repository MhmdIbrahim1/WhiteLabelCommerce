package com.whitelabel.commerce.feature.orders

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.AuthSessionState
import com.whitelabel.commerce.core.domain.model.GuestOrderTracking
import com.whitelabel.commerce.core.domain.model.Order
import com.whitelabel.commerce.core.domain.model.ReturnRefundMethod
import com.whitelabel.commerce.core.domain.model.ReturnRequest
import com.whitelabel.commerce.core.domain.model.ReturnRequestStatus
import com.whitelabel.commerce.core.domain.model.ReturnRequestType
import com.whitelabel.commerce.core.domain.model.ReturnSubmissionItem
import com.whitelabel.commerce.core.domain.model.SavedOrderReceipt
import com.whitelabel.commerce.core.domain.model.StoreSettings
import com.whitelabel.commerce.core.domain.repository.AuthRepository
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
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import io.github.jan.supabase.realtime.PostgresAction
import javax.inject.Inject

data class OrderTrackingFormState(
    val orderNumberInput: String = "",
    val phoneInput: String = "",
    val trackedResult: GuestOrderTracking? = null,
    val isTracking: Boolean = false,
    val trackingError: String? = null,
    val refreshingOrderNumber: String? = null,
    val accountOrders: List<Order> = emptyList(),
    val isLoadingAccountOrders: Boolean = false,
    val returnsByOrderId: Map<String, ReturnRequest> = emptyMap(),
    val detailOrderId: String? = null,
    val detailOrder: Order? = null,
    val detailReturnRequest: ReturnRequest? = null,
    val isLoadingDetail: Boolean = false,
    val isSubmittingReturn: Boolean = false,
    val returnSubmitError: String? = null,
    val refreshedWalletBalance: Double? = null,
)

sealed interface SwitchToCodOutcome {
    data object Success : SwitchToCodOutcome
    data object RequiresSignIn : SwitchToCodOutcome
    data object Failure : SwitchToCodOutcome
}

internal fun receiptListKey(orderNumber: String) = "receipt:${orderNumber.trim().lowercase()}"
internal fun accountListKey(orderId: String) = "order:${orderId.trim().lowercase()}"

internal fun <T> List<T>.distinctOrders(id: (T) -> String): List<T> =
    filter { id(it).isNotBlank() }.distinctBy { id(it).trim().lowercase() }

data class OrdersUiState(
    val tracking: OrderTrackingFormState = OrderTrackingFormState(),
    val localReceipts: List<SavedOrderReceipt> = emptyList(),
    val storeSettings: StoreSettings = StoreSettings(),
    val isSignedIn: Boolean = false,
) {
    val matchedReceiptForTracked: SavedOrderReceipt?
        get() {
            val id = tracking.trackedResult?.id ?: return null
            return localReceipts.firstOrNull { it.orderNumber.equals(id, ignoreCase = true) }
        }
}

@HiltViewModel
class OrdersViewModel @Inject constructor(
    private val supabase: io.github.jan.supabase.SupabaseClient,
    private val orderRepository: OrderRepository,
    private val authRepository: AuthRepository,
    private val walletRepository: WalletRepository,
    storeRepository: StoreRepository,
) : ViewModel() {

    private val trackingState = MutableStateFlow(OrderTrackingFormState())

    val uiState: StateFlow<OrdersUiState> = combine(
        trackingState,
        orderRepository.savedLocalOrders,
        storeRepository.storeSettings,
        authRepository.sessionState,
    ) { tracking, receipts, settings, session ->
        OrdersUiState(
            tracking = tracking.copy(accountOrders = if (session is AuthSessionState.SignedIn) {
                tracking.accountOrders.filter { it.userId == session.userId }.distinctOrders { it.id }
            } else emptyList()),
            localReceipts = receipts.distinctOrders { it.orderNumber },
            storeSettings = settings,
            isSignedIn = session is AuthSessionState.SignedIn,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = OrdersUiState(
            storeSettings = storeRepository.storeSettings.value,
            isSignedIn = authRepository.sessionState.value is AuthSessionState.SignedIn,
        ),
    )

    init {
        viewModelScope.launch {
            authRepository.sessionState.collect { session ->
                when (session) {
                    is AuthSessionState.SignedIn -> loadAccountOrders()
                    AuthSessionState.SignedOut -> trackingState.update {
                        it.copy(
                            accountOrders = emptyList(),
                            returnsByOrderId = emptyMap(),
                            detailReturnRequest = null,
                            refreshedWalletBalance = null,
                        )
                    }
                    AuthSessionState.Loading -> Unit
                }
            }
        }
    }

    fun prefillAndTrack(orderNumber: String, phone: String) {
        trackingState.update {
            it.copy(
                orderNumberInput = orderNumber,
                phoneInput = phone,
                trackingError = null,
            )
        }
        trackOrder()
    }

    fun onOrderNumberChange(value: String) {
        trackingState.update { it.copy(orderNumberInput = value, trackingError = null) }
    }

    fun onPhoneChange(value: String) {
        trackingState.update { it.copy(phoneInput = value, trackingError = null) }
    }

    fun trackOrder() {
        val current = trackingState.value
        val orderId = current.orderNumberInput.trim()
        val phone = current.phoneInput.trim()

        if (orderId.isEmpty() || phone.isEmpty()) {
            trackingState.update {
                it.copy(trackingError = localized("يرجى إدخال رقم الطلب ورقم الهاتف المستخدم أثناء الشراء.", "Enter the order number and phone used at checkout."))
            }
            return
        }

        viewModelScope.launch {
            trackingState.update { it.copy(isTracking = true, trackingError = null) }
            orderRepository.trackGuestOrder(orderNumber = orderId, customerPhone = phone)
                .onSuccess { result ->
                    trackingState.update {
                        it.copy(
                            trackedResult = result,
                            isTracking = false,
                            trackingError = if (result == null) {
                                localized("لم يتم العثور على طلب مطابق لهذا الرقم والهاتف.", "No matching order found.")
                            } else {
                                null
                            },
                        )
                    }
                }
                .onFailure { error ->
                    trackingState.update {
                        it.copy(
                            isTracking = false,
                            trackingError = localized("تعذر تتبع الطلب حالياً.", "Tracking is temporarily unavailable."),
                        )
                    }
                }
        }
    }

    fun refreshLocalReceiptStatus(receipt: SavedOrderReceipt) {
        viewModelScope.launch {
            trackingState.update { it.copy(refreshingOrderNumber = receipt.orderNumber) }
            orderRepository.trackGuestOrder(
                orderNumber = receipt.orderNumber,
                customerPhone = receipt.phone,
            ).onSuccess { result ->
                if (result != null) {
                    trackingState.update {
                        it.copy(
                            orderNumberInput = receipt.orderNumber,
                            phoneInput = receipt.phone,
                            trackedResult = result,
                            trackingError = null,
                        )
                    }
                }
            }
            trackingState.update { it.copy(refreshingOrderNumber = null) }
        }
    }

    suspend fun observePayments(receipts: List<SavedOrderReceipt>) {
        val channel = supabase.realtime.channel("receipt-updates-" + com.whitelabel.commerce.BuildConfig.STORE_ID)
        try {
            val changes = channel.postgresChangeFlow<PostgresAction.Update>("public") {
                table = "orders"
                filter("store_id", io.github.jan.supabase.postgrest.query.filter.FilterOperator.EQ, com.whitelabel.commerce.BuildConfig.STORE_ID)
            }
            channel.subscribe()
            changes.collect { change ->
                val id = (change.record["id"] as? kotlinx.serialization.json.JsonPrimitive)?.content
                if (receipts.any { it.orderNumber == id }) refreshPayments(receipts)
            }
        } finally {
            kotlinx.coroutines.withContext(kotlinx.coroutines.NonCancellable) { supabase.realtime.removeChannel(channel) }
        }
    }

    suspend fun refreshPayments(receipts: List<SavedOrderReceipt>) {
        val accounts = orderRepository.getMyOrders().getOrNull().orEmpty()
        val returns = orderRepository.getMyReturnRequests().getOrNull().orEmpty()
        trackingState.update { it.copy(accountOrders = accounts, returnsByOrderId = returns) }
        for (receipt in receipts) {
            if (accounts.none { it.id == receipt.orderNumber }) orderRepository.trackGuestOrder(receipt.orderNumber, receipt.phone)
        }
    }

    fun loadAccountOrders() {
        viewModelScope.launch {
            trackingState.update { it.copy(isLoadingAccountOrders = true) }
            val orders = orderRepository.getMyOrders().getOrNull()
            val returns = orderRepository.getMyReturnRequests().getOrNull()
            trackingState.update { prev ->
                prev.copy(
                    accountOrders = orders ?: prev.accountOrders,
                    returnsByOrderId = returns ?: prev.returnsByOrderId,
                    isLoadingAccountOrders = false,
                )
            }
            if (returns != null && returns.values.any { it.status == ReturnRequestStatus.REFUNDED || it.walletCredited }) {
                refreshWalletBalance()
            }
        }
    }

    fun loadOrderDetail(orderId: String) {
        val cleanId = orderId.trim()
        if (cleanId.isEmpty()) return
        viewModelScope.launch {
            trackingState.update {
                it.copy(
                    detailOrderId = cleanId,
                    isLoadingDetail = true,
                    returnSubmitError = null,
                )
            }
            val orders = orderRepository.getMyOrders().getOrNull().orEmpty()
            val matchedOrder = orders.firstOrNull { it.id.equals(cleanId, ignoreCase = true) }
            val returnReq = orderRepository.getReturnRequestForOrder(cleanId).getOrNull()

            trackingState.update { prev ->
                val updatedMap = if (returnReq != null) {
                    prev.returnsByOrderId + (cleanId to returnReq)
                } else {
                    prev.returnsByOrderId
                }
                prev.copy(
                    accountOrders = if (orders.isNotEmpty()) orders else prev.accountOrders,
                    returnsByOrderId = updatedMap,
                    detailOrder = matchedOrder,
                    detailReturnRequest = returnReq,
                    isLoadingDetail = false,
                )
            }

            if (returnReq?.status == ReturnRequestStatus.REFUNDED || returnReq?.walletCredited == true) {
                refreshWalletBalance()
            }
        }
    }

    fun refreshWalletBalance() {
        viewModelScope.launch {
            walletRepository.getMyWalletSummary()
                .onSuccess { summary ->
                    trackingState.update { it.copy(refreshedWalletBalance = summary.balance) }
                }
        }
    }

    fun clearReturnError() {
        trackingState.update { it.copy(returnSubmitError = null) }
    }

    fun submitReturnRequest(
        orderId: String,
        requestType: ReturnRequestType,
        refundMethod: ReturnRefundMethod,
        reason: String,
        customerNotes: String?,
        items: List<ReturnSubmissionItem>,
        onSuccess: (ReturnRequest) -> Unit,
    ) {
        if (trackingState.value.isSubmittingReturn) return
        trackingState.update { it.copy(isSubmittingReturn = true, returnSubmitError = null) }
        viewModelScope.launch {
            orderRepository.submitReturnRequest(
                orderId = orderId,
                requestType = requestType,
                refundMethod = refundMethod,
                reason = reason,
                customerNotes = customerNotes,
                items = items,
            ).onSuccess { created ->
                trackingState.update { prev ->
                    prev.copy(
                        isSubmittingReturn = false,
                        returnSubmitError = null,
                        returnsByOrderId = prev.returnsByOrderId + (orderId to created),
                        detailReturnRequest = if (prev.detailOrderId.equals(orderId, ignoreCase = true)) {
                            created
                        } else {
                            prev.detailReturnRequest
                        },
                    )
                }
                if (created.status == ReturnRequestStatus.REFUNDED || created.walletCredited) {
                    refreshWalletBalance()
                }
                onSuccess(created)
            }.onFailure { err ->
                val raw = err.message.orEmpty().lowercase()
                val friendly = when {
                    "return_already_exists" in raw -> localized(
                        "يوجد بالفعل طلب إرجاع أو استبدال نشط لهذا الطلب.",
                        "An active return or exchange request already exists for this order.",
                    )
                    "order_not_delivered" in raw -> localized(
                        "الإرجاع والاستبدال متاحان فقط بعد تسليم الطلب.",
                        "Returns are only available after the order has been delivered.",
                    )
                    "invalid_return_quantity" in raw -> localized(
                        "الكمية المختارة تتجاوز الكمية المطلوبة.",
                        "Selected quantity exceeds the ordered quantity.",
                    )
                    "not_authorized" in raw -> localized(
                        "يرجى تسجيل الدخول للمتابعة.",
                        "Please sign in to submit a return request.",
                    )
                    else -> localized(
                        "تعذر إرسال طلب الإرجاع حالياً. يرجى المحاولة مرة أخرى.",
                        "Could not submit your return request right now. Please try again.",
                    )
                }
                trackingState.update {
                    it.copy(
                        isSubmittingReturn = false,
                        returnSubmitError = friendly,
                    )
                }
            }
        }
    }

    fun updateRetryMethodLocally(orderNumber: String, method: String) {
        viewModelScope.launch {
            orderRepository.updateLocalOrderPaymentMethod(orderNumber, method)
        }
    }

    fun switchOrderToCod(
        orderNumber: String,
        phone: String,
        onComplete: (SwitchToCodOutcome) -> Unit,
    ) {
        if (authRepository.sessionState.value !is AuthSessionState.SignedIn) {
            onComplete(SwitchToCodOutcome.RequiresSignIn)
            return
        }
        viewModelScope.launch {
            val result = orderRepository.switchOrderToCod(orderNumber, phone)
            if (result.isSuccess) {
                loadAccountOrders()
                if (phone.isNotBlank()) {
                    prefillAndTrack(orderNumber, phone)
                }
                onComplete(SwitchToCodOutcome.Success)
            } else {
                val raw = result.exceptionOrNull()?.message.orEmpty().lowercase()
                if ("not_authorized" in raw || "unauthorized" in raw) {
                    onComplete(SwitchToCodOutcome.RequiresSignIn)
                } else {
                    onComplete(SwitchToCodOutcome.Failure)
                }
            }
        }
    }
}
