package com.whitelabel.commerce.feature.support

import com.whitelabel.commerce.core.designsystem.localized

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.whitelabel.commerce.core.domain.model.SavedOrderReceipt
import com.whitelabel.commerce.core.domain.model.StoreSettings
import com.whitelabel.commerce.core.domain.model.SupportTicket
import com.whitelabel.commerce.core.domain.model.AuthSessionState
import com.whitelabel.commerce.core.domain.repository.AuthRepository
import com.whitelabel.commerce.core.domain.repository.OrderRepository
import com.whitelabel.commerce.core.domain.repository.StoreRepository
import com.whitelabel.commerce.core.domain.repository.SupportRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SupportFormState(
    val subject: String = "",
    val message: String = "",
    val linkedOrderId: String = "",
    val subjectError: String? = null,
    val messageError: String? = null,
    val isSubmitting: Boolean = false,
    val submitError: String? = null,
    val submitSuccess: Boolean = false,
    val remoteTickets: List<SupportTicket> = emptyList(),
    val isLoadingTickets: Boolean = false,
    val ticketLoadFailed: Boolean = false,
)

data class SupportUiState(
    val form: SupportFormState = SupportFormState(),
    val localTickets: List<SupportTicket> = emptyList(),
    val recentOrders: List<SavedOrderReceipt> = emptyList(),
    val storeSettings: StoreSettings = StoreSettings(),
) {
    val allTickets: List<SupportTicket>
        get() {
            val remoteIds = form.remoteTickets.map { it.id }.toSet()
            return form.remoteTickets + localTickets.filterNot { it.id in remoteIds }
        }
}

@HiltViewModel
class SupportViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val supportRepository: SupportRepository,
    private val authRepository: AuthRepository,
    orderRepository: OrderRepository,
    storeRepository: StoreRepository,
) : ViewModel() {

    private val initialOrderId: String = savedStateHandle.get<String>("orderId").orEmpty()

    private val formState = MutableStateFlow(
        SupportFormState(
            linkedOrderId = initialOrderId,
            subject = if (initialOrderId.isNotBlank()) localized("استفسار بخصوص طلب #${initialOrderId.take(8)}", "Question about order #${initialOrderId.take(8)}") else "",
        ),
    )

    val uiState: StateFlow<SupportUiState> = combine(
        formState,
        supportRepository.localSubmittedTickets,
        orderRepository.savedLocalOrders,
        storeRepository.storeSettings,
        authRepository.sessionState,
    ) { form, localTickets, orders, settings, session ->
        val owner = (session as? AuthSessionState.SignedIn)?.userId
        SupportUiState(
            form = form.copy(remoteTickets = form.remoteTickets.filter { owner != null && it.customerId == owner }),
            localTickets = localTickets,
            recentOrders = orders,
            storeSettings = settings,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = SupportUiState(
            form = formState.value,
            storeSettings = storeRepository.storeSettings.value,
        ),
    )

    private var ticketRefresh: Job? = null

    init {
        viewModelScope.launch {
            authRepository.sessionState.filter { it !is AuthSessionState.Loading }
                .map { (it as? AuthSessionState.SignedIn)?.userId }.distinctUntilChanged().collect {
                    ticketRefresh?.cancel()
                    formState.update { form -> form.copy(remoteTickets = emptyList()) }
                    refreshTickets()
                }
        }
    }

    fun onSubjectChange(value: String) {
        formState.update {
            it.copy(subject = value, subjectError = null, submitError = null, submitSuccess = false)
        }
    }

    fun onMessageChange(value: String) {
        formState.update {
            it.copy(message = value, messageError = null, submitError = null, submitSuccess = false)
        }
    }

    fun onLinkedOrderIdChange(value: String) {
        formState.update {
            it.copy(linkedOrderId = value, submitError = null, submitSuccess = false)
        }
    }

    fun refreshTickets() {
        if (ticketRefresh?.isActive == true || authRepository.sessionState.value is AuthSessionState.Loading) return
        ticketRefresh = viewModelScope.launch {
            formState.update { it.copy(isLoadingTickets = true, ticketLoadFailed = false) }
            supportRepository.getMyTickets()
                .onSuccess { remote ->
                    formState.update { it.copy(remoteTickets = remote, isLoadingTickets = false) }
                }
                .onFailure {
                    formState.update { it.copy(isLoadingTickets = false, ticketLoadFailed = true) }
                }
        }
    }

    fun submitTicket() {
        val current = formState.value
        if (current.isSubmitting) return

        val cleanSubject = current.subject.trim()
        val cleanMessage = current.message.trim()
        val subjectError = if (cleanSubject.length < 3) localized("يرجى إدخال عنوان واضح للمشكلة", "Enter a subject.") else null
        val messageError = if (cleanMessage.length < 5) localized("يرجى كتابة تفاصيل رسالتك", "Enter your message.") else null

        if (subjectError != null || messageError != null) {
            formState.update { it.copy(subjectError = subjectError, messageError = messageError) }
            return
        }

        viewModelScope.launch {
            formState.update { it.copy(isSubmitting = true, submitError = null, submitSuccess = false) }
            supportRepository.submitTicket(
                subject = cleanSubject,
                message = cleanMessage,
                linkedOrderId = current.linkedOrderId.trim().takeIf { it.isNotEmpty() },
            ).onSuccess {
                formState.update {
                    it.copy(
                        subject = "",
                        message = "",
                        linkedOrderId = "",
                        isSubmitting = false,
                        submitSuccess = true,
                    )
                }
                refreshTickets()
            }.onFailure { error ->
                formState.update {
                    it.copy(
                        isSubmitting = false,
                        submitError = localized("تعذر إرسال التذكرة حالياً.", "Unable to send the ticket."),
                    )
                }
            }
        }
    }
}
