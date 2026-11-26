package com.whitelabel.commerce.core.notifications

import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class PushRegistrationTest {
    @Test fun bindsAfterRegistrationAndResyncsOnRotationLoginLogoutAndLocaleChange() = runTest {
        val sync = PushRegistration()
        val writes = mutableListOf<PushBinding>()
        var registers = 0
        suspend fun event(id: String, callback: String?, owner: String?, locale: String = "ar") =
            sync.sync(id, callback, owner, locale, { registers++; id }, { writes.add(it) })
        event("a", null, null)
        event("a", "a", null)
        event("a", null, "shopper")
        event("a", null, "shopper", "en")
        assertNull(event("b", "a", "shopper"))
        event("b", "b", "shopper", "en")
        event("b", null, null, "en")
        assertEquals(listOf(null, "shopper", "shopper", "shopper", null), writes.map { it.owner })
        assertEquals(listOf("a", "a", "a", "b", "b"), writes.map { it.token })
        assertEquals(1, registers)
    }

    @Test fun registrationAndDatabaseFailuresRemainRetryable() = runTest {
        val sync = PushRegistration()
        var writes = 0
        assertTrue(runCatching { sync.sync("a", null, null, "ar", { error("offline") }, { writes++ }) }.isFailure)
        assertTrue(runCatching { sync.sync("a", "a", null, "ar", { error("registered") }, { error("offline") }) }.isFailure)
        sync.sync("a", null, null, "ar", { "a" }, { writes++ })
        assertEquals(1, writes)
    }

    @Test fun explicitAndLegacyPayloadsChooseTheSameChannelAsTheSender() {
        assertEquals("orders_channel", NotificationChannels.forPayload(emptyMap()))
        assertEquals("promotions_channel", NotificationChannels.forPayload(mapOf("category" to "abandoned_cart")))
        assertEquals("promotions_channel", NotificationChannels.forPayload(mapOf("category" to "promo_campaign", "channel_id" to "unknown")))
        assertEquals("orders_channel", NotificationChannels.forPayload(mapOf("channel_id" to "orders_channel", "category" to "promo_campaign")))
    }
}
