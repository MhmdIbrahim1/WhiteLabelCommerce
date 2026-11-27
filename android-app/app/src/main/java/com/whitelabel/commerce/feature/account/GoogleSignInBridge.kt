package com.whitelabel.commerce.feature.account

import android.app.Activity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.CancellationException
import java.security.MessageDigest
import java.security.SecureRandom

sealed interface GoogleIdTokenResult {
    class Success(val idToken: String, val rawNonce: String) : GoogleIdTokenResult
    data object Cancelled : GoogleIdTokenResult
    data object Unavailable : GoogleIdTokenResult
    class Error(val cause: Throwable) : GoogleIdTokenResult
}

object GoogleSignInBridge {
    private val secureRandom = SecureRandom()

    fun generateRawNonce(): String = ByteArray(32).also(secureRandom::nextBytes).lowercaseHex()

    fun sha256Hex(rawNonce: String): String =
        MessageDigest.getInstance("SHA-256").digest(rawNonce.toByteArray(Charsets.UTF_8)).lowercaseHex()

    suspend fun signIn(activity: Activity, webClientId: String): GoogleIdTokenResult {
        if (webClientId.isBlank()) return GoogleIdTokenResult.Unavailable
        return try {
            val rawNonce = generateRawNonce()
            val option = GetSignInWithGoogleOption.Builder(webClientId)
                .setNonce(sha256Hex(rawNonce))
                .build()
            val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
            val credential = CredentialManager.create(activity).getCredential(activity, request).credential
            check(credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                "Unexpected Google credential type"
            }
            val token = GoogleIdTokenCredential.createFrom(credential.data).idToken
            GoogleIdTokenResult.Success(token, rawNonce)
        } catch (error: Exception) {
            classifyFailure(error)
        }
    }

    internal fun classifyFailure(error: Exception): GoogleIdTokenResult = when (error) {
        is CancellationException -> throw error
        is GetCredentialCancellationException -> GoogleIdTokenResult.Cancelled
        is NoCredentialException, is GetCredentialUnsupportedException,
        is GetCredentialProviderConfigurationException -> GoogleIdTokenResult.Unavailable
        // Some Play Services versions forward DEVELOPER_ERROR (status 10) or the
        // developer-console diagnostic as a generic Credential Manager exception.
        is GetCredentialException -> {
            val message = error.message.orEmpty()
            if (message.trimStart().startsWith("10:") ||
                message.contains("developer_error", ignoreCase = true) ||
                message.contains("developer console", ignoreCase = true) ||
                message.contains("client id", ignoreCase = true) ||
                message.contains("play services", ignoreCase = true)
            ) GoogleIdTokenResult.Unavailable else GoogleIdTokenResult.Error(error)
        }
        else -> GoogleIdTokenResult.Error(error)
    }

    private fun ByteArray.lowercaseHex(): String = buildString(size * 2) {
        val digits = "0123456789abcdef"
        for (byte in this@lowercaseHex) {
            append(digits[(byte.toInt() and 0xff) ushr 4])
            append(digits[byte.toInt() and 0x0f])
        }
    }
}
