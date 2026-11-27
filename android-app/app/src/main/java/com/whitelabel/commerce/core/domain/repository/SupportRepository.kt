package com.whitelabel.commerce.core.domain.repository

import com.whitelabel.commerce.core.domain.model.SupportTicket
import com.whitelabel.commerce.core.domain.model.SupportTicketMessage
import kotlinx.coroutines.flow.Flow

interface SupportRepository {
    /**
     * Locally saved tickets submitted from this device (helpful for anonymous guests).
     */
    val localSubmittedTickets: Flow<List<SupportTicket>>

    /**
     * Submits a support ticket respecting RLS for both `anon` guests and `authenticated` customers:
     * inserts only `subject` and `message` without chaining `.select()` and without touching
     * staff-only columns (`admin_reply`, `order_id`).
     *
     * When [linkedOrderId] is provided, the order reference is embedded cleanly inside the ticket
     * message so merchants see it immediately without violating `protect_ticket_staff_fields`.
     */
    suspend fun submitTicket(
        subject: String,
        message: String,
        linkedOrderId: String? = null,
    ): Result<Unit>

    /**
     * Reads support tickets belonging to the currently signed-in customer (including `admin_reply`).
     * Returns an empty list for anonymous guests.
     */
    suspend fun getMyTickets(): Result<List<SupportTicket>>

    suspend fun getTicketMessages(ticketId: String): Result<List<SupportTicketMessage>>

    suspend fun sendTicketReply(ticketId: String, body: String): Result<SupportTicketMessage>
}
