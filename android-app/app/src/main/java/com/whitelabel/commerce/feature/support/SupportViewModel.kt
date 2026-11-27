package com.whitelabel.commerce.feature.support

import com.whitelabel.commerce.core.domain.model.formatOrderNumber
import com.whitelabel.commerce.core.designsystem.localized

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.whitelabel.commerce.core.domain.model.SavedOrderReceipt
import com.whitelabel.commerce.core.domain.model.StoreSettings
import com.whitelabel.commerce.core.domain.model.SupportTicket
import com.whitelabel.commerce.core.domain.model.SupportTicketMessage
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

data class TicketThreadState(
    val ticketId: String? = null,
    val messages: List<SupportTicketMessage> = emptyList(),
    val loading: Boolean = false,
    val loadFailed: Boolean = false,
    val draft: String = "",
    val sending: Boolean = false,
    val replyError: String? = null,
)

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
    val thread: TicketThreadState = TicketThreadState(),
)

data class SupportUiState(
    val form: SupportFormState = SupportFormState(),
    val localTickets: List<SupportTicket> = emptyList(),
    val recentOrders: List<SavedOrderReceipt> = emptyList(),
    val storeSettings: StoreSettings = StoreSettings(),
    val currentUserId: String? = null,
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
            subject = if (initialOrderId.isNotBlank()) localized("استفسار بخصوص طلب ${formatOrderNumber(initialOrderId)}", "Question about order ${formatOrderNumber(initialOrderId)}") else "",
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
        val ownedTickets = form.remoteTickets.filter { owner != null && it.customerId == owner }
        SupportUiState(
            form = form.copy(
                remoteTickets = ownedTickets,
                thread = form.thread.takeIf { thread -> ownedTickets.any { it.id == thread.ticketId } } ?: TicketThreadState(),
            ),
            currentUserId = owner,
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
    private var threadLoad: Job? = null
    private var replySend: Job? = null

    init {
        viewModelScope.launch {
            authRepository.sessionState.filter { it !is AuthSessionState.Loading }
                .map { (it as? AuthSessionState.SignedIn)?.userId }.distinctUntilChanged().collect {
                    ticketRefresh?.cancel()
                    threadLoad?.cancel()
                    replySend?.cancel()
                    formState.update { form -> form.copy(remoteTickets = emptyList(), thread = TicketThreadState()) }
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

    fun loadTicketThread(ticketId: String) {
        val owner = (authRepository.sessionState.value as? AuthSessionState.SignedIn)?.userId
        val current = formState.value.thread
        threadLoad?.cancel()
        if (current.ticketId != ticketId) replySend?.cancel()
        if (owner == null || formState.value.remoteTickets.none { it.id == ticketId && it.customerId == owner }) {
            formState.update { it.copy(thread = TicketThreadState()) }
            return
        }
        val thread = current.takeIf { it.ticketId == ticketId } ?: TicketThreadState(ticketId)
        formState.update { it.copy(thread = thread.copy(loading = true, loadFailed = false)) }
        threadLoad = viewModelScope.launch {
            supportRepository.getTicketMessages(ticketId)
                .onSuccess { messages -> formState.update { it.copy(thread = it.thread.copy(messages = messages, loading = false)) } }
                .onFailure { formState.update { it.copy(thread = it.thread.copy(loading = false, loadFailed = true)) } }
        }
    }

    fun onReplyChange(value: String) {
        formState.update { it.copy(thread = it.thread.copy(draft = value, replyError = null)) }
    }

    fun sendTicketReply(ticketId: String) {
        val form = formState.value
        val owner = (authRepository.sessionState.value as? AuthSessionState.SignedIn)?.userId
        val ticket = form.remoteTickets.firstOrNull { it.id == ticketId } ?: return
        if (!ticket.canReply(owner) || form.thread.ticketId != ticketId || form.thread.sending || form.thread.draft.isBlank()) return

        formState.update { it.copy(thread = it.thread.copy(sending = true, replyError = null)) }
        replySend = viewModelScope.launch {
            supportRepository.sendTicketReply(ticketId, form.thread.draft)
                .onSuccess { message ->
                    formState.update {
                        val messages = (it.thread.messages + message).distinctBy(SupportTicketMessage::id)
                        it.copy(thread = it.thread.copy(messages = messages, draft = "", sending = false))
                    }
                    loadTicketThread(ticketId)
                }
                .onFailure { error ->
                    val feedback = mapSupportError(error.message.orEmpty())
                    formState.update { it.copy(thread = it.thread.copy(sending = false, replyError = localized(feedback.arabic, feedback.english))) }
                }
            refreshTickets()
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
                val feedback = mapSupportError(error.message.orEmpty())
                formState.update {
                    it.copy(
                        isSubmitting = false,
                        submitError = localized(feedback.arabic, feedback.english),
                    )
                }
            }
        }
    }
}
