package com.whitelabel.commerce.feature.account

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.whitelabel.commerce.core.data.remote.PhoneNormalizer
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.AuthSessionState
import com.whitelabel.commerce.core.domain.model.CustomerProfile
import com.whitelabel.commerce.core.domain.model.AccountCounts
import com.whitelabel.commerce.core.domain.model.SignUpOutcome
import com.whitelabel.commerce.core.domain.model.StoreSettings
import com.whitelabel.commerce.core.domain.model.WalletSummary
import com.whitelabel.commerce.core.domain.repository.AuthRepository
import com.whitelabel.commerce.core.domain.repository.OrderRepository
import com.whitelabel.commerce.core.domain.repository.StoreRepository
import com.whitelabel.commerce.core.domain.repository.WalletRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

private val EMAIL_REGEX = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
private val EGYPT_MOBILE_REGEX = Regex("^01[0125][0-9]{8}$")
private val OTP_REGEX = Regex("^[0-9]{6,10}$")

enum class AuthTab {
    EMAIL_OTP,
    PASSWORD,
}

enum class PasswordAuthMode {
    SIGN_IN,
    REGISTER,
}

data class AuthFormState(
    val activeTab: AuthTab = AuthTab.PASSWORD,
    val passwordMode: PasswordAuthMode = PasswordAuthMode.SIGN_IN,
    // OTP flow
    val otpEmail: String = "",
    val otpSent: Boolean = false,
    val otpCode: String = "",
    val resendCooldownSeconds: Int = 0,
    // Password flow
    val fullName: String = "",
    val phone: String = "",
    val passwordEmail: String = "",
    val password: String = "",
    // Shared status
    val isSubmitting: Boolean = false,
    val errorMessage: String? = null,
    val infoMessage: String? = null,
)

data class ProfileFormState(
    val initializedForUserId: String? = null,
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
    val errorMessage: String? = null,
    val session: AuthSessionState = AuthSessionState.Loading,
    val authForm: AuthFormState = AuthFormState(),
    val profileForm: ProfileFormState = ProfileFormState(),
    val counts: AccountCounts = AccountCounts(),
    val isLoadingOrders: Boolean = false,
    val walletSummary: WalletSummary = WalletSummary(),
    val isLoadingWallet: Boolean = false,
    val storeSettings: StoreSettings = StoreSettings(),
)

@HiltViewModel
class AccountViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val orderRepository: OrderRepository,
    private val walletRepository: WalletRepository,
    storeRepository: StoreRepository,
) : ViewModel() {

    private val authFormState = MutableStateFlow(AuthFormState())
    private val profileFormState = MutableStateFlow(ProfileFormState())
    private val accountError = MutableStateFlow<String?>(null)
    private val countsState = MutableStateFlow(AccountCounts())
    private val loadingOrdersState = MutableStateFlow(false)
    private val walletSummaryState = MutableStateFlow(WalletSummary())
    private val loadingWalletState = MutableStateFlow(false)

    private var cooldownJob: Job? = null

    val uiState: StateFlow<AccountUiState> = combine(
        authRepository.sessionState,
        authFormState,
        profileFormState,
        combine(countsState, loadingOrdersState, storeRepository.storeSettings) { o, l, s -> Triple(o, l, s) },
        combine(walletSummaryState, loadingWalletState) { w, lw -> w to lw },
    ) { session, authForm, profileForm, (orders, loadingOrders, settings), (wallet, loadingWallet) ->
        AccountUiState(
            session = session,
            authForm = authForm,
            profileForm = profileForm,
            counts = orders,
            isLoadingOrders = loadingOrders,
            walletSummary = wallet,
            isLoadingWallet = loadingWallet,
            storeSettings = settings,
        )
    }.combine(accountError) { state, error -> state.copy(errorMessage = error) }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = AccountUiState(
            session = authRepository.sessionState.value,
            storeSettings = storeRepository.storeSettings.value,
        ),
    )

    init {
        viewModelScope.launch {
            authRepository.sessionState.collect { session ->
                when (session) {
                    is AuthSessionState.SignedIn -> {
                        val currentForm = profileFormState.value
                        val profile = session.profile
                        if (currentForm.initializedForUserId != session.userId ||
                            (currentForm.fullName.isBlank() && profile.fullName.isNotBlank()) ||
                            (currentForm.phone.isBlank() && profile.phone.isNotBlank()) ||
                            (currentForm.governorate.isBlank() && profile.governorate.isNotBlank()) ||
                            (currentForm.city.isBlank() && profile.city.isNotBlank()) ||
                            (currentForm.address.isBlank() && profile.address.isNotBlank())
                        ) {
                            profileFormState.value = ProfileFormState(
                                initializedForUserId = session.userId,
                                fullName = profile.fullName,
                                phone = PhoneNormalizer.normalizeForEgyptCheckout(profile.phone),
                                governorate = profile.governorate,
                                city = profile.city,
                                address = profile.address,
                            )
                        }
                        loadCounts()
                        loadWallet()
                    }

                    AuthSessionState.SignedOut -> {
                        profileFormState.value = ProfileFormState()
                        countsState.value = AccountCounts()
                        walletSummaryState.value = WalletSummary()
                    }

                    AuthSessionState.Loading -> Unit
                }
            }
        }
    }

    fun loadWallet() {
        viewModelScope.launch {
            loadingWalletState.value = true
            walletRepository.getMyWalletSummary()
                .onSuccess { summary -> walletSummaryState.value = summary }
            loadingWalletState.value = false
        }
    }

    // ---- Auth Form Mutations ----

    fun selectAuthTab(tab: AuthTab) {
        authFormState.update { it.copy(activeTab = tab, errorMessage = null) }
    }

    fun selectPasswordMode(mode: PasswordAuthMode) {
        authFormState.update { it.copy(passwordMode = mode, errorMessage = null) }
    }

    fun onOtpEmailChange(value: String) {
        authFormState.update { it.copy(otpEmail = value, errorMessage = null) }
    }

    fun onOtpCodeChange(value: String) {
        val digits = value.mapNotNull { it.digitToIntOrNull() }.take(10).joinToString("")
        authFormState.update { it.copy(otpCode = digits, errorMessage = null) }
    }

    fun resetOtpEmailStep() {
        authFormState.update {
            it.copy(
                otpSent = false,
                otpCode = "",
                errorMessage = null,
                infoMessage = null,
            )
        }
    }

    fun onAuthFullNameChange(value: String) {
        authFormState.update { it.copy(fullName = value, errorMessage = null) }
    }

    fun onAuthPhoneChange(value: String) {
        authFormState.update { it.copy(phone = value, errorMessage = null) }
    }

    fun onPasswordEmailChange(value: String) {
        authFormState.update { it.copy(passwordEmail = value, errorMessage = null) }
    }

    fun onPasswordChange(value: String) {
        authFormState.update { it.copy(password = value, errorMessage = null) }
    }

    fun sendEmailOtp() {
        val form = authFormState.value
        if (form.isSubmitting || form.resendCooldownSeconds > 0) return

        val email = form.otpEmail.trim().lowercase()
        if (!EMAIL_REGEX.matches(email)) {
            authFormState.update {
                it.copy(errorMessage = localized("يرجى إدخال بريد إلكتروني صحيح.", "Please enter a valid email address."))
            }
            return
        }

        authFormState.update { it.copy(isSubmitting = true, errorMessage = null, infoMessage = null) }
        viewModelScope.launch {
            authRepository.sendEmailOtp(email)
                .onSuccess {
                    authFormState.update {
                        it.copy(
                            isSubmitting = false,
                            otpSent = true,
                            infoMessage = localized(
                                "تم إرسال رمز تحقق إلى $email",
                                "A verification code was sent to $email",
                            ),
                        )
                    }
                    startResendCooldown(60)
                }
                .onFailure { err ->
                    val raw = authErrorDetail(err)
                    if ("rate_limit" in raw || "rate limit" in raw || "security purposes" in raw || "429" in raw) {
                        startResendCooldown(60)
                    }
                    authFormState.update {
                        it.copy(
                            isSubmitting = false,
                            errorMessage = mapAuthError(raw),
                        )
                    }
                }
        }
    }

    fun verifyEmailOtp(onSignedIn: () -> Unit = {}) {
        val form = authFormState.value
        if (form.isSubmitting) return

        val email = form.otpEmail.trim().lowercase()
        val code = form.otpCode.filter { it.isDigit() }
        if (!OTP_REGEX.matches(code)) {
            authFormState.update {
                it.copy(
                    errorMessage = localized(
                        "يرجى إدخال رمز التحقق.",
                        "Please enter the verification code.",
                    ),
                )
            }
            return
        }

        authFormState.update { it.copy(isSubmitting = true, errorMessage = null) }
        viewModelScope.launch {
            authRepository.verifyEmailOtp(email, code)
                .onSuccess {
                    cooldownJob?.cancel()
                    authFormState.value = AuthFormState()
                    onSignedIn()
                }
                .onFailure(::showAuthFailure)
        }
    }

    fun submitPasswordAuth(onSignedIn: () -> Unit = {}) {
        val form = authFormState.value
        if (form.isSubmitting) return

        val email = form.passwordEmail.trim().lowercase()
        val password = form.password

        if (!EMAIL_REGEX.matches(email)) {
            authFormState.update {
                it.copy(errorMessage = localized("يرجى إدخال بريد إلكتروني صحيح.", "Please enter a valid email address."))
            }
            return
        }
        if (form.passwordMode == PasswordAuthMode.REGISTER && password.length < 6) {
            authFormState.update {
                it.copy(
                    errorMessage = localized(
                        "كلمة المرور يجب أن تكون 6 أحرف على الأقل.",
                        "Password must be at least 6 characters.",
                    ),
                )
            }
            return
        }

        if (form.passwordMode == PasswordAuthMode.REGISTER) {
            val cleanName = form.fullName.trim()
            val cleanPhone = PhoneNormalizer.normalizeForEgyptCheckout(form.phone)
            if (cleanName.length !in 2..100) {
                authFormState.update {
                    it.copy(errorMessage = localized("يرجى إدخال الاسم بالكامل.", "Please enter your full name."))
                }
                return
            }
            if (!form.phone.trim().matches(Regex("""\+?[0-9٠-٩۰-۹\s()-]+""")) || !EGYPT_MOBILE_REGEX.matches(cleanPhone)) {
                authFormState.update {
                    it.copy(
                        errorMessage = localized(
                            "يرجى إدخال رقم موبايل مصري صحيح (010 / 011 / 012 / 015).",
                            "Enter a valid 11-digit Egyptian mobile number (010 / 011 / 012 / 015).",
                        ),
                    )
                }
                return
            }

            authFormState.update { it.copy(isSubmitting = true, errorMessage = null, infoMessage = null) }
            viewModelScope.launch {
                authRepository.signUpWithPassword(cleanName, cleanPhone, email, password)
                    .onSuccess { outcome ->
                        if (outcome == SignUpOutcome.SIGNED_IN) {
                            authFormState.value = AuthFormState()
                            onSignedIn()
                        } else {
                            authFormState.update {
                                it.copy(
                                    isSubmitting = false,
                                    passwordMode = PasswordAuthMode.SIGN_IN,
                                    activeTab = AuthTab.EMAIL_OTP,
                                    otpSent = true,
                                    otpEmail = email,
                                    infoMessage = localized(
                                        "تحقق من بريدك الإلكتروني وأدخل رمز التأكيد.",
                                        "Check your inbox and enter the confirmation code.",
                                    ),
                                )
                            }
                        }
                    }
                    .onFailure(::showAuthFailure)
            }
            return
        }

        authFormState.update { it.copy(isSubmitting = true, errorMessage = null, infoMessage = null) }
        viewModelScope.launch {
            authRepository.signInWithPassword(email, password)
                .onSuccess {
                    authFormState.value = AuthFormState()
                    onSignedIn()
                }
                .onFailure(::showAuthFailure)
        }
    }

    private fun showAuthFailure(error: Throwable) {
        val detail = authErrorDetail(error)
        val message = mapAuthError(detail)
        authFormState.update {
            if (detail == "phone_unavailable" || detail == "profile_setup") AuthFormState(errorMessage = message)
            else it.copy(isSubmitting = false, errorMessage = message)
        }
    }

    // ---- Signed-In Profile Mutations ----

    fun onProfileNameChange(value: String) {
        profileFormState.update { it.copy(fullName = value, saveSuccess = false, saveError = null) }
    }

    fun onProfilePhoneChange(value: String) {
        val normalized = PhoneNormalizer.normalizeForEgyptCheckout(value)
        profileFormState.update {
            it.copy(phone = normalized, phoneError = null, saveSuccess = false, saveError = null)
        }
    }

    fun onProfileGovernorateChange(value: String) {
        profileFormState.update { it.copy(governorate = value, saveSuccess = false, saveError = null) }
    }

    fun onProfileCityChange(value: String) {
        profileFormState.update { it.copy(city = value, saveSuccess = false, saveError = null) }
    }

    fun onProfileAddressChange(value: String) {
        profileFormState.update { it.copy(address = value, saveSuccess = false, saveError = null) }
    }

    fun saveProfile() {
        val form = profileFormState.value
        if (form.isSaving) return

        val cleanPhone = PhoneNormalizer.normalizeForEgyptCheckout(form.phone)
        if (cleanPhone.isNotEmpty() && !EGYPT_MOBILE_REGEX.matches(cleanPhone)) {
            profileFormState.update {
                it.copy(
                    phoneError = localized(
                        "أدخل رقم موبايل مصري صحيح من 11 رقماً (010 / 011 / 012 / 015).",
                        "Enter a valid 11-digit Egyptian mobile number (010 / 011 / 012 / 015).",
                    ),
                )
            }
            return
        }

        val currentEmail = (authRepository.sessionState.value as? AuthSessionState.SignedIn)?.email.orEmpty()
        viewModelScope.launch {
            profileFormState.update { it.copy(isSaving = true, saveError = null, saveSuccess = false) }
            authRepository.saveProfile(
                CustomerProfile(
                    fullName = form.fullName.trim(),
                    phone = cleanPhone,
                    email = currentEmail,
                    governorate = form.governorate.trim(),
                    city = form.city.trim(),
                    address = form.address.trim(),
                ),
            ).onSuccess {
                authFormState.value = AuthFormState()
                profileFormState.update { it.copy(isSaving = false, saveSuccess = true) }
                // Reload synced orders immediately so any newly claimed guest orders appear
                loadCounts()
            }.onFailure { err ->
                val raw = err.message.orEmpty().lowercase()
                profileFormState.update {
                    it.copy(
                        isSaving = false,
                        saveError = if ("phone_already_in_use" in raw) {
                            localized(
                                "رقم الموبايل مسجل بالفعل بحساب آخر.",
                                "This mobile number is already linked to another account.",
                            )
                        } else {
                            localized(
                                "تعذر حفظ البيانات حالياً. يرجى المحاولة مجدداً.",
                                "Could not save profile right now. Please try again.",
                            )
                        },
                    )
                }
            }
        }
    }

    fun loadCounts() {
        viewModelScope.launch {
            loadingOrdersState.value = true
            orderRepository.getAccountCounts()
                .onSuccess { list -> countsState.value = list; accountError.value = null }
                .onFailure { accountError.value = localized("تعذر تحميل الطلبات.", "Could not load your orders.") }
            loadingOrdersState.value = false
        }
    }

    suspend fun changePassword(password: String) = authRepository.changePassword(password)
    suspend fun requestRecovery(email: String) = authRepository.requestPasswordRecovery(email)
    suspend fun finishRecovery(token: String, password: String) = authRepository.completePasswordRecovery(token, password)

    fun signOut(onSignedOut: () -> Unit = {}) {
        viewModelScope.launch {
            authRepository.signOut()
            authFormState.value = AuthFormState()
            countsState.value = AccountCounts()
            profileFormState.value = ProfileFormState()
            onSignedOut()
        }
    }

    private fun startResendCooldown(seconds: Int) {
        cooldownJob?.cancel()
        cooldownJob = viewModelScope.launch {
            for (remaining in seconds downTo 0) {
                authFormState.update { it.copy(resendCooldownSeconds = remaining) }
                if (remaining > 0) delay(1_000)
            }
        }
    }

}

private fun authErrorDetail(error: Throwable): String {
    if (error.message in setOf("profile_setup", "phone_unavailable")) return error.message.orEmpty()
    val code = (error as? io.github.jan.supabase.auth.exception.AuthRestException)?.errorCode?.value
    if (code != null) {
        if (code == "unexpected_failure" && error.message.orEmpty().contains("sending", ignoreCase = true)) return "email_delivery"
        return code
    }
    if (generateSequence(error) { it.cause }.any { it is java.io.IOException }) return "network"
    return error.message.orEmpty().lowercase()
}

internal fun mapAuthError(raw: String): String = when {
    raw == "network" -> localized("تحقق من اتصالك بالإنترنت ثم أعد المحاولة.", "Check your connection and try again.")
    raw == "email_address_invalid" -> localized("أدخل بريداً إلكترونياً صحيحاً.", "Enter a valid email address.")
    raw == "email_address_not_authorized" || raw == "email_delivery" -> localized(
        "تعذّر إرسال البريد حالياً. استخدم البريد وكلمة المرور للمتابعة.", "Email delivery is unavailable. Use email and password to continue.",
    )
    raw == "signup_disabled" || raw == "email_provider_disabled" -> localized("التسجيل غير متاح حالياً.", "Registration is currently unavailable.")
    raw == "profile_setup" -> localized("تم تسجيل دخولك. احفظ بيانات الشحن لإكمال إعداد الحساب.", "You’re signed in. Save your shipping details to finish setup.")
    raw == "phone_unavailable" -> localized("تم تسجيل دخولك. أدخل رقم موبايل آخر لهذا المتجر.", "You’re signed in. Enter a different mobile number for this store.")
    "email_not_confirmed" in raw || "not confirmed" in raw -> localized(
        "يرجى تأكيد بريدك الإلكتروني باستخدام الرمز المرسل إليك.",
        "Please confirm your email using the code in your inbox.",
    )
    "rate_limit" in raw || "rate limit" in raw || "security purposes" in raw || "429" in raw -> localized(
        "تم إرسال محاولات كثيرة. يرجى الانتظار قليلاً ثم المحاولة مجدداً.",
        "Too many attempts. Please wait a little and try again.",
    )
    "weak_password" in raw || "weak password" in raw || "password should be" in raw -> localized("اختر كلمة مرور قوية من 6 أحرف على الأقل.", "Choose a stronger password of at least 6 characters.")
    "email_exists" in raw || "user_already_exists" in raw || "already registered" in raw || "user already exists" in raw -> localized(
        "هذا البريد الإلكتروني مسجل بالفعل. يمكنك تسجيل الدخول مباشرة.",
        "This email is already registered. Please sign in instead.",
    )
    "invalid login" in raw || "invalid_credentials" in raw -> localized(
        "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
        "Incorrect email or password.",
    )
    "expired" in raw -> localized(
        "انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد.",
        "This verification code has expired. Please request a new code.",
    )
    "otp" in raw || "token" in raw -> localized(
        "رمز التحقق غير صحيح. يرجى مراجعة الأرقام وإعادة المحاولة.",
        "Invalid verification code. Please check the digits and try again.",
    )
    else -> localized(
        "تعذر إكمال العملية حالياً. حاول مرة أخرى.",
        "Unable to complete authentication right now. Please try again.",
    )
}
