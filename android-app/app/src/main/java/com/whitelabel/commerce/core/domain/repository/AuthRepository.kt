package com.whitelabel.commerce.core.domain.repository

import com.whitelabel.commerce.core.domain.model.AuthSessionState
import com.whitelabel.commerce.core.domain.model.CustomerProfile
import kotlinx.coroutines.flow.StateFlow

interface AuthRepository {
    val sessionState: StateFlow<AuthSessionState>

    suspend fun sendEmailOtp(email: String): Result<Unit>

    suspend fun verifyEmailOtp(email: String, token: String): Result<Unit>

    suspend fun signInWithGoogleIdToken(idToken: String, rawNonce: String): Result<Unit>

    suspend fun prepareGoogleOAuthUrl(): Result<String>

    suspend fun exchangeGoogleOAuthCode(code: String): Result<Unit>

    suspend fun completeStoreCustomerOnboarding(fullName: String, phone: String): Result<Unit>

    suspend fun refreshProfile(): Result<CustomerProfile?>

    suspend fun saveProfile(profile: CustomerProfile): Result<CustomerProfile>

    suspend fun signOut(): Result<Unit>
}
