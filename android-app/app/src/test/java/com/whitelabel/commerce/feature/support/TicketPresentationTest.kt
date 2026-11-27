package com.whitelabel.commerce.feature.support

import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.domain.model.SupportTicket
import com.whitelabel.commerce.core.domain.model.SupportTicketMessage
import com.whitelabel.commerce.core.domain.model.TicketStatus
import com.whitelabel.commerce.core.data.repository.validatedSupportReply
import com.whitelabel.commerce.core.data.repository.ticketMessagePage
import com.whitelabel.commerce.core.data.remote.dto.SupportTicketDto
import com.whitelabel.commerce.core.data.remote.dto.SupportTicketMessageDto
import kotlinx.serialization.json.Json
import io.github.jan.supabase.annotations.SupabaseExperimental
import io.github.jan.supabase.postgrest.PropertyConversionMethod
import io.github.jan.supabase.postgrest.query.PostgrestRequestBuilder
import org.junit.Assert.*
import org.junit.Test
import java.util.TimeZone

class TicketPresentationTest {
    private val id = "f49df86a-4fdf-42f9-a408-ccd13a465686"
    private val ticket = SupportTicket("ticket", subject = "About #$id", message = "First\n\nLast", createdAt = "")

    @OptIn(SupabaseExperimental::class)
    @Test fun threadPageIsTenantScopedAndOrderedByDatabaseTimestampWithAnIdTieBreaker() {
        val request = PostgrestRequestBuilder(PropertyConversionMethod.NONE)
        request.ticketMessagePage(ticket.id, 100)
        assertEquals(listOf("eq.${BuildConfig.STORE_ID}"), request.params["store_id"])
        assertEquals(listOf("eq.${ticket.id}"), request.params["ticket_id"])
        assertEquals(listOf("created_at.asc.nullslast,id.asc.nullslast"), request.params["order"])
        assertEquals(listOf("100"), request.params["offset"])
        assertEquals(listOf("100"), request.params["limit"])
    }

    @Test fun onlyTheSignedInOwnerCanReplyBeforeClosure() {
        val mine = ticket.copy(customerId = "me")
        assertTrue(mine.canReply("me"))
        assertTrue(mine.copy(status = TicketStatus.IN_PROGRESS).canReply("me"))
        assertFalse(mine.copy(status = TicketStatus.CLOSED).canReply("me"))
        assertFalse(mine.canReply("other"))
        assertFalse(mine.canReply(null))
        assertFalse(ticket.canReply(null))
        assertFalse(ticket.canReply("me"))
    }

    @Test fun closedThreadPreservesDatabaseOrderAcrossSpeakersAndDoesNotDuplicateLegacyReply() {
        val closed = ticket.copy(status = TicketStatus.CLOSED, adminReply = "Staff response")
        val messages = listOf(
            SupportTicketMessage("z", ticket.id, "customer", ticket.message, "2026-11-20T10:00:00.000001Z"),
            SupportTicketMessage("y", ticket.id, "merchant", closed.adminReply, "2026-11-20T10:00:00.000002Z"),
            SupportTicketMessage("x", ticket.id, "customer", "Thank you!", "2026-11-20T10:00:00.000003Z"),
            SupportTicketMessage("w", ticket.id, "system", "Resolved", "2026-11-20T10:00:00.000004Z"),
        )
        assertEquals(messages, closed.conversation(messages))
    }

    @Test fun legacyConversationIncludesTheOriginalAndThenTheReplyWhenAvailable() {
        val closed = ticket.copy(status = TicketStatus.CLOSED, adminReply = "Support reply")
        val thread = closed.conversation(emptyList())
        assertEquals(listOf("customer", "merchant"), thread.map { it.senderRole })
        assertEquals(listOf(ticket.message, closed.adminReply), thread.map { it.body })
        assertEquals(listOf(ticket.message), ticket.conversation(emptyList()).map { it.body })
    }

    @Test fun serverErrorsHaveSpecificBilingualFeedback() {
        assertEquals(SupportError.RateLimit, mapSupportError("""{"message":"rate_limit_exceeded"}"""))
        assertEquals(SupportError.InvalidMessage, mapSupportError("P0001: invalid_support_message"))
        assertEquals(SupportError.Unavailable, mapSupportError("network timeout"))
        assertTrue(SupportError.RateLimit.english.contains("15 minutes"))
        assertTrue(SupportError.RateLimit.arabic.contains("15 دقيقة"))
        assertTrue(SupportError.InvalidMessage.english.contains("4,000"))
        assertTrue(SupportError.InvalidMessage.arabic.contains("4000"))
    }

    @Test fun replyLengthMatchesDatabaseCharacterCountAfterTrimming() {
        assertEquals("س", validatedSupportReply(" \nس\t"))
        val max = "🙂".repeat(4000)
        assertEquals(max, validatedSupportReply(max))
        for (invalid in listOf(" \n\t", max + "x")) {
            assertEquals("invalid_support_message", runCatching { validatedSupportReply(invalid) }.exceptionOrNull()?.message)
        }
    }

    @Test fun serverThreadAndTicketFieldsDecodeAlongsideLegacyDefaults() {
        val legacy = """{"id":"t","subject":"s","message":"m","created_at":"then"}"""
        val base = Json.decodeFromString<SupportTicketDto>(legacy).toDomain()
        assertEquals("normal", base.priority)
        assertEquals("", base.lastMessageAt)
        val recent = Json.decodeFromString<SupportTicketDto>(legacy.dropLast(1) + ""","priority":"high","last_message_at":"now"}""").toDomain()
        assertEquals("high", recent.priority)
        assertEquals("now", recent.lastMessageAt)
        val row = """{"id":"m","ticket_id":"t","sender_role":"merchant","body":"hi","created_at":"now"}"""
        assertEquals(SupportTicketMessage("m", "t", "merchant", "hi", "now"), Json.decodeFromString<SupportTicketMessageDto>(row).toDomain())
    }

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
