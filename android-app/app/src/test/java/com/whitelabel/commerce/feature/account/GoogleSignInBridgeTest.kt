package com.whitelabel.commerce.feature.account

import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import kotlinx.coroutines.CancellationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class GoogleSignInBridgeTest {
    @Test
    fun everyAttemptGetsAFresh32ByteLowercaseHexNonce() {
        val samples = List(128) { GoogleSignInBridge.generateRawNonce() }
        assertTrue(samples.all { it.matches(Regex("[0-9a-f]{64}")) })
        assertEquals(samples.size, samples.distinct().size)
        // Every byte position must vary independently between attempts.
        for (offset in 0 until 64 step 2) {
            assertTrue(samples.map { it.substring(offset, offset + 2) }.distinct().size > 1)
        }
    }

    @Test
    fun hashesUtf8InputToLowercaseSha256Hex() {
        assertEquals(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            GoogleSignInBridge.sha256Hex("abc"),
        )
    }

    @Test
    fun aDismissedSheetIsSilentEvenWithAProviderDiagnostic() {
        val dismissal = GetCredentialCancellationException("Developer console")
        assertSame(GoogleIdTokenResult.Cancelled, GoogleSignInBridge.classifyFailure(dismissal))
    }

    @Test
    fun missingAccountUnsupportedDeviceAndProviderSetupOfferEmail() {
        val failures = listOf(
            NoCredentialException(),
            GetCredentialUnsupportedException(),
            GetCredentialProviderConfigurationException(),
            GetCredentialUnknownException("10: OAuth client mismatch"),
            GetCredentialUnknownException("[28444] Developer console is not set up correctly."),
            GetCredentialUnknownException("Google Play services is unavailable"),
        )
        failures.forEach {
            assertSame(GoogleIdTokenResult.Unavailable, GoogleSignInBridge.classifyFailure(it))
        }
    }

    @Test
    fun otherCredentialAndParsingFailuresKeepTheirCause() {
        listOf(GetCredentialUnknownException("Unexpected response"), IllegalArgumentException()).forEach {
            val result = GoogleSignInBridge.classifyFailure(it) as GoogleIdTokenResult.Error
            assertSame(it, result.cause)
        }
    }

    @Test
    fun lifecycleCancellationPropagatesToTheCallingCoroutine() {
        val cancellation = CancellationException("Screen closed")
        assertSame(cancellation, assertThrows(CancellationException::class.java) {
            GoogleSignInBridge.classifyFailure(cancellation)
        })
    }
}
