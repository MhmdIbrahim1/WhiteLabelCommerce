package com.whitelabel.commerce.core.domain.repository

import com.whitelabel.commerce.core.domain.model.AuthSessionState
import com.whitelabel.commerce.core.domain.model.CustomerProfile
import com.whitelabel.commerce.core.domain.model.SignUpOutcome
import kotlinx.coroutines.flow.StateFlow

interface AuthRepository {
    val sessionState: StateFlow<AuthSessionState>

    suspend fun sendEmailOtp(email: String): Result<Unit>

    suspend fun verifyEmailOtp(email: String, token: String): Result<Unit>

    suspend fun signInWithPassword(email: String, password: String): Result<Unit>

    suspend fun signUpWithPassword(
        fullName: String,
        phone: String,
        email: String,
        password: String,
    ): Result<SignUpOutcome>

    suspend fun refreshProfile(): Result<CustomerProfile?>

    suspend fun saveProfile(profile: CustomerProfile): Result<CustomerProfile>

    suspend fun changePassword(password: String): Result<Unit>
    suspend fun requestPasswordRecovery(email: String): Result<Unit>
    suspend fun completePasswordRecovery(token: String, password: String): Result<Unit>

    suspend fun signOut(): Result<Unit>
}
