package com.whitelabel.commerce.core.data.repository

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.data.di.enrolledUserKey
import com.whitelabel.commerce.core.data.remote.PhoneNormalizer
import com.whitelabel.commerce.core.data.remote.dto.CustomerProfileDto
import com.whitelabel.commerce.core.data.remote.dto.StoreMembershipDto
import com.whitelabel.commerce.core.data.remote.runSuspendCatching
import com.whitelabel.commerce.core.domain.model.AuthSessionState
import com.whitelabel.commerce.core.domain.model.CustomerProfile
import com.whitelabel.commerce.core.domain.model.StorefrontAuthInput
import com.whitelabel.commerce.core.domain.repository.AuthRepository
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.OtpType
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.Google
import io.github.jan.supabase.auth.providers.builtin.IDToken
import io.github.jan.supabase.auth.providers.builtin.OTP
import io.github.jan.supabase.auth.status.RefreshFailureCause
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.exceptions.HttpRequestException
import io.github.jan.supabase.exceptions.RestException
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Singleton
class AuthRepositoryImpl @Inject constructor(
    private val supabase: SupabaseClient,
    private val dataStore: DataStore<Preferences>,
) : AuthRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val sessionLock = Mutex()
    private val _sessionState = MutableStateFlow<AuthSessionState>(AuthSessionState.Loading)
    override val sessionState: StateFlow<AuthSessionState> = _sessionState.asStateFlow()

    // A successful sign-in and its SDK status notification refer to the same session.
    private var checkedStatus: SessionStatus.Authenticated? = null

    init {
        scope.launch {
            supabase.auth.sessionStatus.collectLatest { status ->
                runSuspendCatching {
                    sessionLock.withLock {
                        if (supabase.auth.sessionStatus.value !== status) return@withLock
                        when (status) {
                            is SessionStatus.Authenticated -> resolveMembership(status)
                            is SessionStatus.RefreshFailure -> restoreOfflineSession(status)
                            is SessionStatus.NotAuthenticated -> {
                                checkedStatus = null
                                _sessionState.value = AuthSessionState.SignedOut
                            }
                            SessionStatus.Initializing -> _sessionState.value = AuthSessionState.Loading
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
        val cleanToken = StorefrontAuthInput.otpDigits(token)
        require(StorefrontAuthInput.isOtpReady(cleanToken)) { "invalid_otp" }
        sessionLock.withLock {
            supabase.auth.verifyEmailOtp(type = OtpType.Email.EMAIL, email = cleanEmail, token = cleanToken)
            resolveMembership(authenticatedStatus())
        }
        Unit
    }

    override suspend fun signInWithGoogleIdToken(idToken: String, rawNonce: String): Result<Unit> = runSuspendCatching {
        sessionLock.withLock {
            supabase.auth.signInWith(IDToken) {
                provider = Google
                this.idToken = idToken
                nonce = rawNonce
            }
            resolveMembership(authenticatedStatus())
        }
        Unit
    }

    override suspend fun completeStoreCustomerOnboarding(fullName: String, phone: String): Result<Unit> = runSuspendCatching {
        require(StorefrontAuthInput.validName(fullName)) { "invalid_name" }
        require(StorefrontAuthInput.validPhone(phone)) { "invalid_phone" }
        sessionLock.withLock {
            val user = authenticatedStatus().session.user ?: error("auth_required")
            val name = fullName.trim()
            val mobile = StorefrontAuthInput.normalizePhone(phone)
            val result = supabase.postgrest.rpc(
                function = "complete_store_customer_onboarding",
                parameters = buildJsonObject {
                    put("p_store_id", BuildConfig.STORE_ID)
                    put("p_full_name", name)
                    put("p_phone", mobile)
                },
            ).decodeAs<String>()
            check(result == "ready") { "profile_setup" }
            publishMembership(user.id, user.email.orEmpty(), StoreMembershipDto(true, name, mobile))
        }
        Unit
    }

    override suspend fun refreshProfile(): Result<CustomerProfile?> = runSuspendCatching {
        val initial = supabase.auth.sessionStatus.value
        if (initial is SessionStatus.RefreshFailure) {
            // The SDK is already retrying its refresh token. Wait for that attempt before using PostgREST.
            withTimeoutOrNull(20_000L) { supabase.auth.sessionStatus.first { it !== initial } }
        }
        sessionLock.withLock {
            when (val status = supabase.auth.sessionStatus.value) {
                is SessionStatus.Authenticated -> resolveMembership(status, force = status === initial)
                is SessionStatus.RefreshFailure -> error("network")
                else -> null
            }
        }
    }

    override suspend fun saveProfile(profile: CustomerProfile): Result<CustomerProfile> = runSuspendCatching {
        sessionLock.withLock {
            val user = authenticatedStatus().session.user ?: error("auth_required")
            val current = _sessionState.value as? AuthSessionState.SignedIn
            check(current != null && current.userId == user.id && current.enrolled) { "enrollment_required" }
            supabase.postgrest.rpc(
                function = "sync_customer_profile",
                parameters = buildJsonObject {
                    put("p_store_id", BuildConfig.STORE_ID)
                    put("p_full_name", profile.fullName.trim())
                    put("p_phone", PhoneNormalizer.normalize(profile.phone))
                    put("p_city", profile.city.trim())
                    put("p_address", profile.address.trim())
                    put("p_governorate", profile.governorate.trim())
                },
            )
            val saved = loadProfileInternal(user.id, current.email) ?: error("profile_setup")
            check(supabase.auth.currentUserOrNull()?.id == user.id) { "auth_required" }
            _sessionState.value = current.copy(profile = saved)
            saved
        }
    }

    override suspend fun signOut(): Result<Unit> = runSuspendCatching {
        sessionLock.withLock {
            // During refresh failure the SDK has no current access token to revoke, and its refresh is retrying.
            check(supabase.auth.sessionStatus.value !is SessionStatus.RefreshFailure) { "network" }
            supabase.auth.signOut()
            checkedStatus = null
            _sessionState.value = AuthSessionState.SignedOut
        }
    }

    private fun authenticatedStatus(): SessionStatus.Authenticated =
        supabase.auth.sessionStatus.value as? SessionStatus.Authenticated ?: error("auth_required")

    private suspend fun resolveMembership(status: SessionStatus.Authenticated, force: Boolean = false): CustomerProfile? {
        val user = status.session.user
        if (user == null) {
            _sessionState.value = AuthSessionState.SignedOut
            return null
        }
        val email = user.email.orEmpty()
        val current = (_sessionState.value as? AuthSessionState.SignedIn)?.takeIf { it.userId == user.id }
        if (!force && status === checkedStatus && current != null) return current.profile
        val pending = AuthSessionState.SignedIn(userId = user.id, email = email)
        if (current?.membershipResolved != true) _sessionState.value = pending

        val membership = runSuspendCatching {
            supabase.postgrest.rpc(
                function = "store_customer_membership",
                parameters = buildJsonObject { put("p_store_id", BuildConfig.STORE_ID) },
            ).decodeAs<StoreMembershipDto>()
        }.getOrElse { error ->
            check(supabase.auth.currentUserOrNull()?.id == user.id) { "auth_required" }
            val state = if (error.isNetworkFailure()) {
                pending.offlineMembership(dataStore.data.first()[enrolledUserKey], current)
            } else {
                val serverError = error as? RestException
                if (serverError?.error == "store_unavailable" || serverError?.statusCode in setOf(401, 403)) {
                    dataStore.edit { it.remove(enrolledUserKey) }
                }
                pending.copy(membershipError = serverError?.error ?: "profile_setup")
            }
            checkedStatus = status
            _sessionState.value = state
            if (!state.membershipResolved) throw error
            return state.profile
        }
        val profile = publishMembership(user.id, email, membership)
        checkedStatus = status
        return profile
    }

    private suspend fun publishMembership(userId: String, email: String, membership: StoreMembershipDto): CustomerProfile {
        check(supabase.auth.currentUserOrNull()?.id == userId) { "auth_required" }
        dataStore.edit { prefs ->
            if (membership.enrolled) prefs[enrolledUserKey] = userId else prefs.remove(enrolledUserKey)
        }
        val profile = if (membership.enrolled) {
            runSuspendCatching { loadProfileInternal(userId, email) }.getOrNull() ?: membership.profile(email)
        } else {
            membership.profile(email)
        }
        check(supabase.auth.currentUserOrNull()?.id == userId) { "auth_required" }
        _sessionState.value = AuthSessionState.SignedIn(
            userId = userId,
            email = email,
            profile = profile,
            enrolled = membership.enrolled,
            membershipResolved = true,
        )
        return profile
    }

    // An expired session restored offline can produce RefreshFailure before the first Authenticated event.
    private suspend fun restoreOfflineSession(status: SessionStatus.RefreshFailure) {
        val user = supabase.auth.sessionManager.loadSession()?.user
        if (supabase.auth.sessionStatus.value !== status) return
        if (user == null) {
            _sessionState.value = AuthSessionState.SignedOut
            return
        }
        val pending = AuthSessionState.SignedIn(userId = user.id, email = user.email.orEmpty())
        val transient = when (val cause = status.cause) {
            is RefreshFailureCause.NetworkError -> cause.exception.isNetworkFailure()
            is RefreshFailureCause.InternalServerError -> cause.exception.statusCode in 500..599
        }
        val state = if (transient) {
            pending.offlineMembership(dataStore.data.first()[enrolledUserKey], _sessionState.value as? AuthSessionState.SignedIn)
        } else {
            pending.copy(membershipError = "profile_setup")
        }
        if (supabase.auth.sessionStatus.value === status) _sessionState.value = state
    }

    private suspend fun loadProfileInternal(userId: String, email: String): CustomerProfile? =
        supabase.from("store_customers").select {
            filter {
                eq("store_id", BuildConfig.STORE_ID)
                eq("user_id", userId)
            }
            limit(1)
        }.decodeList<CustomerProfileDto>().firstOrNull()?.toDomain(fallbackEmail = email)

    private fun Throwable.isNetworkFailure() = this is HttpRequestException || this is IOException
}

/** The persisted marker belongs to this store. A matching owner can reuse their in-memory profile. */
internal fun AuthSessionState.SignedIn.offlineMembership(
    cachedUserId: String?,
    previous: AuthSessionState.SignedIn?,
): AuthSessionState.SignedIn {
    val verified = userId == cachedUserId
    val profile = previous?.takeIf { verified && it.enrolled && it.userId == userId }?.profile
    return copy(
        profile = profile ?: CustomerProfile(email = email),
        enrolled = verified,
        membershipResolved = verified,
        membershipError = if (verified) null else "network",
    )
}
