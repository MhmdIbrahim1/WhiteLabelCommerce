package com.whitelabel.commerce.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.whitelabel.commerce.core.domain.model.AuthSessionState
import com.whitelabel.commerce.core.domain.model.StoreSettings
import com.whitelabel.commerce.core.domain.repository.AuthRepository
import com.whitelabel.commerce.core.domain.repository.CartRepository
import com.whitelabel.commerce.core.domain.repository.StoreRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class MainUiState(
    val storeSettings: StoreSettings = StoreSettings(),
    val darkThemeOverride: Boolean? = null,
    val cartItemCount: Int = 0,
    val isSyncingBrand: Boolean = false,
    val isSignedIn: Boolean = false,
)

@HiltViewModel
class MainViewModel @Inject constructor(
    private val storeRepository: StoreRepository,
    cartRepository: CartRepository,
    authRepository: AuthRepository,
) : ViewModel() {

    private val isSyncingBrand = MutableStateFlow(false)

    val uiState: StateFlow<MainUiState> = combine(
        storeRepository.storeSettings,
        storeRepository.darkThemePreference,
        cartRepository.totalItemCount,
        isSyncingBrand,
        authRepository.sessionState,
    ) { settings, darkPref, cartCount, syncing, authSession ->
        MainUiState(
            storeSettings = settings,
            darkThemeOverride = darkPref,
            cartItemCount = cartCount,
            isSyncingBrand = syncing,
            isSignedIn = authSession is AuthSessionState.SignedIn,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = MainUiState(
            storeSettings = storeRepository.storeSettings.value,
            isSignedIn = authRepository.sessionState.value is AuthSessionState.SignedIn,
        ),
    )

    init {
        refreshStoreSettings()
    }

    fun refreshStoreSettings() {
        viewModelScope.launch {
            isSyncingBrand.value = true
            storeRepository.refreshStoreSettings()
            isSyncingBrand.value = false
        }
    }

    fun toggleDarkTheme(currentlyDark: Boolean) {
        viewModelScope.launch {
            storeRepository.setDarkThemePreference(isDark = !currentlyDark)
        }
    }
}
