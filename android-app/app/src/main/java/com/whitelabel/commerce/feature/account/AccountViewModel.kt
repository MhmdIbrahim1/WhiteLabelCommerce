package com.whitelabel.commerce.feature.account

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.data.remote.runSuspendCatching
import com.whitelabel.commerce.core.domain.model.OAuthCallback
import com.whitelabel.commerce.core.data.remote.PhoneNormalizer
import com.whitelabel.commerce.core.domain.model.AccountCounts
import com.whitelabel.commerce.core.domain.model.AuthSessionState
import com.whitelabel.commerce.core.domain.model.CustomerProfile
import com.whitelabel.commerce.core.domain.model.StoreSettings
import com.whitelabel.commerce.core.domain.model.StorefrontAuthInput
import com.whitelabel.commerce.core.domain.model.WalletSummary
import com.whitelabel.commerce.core.domain.repository.AuthRepository
import com.whitelabel.commerce.core.domain.repository.OrderRepository
import com.whitelabel.commerce.core.domain.repository.StoreRepository
import com.whitelabel.commerce.core.domain.repository.WalletRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

private val EMAIL_REGEX = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

enum class AuthAction { Send, Verify, Google, GoogleBrowser, GoogleCallback }

data class AuthFormState(
    val otpEmail: String = "",
    val otpSent: Boolean = false,
    val otpCode: String = "",
    val resendCooldownSeconds: Int = 0,
    val action: AuthAction? = null,
    val emailError: String? = null,
    val googleError: String? = null,
)

data class OnboardingFormState(
    val fullName: String = "",
    val phone: String = "",
    val attempted: Boolean = false,
    val saving: Boolean = false,
    val serverError: String? = null,
)

internal fun AuthFormState.onBrowserResume(): AuthFormState =
    if (action == AuthAction.GoogleBrowser) copy(action = null) else this

data class ProfileFormState(
    val fullName: String = "",
    val phone: String = "",
    val governorate: String = "",
    val city: String = "",
    val address: String = "",
    val phoneError: String? = null,
    val isSaving: Boolean = false,
    val saveError: String? = null,
    val saveSuccess: Boolean = false,
)

data class AccountUiState(
    val session: AuthSessionState = AuthSessionState.Loading,
    val authForm: AuthFormState = AuthFormState(),
    val onboarding: OnboardingFormState = OnboardingFormState(),
    val profileForm: ProfileFormState = ProfileFormState(),
    val counts: AccountCounts = AccountCounts(),
    val walletSummary: WalletSummary = WalletSummary(),
    val isLoadingWallet: Boolean = false,
    val isRetryingMembership: Boolean = false,
    val storeSettings: StoreSettings = StoreSettings(),
    val accountError: String? = null,
)

// Replace signed-in data atomically when identity or enrollment changes, before any screen can render it.
internal fun AccountUiState.withSession(next: AuthSessionState): AccountUiState {
    if (session == next) return this
    val previous = session as? AuthSessionState.SignedIn
    val member = next as? AuthSessionState.SignedIn
    val sameGate = previous != null && member != null && previous.userId == member.userId &&
        previous.enrolled == member.enrolled && previous.membershipResolved == member.membershipResolved
    val base = if (sameGate || (session == AuthSessionState.Loading && next == AuthSessionState.SignedOut))
        copy(session = next)
    else AccountUiState(session = next, storeSettings = storeSettings)
    if (member == null || !member.membershipResolved || !member.enrolled) return base
    if (sameGate && previous?.profile == member.profile) return base
    val profile = member.profile
    return base.copy(profileForm = ProfileFormState(
        fullName = profile.fullName,
        phone = PhoneNormalizer.normalizeForEgyptCheckout(profile.phone),
        governorate = profile.governorate,
        city = profile.city,
        address = profile.address,
    ))
}

@HiltViewModel
class AccountViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val orderRepository: OrderRepository,
    private val walletRepository: WalletRepository,
    storeRepository: StoreRepository,
) : ViewModel() {
    private val state = MutableStateFlow(AccountUiState(storeSettings = storeRepository.storeSettings.value)
        .withSession(authRepository.sessionState.value))
    val uiState = state.asStateFlow()
    private var cooldownJob: Job? = null

    init {
        viewModelScope.launch {
            authRepository.sessionState.collect { session ->
                if (session != AuthSessionState.SignedOut) cooldownJob?.cancel()
                state.update { it.withSession(session) }
            }
        }
        viewModelScope.launch {
            storeRepository.storeSettings.collect { settings -> state.update { it.copy(storeSettings = settings) } }
        }
    }

    private fun updateAuth(edit: (AuthFormState) -> AuthFormState) {
        state.update { if (it.session == AuthSessionState.SignedOut) it.copy(authForm = edit(it.authForm)) else it }
    }

    fun onOtpEmailChange(value: String) = updateAuth { it.copy(otpEmail = value, emailError = null) }
    fun onOtpCodeChange(value: String) = updateAuth {
        it.copy(otpCode = StorefrontAuthInput.normalizeOtp(value), emailError = null)
    }
    fun resetOtpEmailStep() = updateAuth { it.copy(otpSent = false, otpCode = "", emailError = null) }

    fun sendEmailOtp() {
        val form = state.value.authForm
        if (form.action != null || form.resendCooldownSeconds > 0) return
        val email = form.otpEmail.trim().lowercase()
        if (!EMAIL_REGEX.matches(email)) {
            updateAuth { it.copy(emailError = "email_address_invalid") }
            return
        }

        updateAuth { it.copy(action = AuthAction.Send, emailError = null, googleError = null) }
        viewModelScope.launch {
            authRepository.sendEmailOtp(email).onSuccess {
                updateAuth { it.copy(action = null, otpEmail = email, otpSent = true, otpCode = "") }
                startCooldown()
            }.onFailure { error ->
                val code = authErrorDetail(error)
                updateAuth { it.copy(action = null, emailError = code) }
                if ("rate_limit" in code || "rate limit" in code || "security purposes" in code || "429" in code) {
                    startCooldown()
                }
            }
        }
    }

    private fun startCooldown() {
        cooldownJob?.cancel()
        cooldownJob = viewModelScope.launch {
            for (remaining in 60 downTo 0) {
                updateAuth { it.copy(resendCooldownSeconds = remaining) }
                if (remaining > 0) delay(1_000)
            }
        }
    }

    fun verifyEmailOtp() {
        val form = state.value.authForm
        if (form.action != null || !form.otpSent || !StorefrontAuthInput.isOtpReady(form.otpCode)) return
        updateAuth { it.copy(action = AuthAction.Verify, emailError = null, googleError = null) }
        viewModelScope.launch {
            val failure = authRepository.verifyEmailOtp(form.otpEmail, form.otpCode).exceptionOrNull()
            updateAuth { it.copy(action = null, emailError = failure?.let(::authErrorDetail)) }
        }
    }

    suspend fun signInWithGoogle(native: suspend () -> GoogleIdTokenResult, openBrowser: (String) -> Unit) {
        if (state.value.authForm.action != null) return
        updateAuth { it.copy(action = AuthAction.Google, emailError = null, googleError = null) }
        try {
            val result = runSuspendCatching {
                startHybridGoogleSignIn(BuildConfig.IS_WHITE_LABEL_TENANT, BuildConfig.GOOGLE_WEB_CLIENT_ID,
                    native, authRepository::signInWithGoogleIdToken) {
                    openBrowser(authRepository.prepareGoogleOAuthUrl().getOrThrow())
                }
            }
            updateAuth { form ->
                if (form.action != AuthAction.Google) form else form.copy(
                    action = if (result.getOrNull() == true) AuthAction.GoogleBrowser else null,
                    googleError = result.exceptionOrNull()?.let(::authErrorDetail),
                )
            }
        } finally {
            updateAuth { if (it.action == AuthAction.Google) it.copy(action = null) else it }
        }
    }

    fun onBrowserResume() = updateAuth { it.onBrowserResume() }

    internal fun onOAuthCallback(callback: OAuthCallback) {
        if (state.value.authForm.action == AuthAction.GoogleCallback) return
        val action = if (callback is OAuthCallback.Code) AuthAction.GoogleCallback else null
        val error = (callback as? OAuthCallback.Failure)?.let { googleCallbackError(it.error) }
        // A new process can receive the callback before the stored session finishes loading.
        state.update { it.copy(authForm = it.authForm.copy(action = action, googleError = error, emailError = null)) }
        if (callback is OAuthCallback.Code) viewModelScope.launch {
            val failure = authRepository.exchangeGoogleOAuthCode(callback.value).exceptionOrNull()
            state.update { it.copy(authForm = it.authForm.copy(action = null, googleError = failure?.let(::authErrorDetail))) }
        }
    }

    fun retryMembership() {
        val member = state.value.session as? AuthSessionState.SignedIn ?: return
        if (member.membershipResolved || state.value.isRetryingMembership) return
        state.update { it.copy(isRetryingMembership = true, accountError = null) }
        viewModelScope.launch {
            val failure = authRepository.refreshProfile().exceptionOrNull()
            state.update {
                val current = it.session as? AuthSessionState.SignedIn
                if (current?.userId == member.userId && !current.membershipResolved)
                    it.copy(isRetryingMembership = false, accountError = failure?.let(::authErrorDetail))
                else it
            }
        }
    }

    fun onOnboardingNameChange(value: String) = state.update {
        it.copy(onboarding = it.onboarding.copy(fullName = value, serverError = null))
    }

    fun onOnboardingPhoneChange(value: String) = state.update {
        it.copy(onboarding = it.onboarding.copy(phone = value, serverError = null))
    }

    fun completeOnboarding() {
        val session = authRepository.sessionState.value as? AuthSessionState.SignedIn ?: return
        val form = state.value.onboarding
        if (session.enrolled || !session.membershipResolved || form.saving) return
        val valid = StorefrontAuthInput.validName(form.fullName) && StorefrontAuthInput.validPhone(form.phone)
        state.update { it.copy(onboarding = form.copy(attempted = true, saving = valid, serverError = null)) }
        if (!valid) return
        viewModelScope.launch {
            val failure = authRepository.completeStoreCustomerOnboarding(form.fullName.trim(), form.phone.trim()).exceptionOrNull()
            if (authRepository.sessionState.value == session) {
                state.update { it.copy(onboarding = it.onboarding.copy(saving = false, serverError = failure?.let(::authErrorDetail))) }
            }
        }
    }

    private fun activeMember() = (authRepository.sessionState.value as? AuthSessionState.SignedIn)
        ?.takeIf { it.membershipResolved && it.enrolled }

    private fun updateProfile(edit: (ProfileFormState) -> ProfileFormState) {
        state.update { it.copy(profileForm = edit(it.profileForm)) }
    }

    fun onProfileNameChange(value: String) = updateProfile { it.copy(fullName = value, saveSuccess = false, saveError = null) }
    fun onProfilePhoneChange(value: String) = updateProfile {
        it.copy(phone = PhoneNormalizer.normalizeForEgyptCheckout(value), phoneError = null, saveSuccess = false, saveError = null)
    }
    fun onProfileGovernorateChange(value: String) = updateProfile { it.copy(governorate = value, saveSuccess = false, saveError = null) }
    fun onProfileCityChange(value: String) = updateProfile { it.copy(city = value, saveSuccess = false, saveError = null) }
    fun onProfileAddressChange(value: String) = updateProfile { it.copy(address = value, saveSuccess = false, saveError = null) }

    fun saveProfile() {
        val member = activeMember() ?: return
        val form = state.value.profileForm
        if (form.isSaving) return
        if (!StorefrontAuthInput.validPhone(form.phone)) {
            updateProfile { it.copy(phoneError = mapAuthError("invalid_phone")) }
            return
        }
        updateProfile { it.copy(isSaving = true, saveError = null, saveSuccess = false) }
        viewModelScope.launch {
            val result = authRepository.saveProfile(CustomerProfile(
                fullName = form.fullName.trim(), phone = PhoneNormalizer.normalizeForEgyptCheckout(form.phone),
                email = member.email, governorate = form.governorate.trim(),
                city = form.city.trim(), address = form.address.trim(),
            ))
            if (activeMember()?.userId != member.userId) return@launch
            result.onSuccess {
                updateProfile { it.copy(isSaving = false, saveSuccess = true) }
                loadCounts()
            }.onFailure { error ->
                updateProfile { it.copy(isSaving = false, saveError = mapAuthError(authErrorDetail(error))) }
            }
        }
    }

    fun loadCounts() {
        val member = activeMember() ?: return
        viewModelScope.launch {
            val result = orderRepository.getAccountCounts()
            if (activeMember()?.userId != member.userId) return@launch
            result.onSuccess { counts -> state.update { it.copy(counts = counts) } }
        }
    }

    fun loadWallet() {
        val member = activeMember() ?: return
        if (state.value.isLoadingWallet) return
        state.update { it.copy(isLoadingWallet = true) }
        viewModelScope.launch {
            val result = walletRepository.getMyWalletSummary()
            if (activeMember()?.userId != member.userId) return@launch
            state.update { it.copy(isLoadingWallet = false, walletSummary = result.getOrNull() ?: it.walletSummary) }
        }
    }

    fun signOut(onSignedOut: () -> Unit = {}) {
        viewModelScope.launch {
            authRepository.signOut().onSuccess { onSignedOut() }.onFailure { error ->
                state.update { it.copy(accountError = authErrorDetail(error)) }
            }
        }
    }
}
