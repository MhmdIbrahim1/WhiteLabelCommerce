package com.whitelabel.commerce.core.data.remote.dto

import com.whitelabel.commerce.core.domain.model.SupportTicket
import com.whitelabel.commerce.core.domain.model.SupportTicketMessage
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
    val priority: String = "normal",
    @SerialName("last_message_at") val lastMessageAt: String = "",
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
        priority = priority,
        lastMessageAt = lastMessageAt,
    )
}

@Serializable
data class SupportTicketMessageDto(
    val id: String,
    @SerialName("ticket_id") val ticketId: String,
    @SerialName("sender_role") val senderRole: String,
    val body: String,
    @SerialName("created_at") val createdAt: String,
) {
    fun toDomain() = SupportTicketMessage(id, ticketId, senderRole, body, createdAt)
}
