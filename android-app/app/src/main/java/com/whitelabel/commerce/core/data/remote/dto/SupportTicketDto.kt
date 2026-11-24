package com.whitelabel.commerce.core.data.remote.dto

import com.whitelabel.commerce.core.domain.model.SupportTicket
import com.whitelabel.commerce.core.domain.model.TicketStatus
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class SupportTicketDto(
    @SerialName("id") val id: String,
    @SerialName("customer_id") val customerId: String? = null,
    @SerialName("subject") val subject: String,
    @SerialName("message") val message: String,
    @SerialName("status") val status: String = "open",
    @SerialName("admin_reply") val adminReply: String = "",
    @SerialName("order_id") val orderId: String? = null,
    @SerialName("created_at") val createdAt: String,
) {
    fun toDomain(): SupportTicket = SupportTicket(
        id = id,
        customerId = customerId,
        subject = subject,
        message = message,
        status = TicketStatus.fromRaw(status),
        adminReply = adminReply,
        orderId = orderId,
        createdAt = createdAt,
    )
}

/**
 * Restricted insert DTO for both `anon` guests and `authenticated` customers.
 * Omits staff-only columns (`admin_reply`, `order_id`, `status`) so RLS policies
 * `submit_guest_ticket`, `open_own_ticket`, and `protect_ticket_staff_fields` pass cleanly.
 */
@Serializable
data class SupportTicketInsertDto(
    @SerialName("subject") val subject: String,
    @SerialName("message") val message: String,
)
