package com.whitelabel.commerce.core.data.repository

import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.data.remote.PhoneNormalizer
import com.whitelabel.commerce.core.data.remote.dto.CustomerProfileDto
import com.whitelabel.commerce.core.data.remote.runSuspendCatching
import com.whitelabel.commerce.core.domain.model.AuthSessionState
import com.whitelabel.commerce.core.domain.model.CustomerProfile
import com.whitelabel.commerce.core.domain.model.SignUpOutcome
import com.whitelabel.commerce.core.domain.repository.AuthRepository
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.OtpType
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.providers.builtin.OTP
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepositoryImpl @Inject constructor(
    private val supabase: SupabaseClient,
) : AuthRepository {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _sessionState = MutableStateFlow<AuthSessionState>(AuthSessionState.Loading)
    override val sessionState: StateFlow<AuthSessionState> = _sessionState.asStateFlow()

    init {
        scope.launch {
            supabase.auth.sessionStatus.collect { status ->
                when (status) {
                    is SessionStatus.Authenticated -> {
                        val user = status.session.user
                        val uid = user?.id.orEmpty()
                        val email = user?.email.orEmpty()
                        if (uid.isBlank()) {
                            _sessionState.value = AuthSessionState.SignedOut
                        } else {
                            val existing = (_sessionState.value as? AuthSessionState.SignedIn)
                                ?.takeIf { it.userId == uid }
                                ?.profile
                            _sessionState.value = AuthSessionState.SignedIn(
                                userId = uid,
                                email = email,
                                profile = existing ?: CustomerProfile(
                                    fullName = "",
                                    phone = "",
                                    email = email,
                                ),
                            )
                            loadProfileInternal(uid, email, "", "")
                        }
                    }

                    is SessionStatus.NotAuthenticated -> {
                        _sessionState.value = AuthSessionState.SignedOut
                    }

                    is SessionStatus.Initializing -> {
                        _sessionState.value = AuthSessionState.Loading
                    }

                    is SessionStatus.RefreshFailure -> {
                        // Keep last known signed-in state while offline, or signed out if none
                        if (_sessionState.value is AuthSessionState.Loading) {
                            _sessionState.value = AuthSessionState.SignedOut
                        }
                    }
                }
            }
        }
    }

    override suspend fun sendEmailOtp(email: String): Result<Unit> = runSuspendCatching {
        val cleanEmail = email.trim().lowercase()
        supabase.auth.signInWith(OTP) {
            this.email = cleanEmail
            createUser = true
            data = buildJsonObject { put("signup_store_id", BuildConfig.STORE_ID) }
        }
    }

    override suspend fun verifyEmailOtp(email: String, token: String): Result<Unit> = runSuspendCatching {
        val cleanEmail = email.trim().lowercase()
        val cleanToken = token.filter { it.isDigit() }
        supabase.auth.verifyEmailOtp(
            type = OtpType.Email.EMAIL,
            email = cleanEmail,
            token = cleanToken,
        )
        syncProfileAfterAuth()
    }

    override suspend fun signInWithPassword(email: String, password: String): Result<Unit> = runSuspendCatching {
        val cleanEmail = email.trim().lowercase()
        supabase.auth.signInWith(Email) {
            this.email = cleanEmail
            this.password = password
        }
        syncProfileAfterAuth()
    }

    override suspend fun signUpWithPassword(
        fullName: String,
        phone: String,
        email: String,
        password: String,
    ): Result<SignUpOutcome> = runSuspendCatching {
        val cleanName = fullName.trim()
        val cleanPhone = PhoneNormalizer.normalize(phone)
        val cleanEmail = email.trim().lowercase()

        supabase.auth.signUpWith(Email) {
            this.email = cleanEmail
            this.password = password
            this.data = buildJsonObject {
                put("full_name", cleanName)
                put("phone", cleanPhone)
                put("signup_store_id", BuildConfig.STORE_ID)
            }
        }

        if (supabase.auth.currentSessionOrNull() != null) {
            syncProfileAfterAuth()
            SignUpOutcome.SIGNED_IN
        } else {
            SignUpOutcome.NEEDS_EMAIL_CONFIRMATION
        }
    }

    override suspend fun refreshProfile(): Result<CustomerProfile?> = runSuspendCatching {
        val user = supabase.auth.currentUserOrNull() ?: return@runSuspendCatching null
        loadProfileInternal(user.id, user.email.orEmpty(), "", "")
    }

    override suspend fun saveProfile(profile: CustomerProfile): Result<CustomerProfile> = runSuspendCatching {
        val user = supabase.auth.currentUserOrNull() ?: error("auth_required")
        val normalizedPhone = PhoneNormalizer.normalize(profile.phone)

        syncProfileRpc(
            fullName = profile.fullName.trim(),
            phone = normalizedPhone,
            governorate = profile.governorate.trim(),
            city = profile.city.trim(),
            address = profile.address.trim(),
        )

        val saved = loadProfileInternal(
            userId = user.id,
            email = user.email.orEmpty(),
            fallbackName = profile.fullName.trim(),
            fallbackPhone = normalizedPhone,
        ) ?: profile.copy(
            phone = normalizedPhone,
            email = user.email.orEmpty().ifBlank { profile.email },
        )
        saved
    }

    override suspend fun signOut(): Result<Unit> = runSuspendCatching {
        supabase.auth.signOut()
        _sessionState.value = AuthSessionState.SignedOut
    }

    private suspend fun syncProfileAfterAuth() {
        val result = runSuspendCatching {
            supabase.postgrest.rpc(
                function = "initialize_customer_profile",
                parameters = buildJsonObject { put("p_store_id", BuildConfig.STORE_ID) },
            ).decodeAs<String>()
        }.getOrElse { throw IllegalStateException("profile_setup", it) }
        refreshProfile().getOrThrow()
        if (result == "phone_unavailable") error("phone_unavailable")
    }

    private suspend fun syncProfileRpc(
        fullName: String,
        phone: String,
        governorate: String,
        city: String,
        address: String,
    ) {
        if (supabase.auth.currentSessionOrNull() == null) return
        supabase.postgrest.rpc(
            function = "sync_customer_profile",
            parameters = buildJsonObject {
                put("p_store_id", BuildConfig.STORE_ID)
                put("p_full_name", fullName)
                put("p_phone", phone)
                put("p_city", city)
                put("p_address", address)
                put("p_governorate", governorate)
            },
        )
    }

    private suspend fun loadProfileInternal(
        userId: String,
        email: String,
        fallbackName: String,
        fallbackPhone: String,
    ): CustomerProfile? {
        val row = runCatching {
            supabase.from("store_customers")
                .select {
                    filter {
                        eq("store_id", BuildConfig.STORE_ID)
                        eq("user_id", userId)
                    }
                    limit(1)
                }
                .decodeList<CustomerProfileDto>()
                .firstOrNull()
        }.getOrNull()

        val resolved = row?.toDomain(fallbackEmail = email) ?: CustomerProfile(
            fullName = fallbackName,
            phone = fallbackPhone,
            email = email,
        )

        _sessionState.value = AuthSessionState.SignedIn(
            userId = userId,
            email = email,
            profile = resolved,
        )
        return resolved
    }
}
