package com.whitelabel.commerce.feature.support

import com.whitelabel.commerce.core.domain.model.SupportTicket
import org.junit.Assert.*
import org.junit.Test
import java.util.TimeZone

class TicketPresentationTest {
    private val id = "f49df86a-4fdf-42f9-a408-ccd13a465686"
    private val ticket = SupportTicket("ticket", subject = "About #$id", message = "First\n\nLast", createdAt = "")

    @Test fun legacyPrefixesInBothLanguagesKeepTheFullMessage() {
        for (label in listOf("Order", "رقم الطلب")) {
            val content = ticket.copy(message = "$label: $id\r\n\r\n${ticket.message}").presentation()
            assertEquals(TicketPresentation("About #f49df86a", ticket.message, "#f49df86a"), content)
        }
    }

    @Test fun explicitOrderWinsAndCustomerTextIsPreserved() {
        val text = "Order: $id\n\nKeep this explanation."
        assertEquals(text, ticket.copy(orderId = "other", message = text).presentation().body)
        assertEquals("#f49df86a", ticket.copy(orderId = id).presentation().orderNumber)
        assertNull(ticket.copy(message = "Please check order $id").presentation().orderNumber)
    }

    @Test fun databaseAndLegacyDatesMatchInShoppersTimeZone() {
        val zone = TimeZone.getTimeZone("GMT+02:00")
        for (lang in listOf("ar", "en")) {
            val value = formatTicketDate("2026-11-26T03:54:09.876541+00:00", lang, zone)
            assertNotNull(value)
            assertEquals(value, formatTicketDate("2026-11-26 05:54", lang, zone))
        }
        assertNotEquals(formatTicketDate("2026-11-26 05:54", "ar", zone), formatTicketDate("2026-11-26 05:54", "en", zone))
        assertNull(formatTicketDate("2026-99-99 nonsense", "ar", zone))
    }
}
