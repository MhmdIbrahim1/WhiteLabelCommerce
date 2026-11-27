package com.whitelabel.commerce.core.domain.model

enum class TicketStatus(val rawValue: String, private val arabicText: String) {
    OPEN("open", "مفتوحة"),
    IN_PROGRESS("in_progress", "قيد المتابعة"),
    CLOSED("closed", "تم الحل");
    val arabicLabel: String get() = com.whitelabel.commerce.core.designsystem.localized(arabicText, when (this) {
        OPEN -> "Open"
        IN_PROGRESS -> "In progress"
        CLOSED -> "Resolved"
    })


    companion object {
        fun fromRaw(value: String?): TicketStatus =
            entries.firstOrNull { it.rawValue.equals(value, ignoreCase = true) } ?: OPEN
    }
}

data class SupportTicket(
    val id: String,
    val customerId: String? = null,
    val subject: String,
    val message: String,
    val status: TicketStatus = TicketStatus.OPEN,
    val adminReply: String = "",
    val orderId: String? = null,
    val createdAt: String,
    val priority: String = "normal",
    val lastMessageAt: String = "",
)

data class SupportTicketMessage(
    val id: String,
    val ticketId: String,
    val senderRole: String,
    val body: String,
    val createdAt: String,
)
