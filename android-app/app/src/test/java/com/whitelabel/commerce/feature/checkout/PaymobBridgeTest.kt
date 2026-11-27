package com.whitelabel.commerce.feature.checkout

import com.whitelabel.commerce.BuildConfig
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Request
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.IOException
import java.net.URL

class PaymobBridgeTest {
    private val root = "https://shops.example"
    private val endpoint = "/api/payments/paymob/initiate"
    private val slug = "omar-a7a"

    @Test
    fun rootHostsUseTheirConfiguredSlugAndTenantHostsKeepTheRootEndpoint() {
        for (tenant in listOf("nova-store", slug)) {
            assertEquals("$root/s/$tenant$endpoint", buildPaymobInitiateUrl(URL("$root/"), tenant))
            assertEquals("$root/s/$tenant$endpoint", buildPaymobInitiateUrl(URL("$root/s/$tenant"), tenant))
            val subdomain = "https://$tenant.shops.example"
            assertEquals("$subdomain$endpoint", buildPaymobInitiateUrl(URL(subdomain), tenant))
        }
        assertEquals("$root$endpoint", buildPaymobInitiateUrl(URL(root), ""))
        assertEquals("http://10.0.2.2:3000/s/$slug$endpoint", buildPaymobInitiateUrl(URL("http://10.0.2.2:3000"), slug))
    }

    private fun payload(request: Request) = Buffer().use { buffer ->
        requireNotNull(request.body).writeTo(buffer)
        Json.parseToJsonElement(buffer.readUtf8()).jsonObject
    }

    @Test
    fun guestCardSendsNormalizedOrderPhoneWithoutBearerOrWalletPhone() {
        val request = paymobInitiationRequest(URL(root), slug, "abc", "paymob_card", "+٢٠١٠١٢٣٤٥٦٧٨", "", null)
        assertEquals("$root/s/$slug$endpoint", request.url.toString())
        assertNull(request.header("Authorization"))
        val json = payload(request)
        assertEquals("01012345678", json.getValue("customer_phone").jsonPrimitive.content)
        assertEquals("card", json.getValue("method").jsonPrimitive.content)
        assertNull(json["wallet_phone"])
    }

    @Test
    fun authenticatedWalletSendsBearerAndDistinctNormalizedPhones() {
        val request = paymobInitiationRequest(URL(root), slug, "abc", "paymob_wallet", "01012345678", "+201112345678", "test-token")
        assertEquals("Bearer test-token", request.header("Authorization"))
        val json = payload(request)
        assertEquals("abc", json.getValue("order_id").jsonPrimitive.content)
        assertEquals("wallet", json.getValue("method").jsonPrimitive.content)
        assertEquals("01012345678", json.getValue("customer_phone").jsonPrimitive.content)
        assertEquals("01112345678", json.getValue("wallet_phone").jsonPrimitive.content)
    }

    @Test
    fun acceptedWalletAndProcessingResponsesDoNotRequireRedirects() {
        assertEquals(PaymobInitiation.PendingWalletPrompt, parsePaymobInitiation(202, """{"state":"pending"}"""))
        assertEquals(PaymobInitiation.PendingWalletPrompt, parsePaymobInitiation(202, """{"pending_wallet_prompt":true}"""))
        assertEquals(PaymobInitiation.Processing, parsePaymobInitiation(202, """{"state":"processing"}"""))
        assertEquals(PaymobInitiation.Declined, parsePaymobInitiation(422, """{"state":"failed"}"""))
        assertThrows(OrderIneligibleException::class.java) { parsePaymobInitiation(409, """{"error":"order_ineligible"}""") }
        assertThrows(OrderIneligibleException::class.java) { parsePaymobInitiation(409, """{"code":"order_ineligible"}""") }
        assertThrows(IOException::class.java) { parsePaymobInitiation(202, """{"state":"failed"}""") }
        assertThrows(IOException::class.java) { parsePaymobInitiation(422, """{"state":"pending"}""") }
    }

    @Test
    fun redirectsRequireTheExpectedHttpsGatewayAndResponseCode() {
        val gateway = "https://accept.paymob.com/api/acceptance/iframes/1"
        assertEquals(PaymobInitiation.Redirect(gateway), parsePaymobInitiation(200, """{"redirect_url":"$gateway"}"""))
        for (url in listOf("http://accept.paymob.com", "https://paymob.com.other.example", "https://a@paymob.com")) {
            assertThrows(IOException::class.java) { parsePaymobInitiation(200, """{"redirect_url":"$url"}""") }
        }
        assertThrows(IOException::class.java) { parsePaymobInitiation(202, """{"redirect_url":"$gateway"}""") }
        assertThrows(IOException::class.java) { parsePaymobInitiation(200, "{}") }
    }

    @Test
    fun interceptsOrderAndGuestReturnOnRootAndTenantOrigins() {
        for (host in listOf(root, "https://$slug.shops.example")) {
            for (path in listOf("/orders", "/orders/return", "/s/$slug/orders", "/s/$slug/orders/return")) {
                for (outcome in listOf("success", "failed", "pending")) {
                    assertEquals(outcome, extractAppOrdersOutcome("$host$path?payment=$outcome&order=abc&proof=x", root, slug, "abc"))
                }
            }
        }
        assertEquals("success", extractAppOrdersOutcome("$root/orders?payment=success&order=", root, slug, "abc"))
        assertEquals("pending", extractAppOrdersOutcome("$root/orders?payment=pending", root, slug, "abc"))
        val tenantOrigin = "https://$slug.shops.example"
        assertEquals("pending", extractAppOrdersOutcome("$tenantOrigin/orders/return?payment=pending", tenantOrigin, slug, "abc"))
    }

    @Test
    fun rejectsForeignOriginsPathsAndMismatchedOrAmbiguousOutcomes() {
        for (url in listOf(
            "https://other.shops.example/orders?payment=success",
            "https://$slug.shops.example.evil.example/orders?payment=success",
            "https://user@shops.example/orders?payment=success",
            "http://shops.example/orders?payment=success",
            "$root:444/orders?payment=success",
            "$root/s/nova-store/orders/return?payment=success",
            "$root/orders/other?payment=success",
            "$root/orders?payment=paid",
            "$root/orders?payment=success&order=other",
            "$root/orders?payment=success&order=abc&order=other",
            "$root/orders?payment=success&payment=failed",
        )) {
            assertNull(url, extractAppOrdersOutcome(url, root, slug, "abc"))
        }
    }

    @Test
    fun localDebugReturnsRequireMatchingProtocolAndPort() {
        val local = "http://10.0.2.2:3000"
        assertEquals(if (BuildConfig.DEBUG) "pending" else null, extractAppOrdersOutcome(
            "http://localhost:3000/s/$slug/orders/return?payment=pending", local, slug, "abc",
        ))
        assertNull(extractAppOrdersOutcome("http://localhost:3001/orders?payment=pending", local, slug, "abc"))
        assertEquals(if (BuildConfig.DEBUG) "success" else null, extractAppOrdersOutcome(
            "http://$slug.localhost:3000/orders?payment=success", "http://localhost:3000", slug, "abc",
        ))
        assertNull(extractAppOrdersOutcome("http://shops.example:3000/orders?payment=pending", local, slug, "abc"))
    }
}
