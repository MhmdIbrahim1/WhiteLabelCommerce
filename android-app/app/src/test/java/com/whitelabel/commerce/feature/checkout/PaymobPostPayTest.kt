package com.whitelabel.commerce.feature.checkout

import com.whitelabel.commerce.feature.orders.formatOrderDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PaymobPostPayTest {

    @Test
    fun `ignores Paymob wallet pre-PIN redirects with pending=true`() {
        val walletPrePin =
            "https://accept.paymob.com/api/acceptance/post_pay?pending=true&success=false&hmac=abc123&order=999"
        assertTrue(isPendingPaymobUrl(walletPrePin))
        assertNull(extractStrictPostPayQuery(walletPrePin))
    }

    @Test
    fun `ignores iframe, about blank, and redirects missing success`() {
        assertNull(extractStrictPostPayQuery("about:blank"))
        assertNull(extractStrictPostPayQuery("https://accept.paymob.com/api/acceptance/iframes/1102311?payment_token=tok"))
        assertNull(extractStrictPostPayQuery("https://accept.paymob.com/api/acceptance/post_pay?hmac=abc123&order=999"))
        assertFalse(isPendingPaymobUrl("https://accept.paymob.com/api/acceptance/post_pay?pending=false&success=true"))
    }

    @Test
    fun `extracts signed query on terminal post_pay success and failure receipts`() {
        val successUrl =
            "https://accept.paymob.com/api/acceptance/post_pay?amount_cents=85100&pending=false&success=true&hmac=deadbeef"
        val failedUrl =
            "https://accept.paymob.com/api/acceptance/post_pay?amount_cents=85100&pending=false&success=false&hmac=deadbeef"

        assertNotNull(extractStrictPostPayQuery(successUrl))
        assertNotNull(extractStrictPostPayQuery(failedUrl))
    }

    @Test
    fun `formats ISO timestamps cleanly to YYYY-MM-DD`() {
        assertEquals("2026-11-24", formatOrderDate("2026-11-24T16:10:42.819203+00:00"))
        assertEquals("2026-11-24", formatOrderDate("2026-11-24 18:10"))
    }
}
