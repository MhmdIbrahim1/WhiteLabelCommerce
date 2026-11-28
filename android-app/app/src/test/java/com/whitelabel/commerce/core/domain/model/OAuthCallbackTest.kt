package com.whitelabel.commerce.core.domain.model

import com.whitelabel.commerce.feature.account.googleCallbackError
import org.junit.Assert.*
import org.junit.Test

class OAuthCallbackTest {
    private val host = "omar-a7a"
    private val callback = "shopstage://$host/auth-callback"

    @Test fun ownCallbackDecodesTheCodeExactlyOnce() {
        val result = parseOAuthCallback("$callback?code=a%2Bb%252F", host) as OAuthCallback.Code
        assertEquals("a+b%2F", result.value)
    }

    @Test fun rejectsDifferentTenantProductUrlOrAuthority() {
        listOf("shopstage://nova-store/auth-callback", "https://$host/auth-callback",
            "https://omar-a7a.shopstage.live/products/a", "shopstage://$host/products/a",
            "shopstage://user@$host/auth-callback", "shopstage://$host:443/auth-callback",
            "shopstage://$host/auth-callback/", "shopstage://$host/%61uth-callback").forEach {
            assertNull(it, parseOAuthCallback("$it?code=test", host))
        }
    }

    @Test fun handlesGoogleCancellationEvenWithAdditionalParameters() {
        assertSame(OAuthCallback.Cancelled, parseOAuthCallback(
            "$callback?error=access_denied&error_description=#error=access_denied", host))
    }

    @Test fun handlesOtherErrorsWithoutExchangingAnAttachedCode() {
        val failure = parseOAuthCallback("$callback?error=server_error&code=x", host) as OAuthCallback.Failure
        assertEquals("google_retry", googleCallbackError(failure.error))
        assertEquals("google_unavailable", googleCallbackError("provider_disabled"))
    }

    @Test fun missingEmptyOrAmbiguousCodesFailCleanly() {
        listOf("", "?code=", "?code=a&code=b", "#access_token=ignored").forEach {
            assertTrue(parseOAuthCallback(callback + it, host) is OAuthCallback.Failure)
        }
    }
}
