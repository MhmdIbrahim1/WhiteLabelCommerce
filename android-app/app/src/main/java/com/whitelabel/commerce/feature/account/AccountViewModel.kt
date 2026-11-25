package com.whitelabel.commerce.feature.account

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.whitelabel.commerce.core.data.remote.PhoneNormalizer
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.AuthSessionState
import com.whitelabel.commerce.core.domain.model.CustomerProfile
import com.whitelabel.commerce.core.domain.model.Order
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
private val OTP_SIX_DIGITS_REGEX = Regex("^[0-9]{6}$")

enum class AuthTab {
    EMAIL_OTP,
    PASSWORD,
}

enum class PasswordAuthMode {
    SIGN_IN,
    REGISTER,
}

data class AuthFormState(
    val activeTab: AuthTab = AuthTab.EMAIL_OTP,
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
    val orders: List<Order> = emptyList(),
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
    private val ordersState = MutableStateFlow<List<Order>>(emptyList())
    private val loadingOrdersState = MutableStateFlow(false)
    private val walletSummaryState = MutableStateFlow(WalletSummary())
    private val loadingWalletState = MutableStateFlow(false)

    private var cooldownJob: Job? = null

    val uiState: StateFlow<AccountUiState> = combine(
        authRepository.sessionState,
        authFormState,
        profileFormState,
        combine(ordersState, loadingOrdersState, storeRepository.storeSettings) { o, l, s -> Triple(o, l, s) },
        combine(walletSummaryState, loadingWalletState) { w, lw -> w to lw },
    ) { session, authForm, profileForm, (orders, loadingOrders, settings), (wallet, loadingWallet) ->
        AccountUiState(
            session = session,
            authForm = authForm,
            profileForm = profileForm,
            orders = orders,
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
                        loadAccountOrders()
                        loadWallet()
                    }

                    AuthSessionState.SignedOut -> {
                        profileFormState.value = ProfileFormState()
                        ordersState.value = emptyList()
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
        val digits = value.filter { it.isDigit() }.take(6)
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
        authFormState.update { it.copy(phone = PhoneNormalizer.normalizeForEgyptCheckout(value), errorMessage = null) }
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

        viewModelScope.launch {
            authFormState.update { it.copy(isSubmitting = true, errorMessage = null, infoMessage = null) }
            authRepository.sendEmailOtp(email)
                .onSuccess {
                    authFormState.update {
                        it.copy(
                            isSubmitting = false,
                            otpSent = true,
                            infoMessage = localized(
                                "تم إرسال رمز تحقق مكوّن من 6 أرقام إلى $email",
                                "A 6-digit verification code was sent to $email",
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
        if (!OTP_SIX_DIGITS_REGEX.matches(code)) {
            authFormState.update {
                it.copy(
                    errorMessage = localized(
                        "يرجى إدخال رمز التحقق المكوّن من 6 أرقام.",
                        "Please enter the 6-digit verification code.",
                    ),
                )
            }
            return
        }

        viewModelScope.launch {
            authFormState.update { it.copy(isSubmitting = true, errorMessage = null) }
            authRepository.verifyEmailOtp(email, code)
                .onSuccess {
                    cooldownJob?.cancel()
                    authFormState.value = AuthFormState()
                    onSignedIn()
                }
                .onFailure { err ->
                    authFormState.update {
                        it.copy(
                            isSubmitting = false,
                            errorMessage = mapAuthError(authErrorDetail(err)),
                        )
                    }
                }
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
        if (password.length < 6) {
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
            if (cleanName.length < 2) {
                authFormState.update {
                    it.copy(errorMessage = localized("يرجى إدخال الاسم بالكامل.", "Please enter your full name."))
                }
                return
            }
            if (!EGYPT_MOBILE_REGEX.matches(cleanPhone)) {
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

            viewModelScope.launch {
                authFormState.update { it.copy(isSubmitting = true, errorMessage = null, infoMessage = null) }
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
                                    otpEmail = email,
                                    infoMessage = localized(
                                        "تم إنشاء الحساب بنجاح! أكّد بريدك الإلكتروني أو استخدم رمز التحقق (6 أرقام) للدخول فوراً.",
                                        "Account created! Confirm your email or use the 6-digit Email OTP tab to sign in immediately.",
                                    ),
                                )
                            }
                        }
                    }
                    .onFailure { err ->
                        authFormState.update {
                            it.copy(
                                isSubmitting = false,
                                errorMessage = mapAuthError(authErrorDetail(err)),
                            )
                        }
                    }
            }
            return
        }

        viewModelScope.launch {
            authFormState.update { it.copy(isSubmitting = true, errorMessage = null, infoMessage = null) }
            authRepository.signInWithPassword(email, password)
                .onSuccess {
                    authFormState.value = AuthFormState()
                    onSignedIn()
                }
                .onFailure { err ->
                    authFormState.update {
                        it.copy(
                            isSubmitting = false,
                            errorMessage = mapAuthError(authErrorDetail(err)),
                        )
                    }
                }
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
                profileFormState.update { it.copy(isSaving = false, saveSuccess = true) }
                // Reload synced orders immediately so any newly claimed guest orders appear
                loadAccountOrders()
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

    fun loadAccountOrders() {
        viewModelScope.launch {
            loadingOrdersState.value = true
            orderRepository.getMyOrders()
                .onSuccess { list -> ordersState.value = list; accountError.value = null }
                .onFailure { accountError.value = localized("تعذر تحميل الطلبات.", "Could not load your orders.") }
            loadingOrdersState.value = false
        }
    }

    fun signOut(onSignedOut: () -> Unit = {}) {
        viewModelScope.launch {
            authRepository.signOut()
            ordersState.value = emptyList()
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
    val code = (error as? io.github.jan.supabase.auth.exception.AuthRestException)?.errorCode?.value
    return listOfNotNull(code, error.message).joinToString(" ").lowercase()
}

internal fun mapAuthError(raw: String): String = when {
    "email_not_confirmed" in raw || "not confirmed" in raw -> localized(
        "يرجى تأكيد بريدك الإلكتروني أولاً، أو الدخول فوراً عبر رمز التحقق (6 أرقام).",
        "Please confirm your email first, or sign in instantly via the 6-digit Email OTP tab.",
    )
    "rate_limit" in raw || "rate limit" in raw || "security purposes" in raw || "429" in raw -> localized(
        "تم إرسال محاولات كثيرة. يرجى الانتظار 60 ثانية ثم المحاولة مجدداً.",
        "Too many attempts. Please wait 60 seconds and try again.",
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
        "رمز التحقق غير صحيح. يرجى مراجعة الأرقام الـ 6 وإعادة المحاولة.",
        "Invalid verification code. Please check the 6 digits and try again.",
    )
    else -> localized(
        "تعذر إكمال العملية حالياً. حاول مرة أخرى.",
        "Unable to complete authentication right now. Please try again.",
    )
}
