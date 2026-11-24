package com.whitelabel.commerce.feature.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.whitelabel.commerce.core.notifications.AppNotification
import com.whitelabel.commerce.core.notifications.NotificationRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class NotificationsUiState(
    val items: List<AppNotification> = emptyList(),
    val isRefreshing: Boolean = false,
)

@HiltViewModel
class NotificationsViewModel @Inject constructor(
    private val notificationRepository: NotificationRepository,
) : ViewModel() {

    private val isRefreshing = MutableStateFlow(false)

    val uiState: StateFlow<NotificationsUiState> = combine(
        notificationRepository.notifications,
        isRefreshing,
    ) { items, refreshing ->
        NotificationsUiState(items = items, isRefreshing = refreshing)
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = NotificationsUiState(items = notificationRepository.notifications.value),
    )

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            isRefreshing.value = true
            notificationRepository.refresh()
            isRefreshing.value = false
        }
    }

    fun markAsRead(id: String) {
        viewModelScope.launch {
            notificationRepository.markAsRead(id)
        }
    }

    fun markAllAsRead() {
        viewModelScope.launch {
            notificationRepository.markAllAsRead()
        }
    }

    fun deleteNotification(id: String) {
        viewModelScope.launch {
            notificationRepository.deleteNotification(id)
        }
    }

    fun clearAll() {
        viewModelScope.launch {
            notificationRepository.clearAllNotifications()
        }
    }
}
