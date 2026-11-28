package com.whitelabel.commerce.feature.account

import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class HybridGoogleSignInTest {
    private val success = GoogleIdTokenResult.Success("id-token", "nonce")

    @Test fun novaExchangesNativeCredential() = runTest {
        var exchanges = 0
        assertFalse(startHybridGoogleSignIn(false, "web", { success }, { token, nonce ->
            assertEquals("id-token", token)
            assertEquals("nonce", nonce)
            exchanges++
            Result.success(Unit)
        }) { error("unexpected browser") })
        assertEquals(1, exchanges)
    }

    @Test fun novaExplicitNativeCancellationStops() = runTest {
        assertFalse(startHybridGoogleSignIn(false, "web", { GoogleIdTokenResult.Cancelled },
            { _, _ -> error("unexpected exchange") }) { error("unexpected browser") })
    }

    @Test fun novaProviderUnavailableOrBrokenUsesBrowser() = runTest {
        for (result in listOf(GoogleIdTokenResult.Unavailable, GoogleIdTokenResult.Error(Exception()))) {
            var launches = 0
            assertTrue(startHybridGoogleSignIn(false, "web", { result }, { _, _ -> error("unexpected exchange") }) { launches++ })
            assertEquals(1, launches)
        }
    }

    @Test fun tenantAndUnconfiguredNativeClientSkipCredentialManager() = runTest {
        for ((tenant, client) in listOf(true to "web", true to "", false to "")) {
            var launches = 0
            assertTrue(startHybridGoogleSignIn(tenant, client, { error("unexpected native prompt") },
                { _, _ -> error("unexpected exchange") }) { launches++ })
            assertEquals(1, launches)
        }
    }

    @Test fun rejectedAudienceOrUnavailableGrantFallsBack() = runTest {
        for (message in listOf("Unacceptable audience in id_token", "google_unavailable")) {
            var launches = 0
            assertTrue(startHybridGoogleSignIn(false, "web", { success },
                { _, _ -> Result.failure(Exception(message)) }) { launches++ })
            assertEquals(1, launches)
        }
    }

    @Test fun otherExchangeFailuresAreReported() = runTest {
        val issue = Exception("network")
        val result = runCatching { startHybridGoogleSignIn(false, "web", { success },
            { _, _ -> Result.failure(issue) }) { error("unexpected browser") } }
        assertSame(issue, result.exceptionOrNull())
    }

    @Test fun browserBackClearsOnlyBrowserWaitAndPreservesForm() {
        val idle = AuthFormState(otpEmail = "shopper@example.test")
        assertEquals(idle, idle.copy(action = AuthAction.GoogleBrowser).onBrowserResume())
        listOf(AuthAction.Send, AuthAction.Verify, AuthAction.Google, AuthAction.GoogleCallback).forEach {
            val busy = idle.copy(action = it)
            assertSame(busy, busy.onBrowserResume())
        }
    }
}
