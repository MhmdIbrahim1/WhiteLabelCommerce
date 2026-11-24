package com.whitelabel.commerce.feature.orders

import com.whitelabel.commerce.core.designsystem.localized

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.whitelabel.commerce.core.domain.model.AuthSessionState
import com.whitelabel.commerce.core.domain.model.GuestOrderTracking
import com.whitelabel.commerce.core.domain.model.Order
import com.whitelabel.commerce.core.domain.model.SavedOrderReceipt
import com.whitelabel.commerce.core.domain.model.StoreSettings
import com.whitelabel.commerce.core.domain.repository.AuthRepository
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
)

data class OrdersUiState(
    val tracking: OrderTrackingFormState = OrderTrackingFormState(),
    val localReceipts: List<SavedOrderReceipt> = emptyList(),
    val storeSettings: StoreSettings = StoreSettings(),
) {
    val matchedReceiptForTracked: SavedOrderReceipt?
        get() {
            val id = tracking.trackedResult?.id ?: return null
            return localReceipts.firstOrNull { it.orderNumber.equals(id, ignoreCase = true) }
        }
}

@HiltViewModel
class OrdersViewModel @Inject constructor(
    private val orderRepository: OrderRepository,
    private val authRepository: AuthRepository,
    storeRepository: StoreRepository,
) : ViewModel() {

    private val trackingState = MutableStateFlow(OrderTrackingFormState())

    val uiState: StateFlow<OrdersUiState> = combine(
        trackingState,
        orderRepository.savedLocalOrders,
        storeRepository.storeSettings,
    ) { tracking, receipts, settings ->
        OrdersUiState(
            tracking = tracking,
            localReceipts = receipts,
            storeSettings = settings,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = OrdersUiState(storeSettings = storeRepository.storeSettings.value),
    )

    init {
        loadAccountOrders()
        viewModelScope.launch {
            authRepository.sessionState.collect { session ->
                when (session) {
                    is AuthSessionState.SignedIn -> loadAccountOrders()
                    AuthSessionState.SignedOut -> trackingState.update { it.copy(accountOrders = emptyList()) }
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
                            trackingError = error.localizedMessage ?: localized("تعذر تتبع الطلب حالياً.", "Tracking is temporarily unavailable."),
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

    suspend fun refreshPayments(receipts: List<SavedOrderReceipt>) {
        val accounts = orderRepository.getMyOrders().getOrNull().orEmpty()
        trackingState.update { it.copy(accountOrders = accounts) }
        for (receipt in receipts) {
            if (accounts.none { it.id == receipt.orderNumber }) orderRepository.trackGuestOrder(receipt.orderNumber, receipt.phone)
        }
    }

    fun loadAccountOrders() {
        viewModelScope.launch {
            trackingState.update { it.copy(isLoadingAccountOrders = true) }
            orderRepository.getMyOrders()
                .onSuccess { list ->
                    trackingState.update {
                        it.copy(accountOrders = list, isLoadingAccountOrders = false)
                    }
                }
                .onFailure {
                    trackingState.update { it.copy(isLoadingAccountOrders = false) }
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
        onComplete: (Boolean) -> Unit,
    ) {
        viewModelScope.launch {
            val result = orderRepository.switchOrderToCod(orderNumber, phone)
            if (result.isSuccess) {
                loadAccountOrders()
                if (phone.isNotBlank()) {
                    prefillAndTrack(orderNumber, phone)
                }
            }
            onComplete(result.isSuccess)
        }
    }
}
