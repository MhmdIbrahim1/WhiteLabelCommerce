package com.whitelabel.commerce.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.whitelabel.commerce.core.domain.model.AuthSessionState
import com.whitelabel.commerce.core.domain.model.StoreSettings
import com.whitelabel.commerce.core.domain.repository.AuthRepository
import com.whitelabel.commerce.core.domain.repository.CartRepository
import com.whitelabel.commerce.core.domain.repository.StoreRepository
import com.whitelabel.commerce.core.domain.repository.WishlistRepository
import com.whitelabel.commerce.core.notifications.FcmTokenManager
import com.whitelabel.commerce.core.notifications.NotificationRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import javax.inject.Inject

data class MainUiState(
    val storeSettings: StoreSettings = StoreSettings(),
    val darkThemeOverride: Boolean? = null,
    val cartItemCount: Int = 0,
    val unreadNotificationCount: Int = 0,
    val wishlistCount: Int = 0,
    val isSyncingBrand: Boolean = false,
    val isSignedIn: Boolean = false,
)

@HiltViewModel
class MainViewModel @Inject constructor(
    private val storeRepository: StoreRepository,
    cartRepository: CartRepository,
    authRepository: AuthRepository,
    private val notificationRepository: NotificationRepository,
    private val wishlistRepository: WishlistRepository,
    private val fcmTokenManager: FcmTokenManager,
) : ViewModel() {

    private val isSyncingBrand = MutableStateFlow(false)

    val uiState: StateFlow<MainUiState> = combine(
        combine(
            storeRepository.storeSettings,
            storeRepository.darkThemePreference,
            cartRepository.totalItemCount,
            notificationRepository.unreadCount,
        ) { settings, darkPref, cartCount, unread ->
            Quad(settings, darkPref, cartCount, unread)
        },
        isSyncingBrand,
        authRepository.sessionState,
        wishlistRepository.wishlistCount,
    ) { quad, syncing, authSession, wishCount ->
        MainUiState(
            storeSettings = quad.first,
            darkThemeOverride = quad.second,
            cartItemCount = quad.third,
            unreadNotificationCount = quad.fourth,
            wishlistCount = wishCount,
            isSyncingBrand = syncing,
            isSignedIn = authSession is AuthSessionState.SignedIn,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = MainUiState(
            storeSettings = storeRepository.storeSettings.value,
            unreadNotificationCount = notificationRepository.unreadCount.value,
            wishlistCount = wishlistRepository.wishlistCount.value,
            isSignedIn = authRepository.sessionState.value is AuthSessionState.SignedIn,
        ),
    )

    private var brandRefresh: Job? = null

    init {
        viewModelScope.launch(Dispatchers.IO) {
            authRepository.sessionState.collect { session ->
                if (session is AuthSessionState.Loading) return@collect
                syncPushToken()
                notificationRepository.refresh()
                wishlistRepository.refreshWishlistIds()
            }
        }
    }

    fun refreshStoreSettings() {
        if (brandRefresh?.isActive == true) return
        val refreshAccount = brandRefresh != null
        brandRefresh = viewModelScope.launch(Dispatchers.IO) {
            isSyncingBrand.value = true
            try {
                storeRepository.refreshStoreSettings()
                if (refreshAccount) {
                    notificationRepository.refresh()
                    wishlistRepository.refreshWishlistIds()
                }
            } finally {
                isSyncingBrand.value = false
            }
        }
    }

    fun setLanguage(locale: String) {
        storeRepository.setLanguage(locale)
        syncPushToken()
    }

    fun syncPushToken() {
        viewModelScope.launch {
            fcmTokenManager.syncCurrentToken()
        }
    }

    fun markNotificationRead(notificationId: String) {
        if (notificationId.isBlank()) return
        viewModelScope.launch {
            notificationRepository.markAsRead(notificationId)
        }
    }

    fun toggleDarkTheme(currentlyDark: Boolean) {
        viewModelScope.launch {
            storeRepository.setDarkThemePreference(isDark = !currentlyDark)
        }
    }

    fun setDarkThemePreference(isDark: Boolean?) {
        viewModelScope.launch {
            storeRepository.setDarkThemePreference(isDark = isDark)
        }
    }

    private data class Quad<A, B, C, D>(
        val first: A,
        val second: B,
        val third: C,
        val fourth: D,
    )
}
