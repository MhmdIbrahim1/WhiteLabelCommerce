package com.whitelabel.commerce.feature.support

import com.whitelabel.commerce.core.domain.model.SupportTicket
import com.whitelabel.commerce.core.domain.model.SupportTicketMessage
import com.whitelabel.commerce.core.domain.model.TicketStatus
import java.text.DateFormat
import java.text.ParsePosition
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

private const val UUID_PATTERN = "[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}"
private val legacyOrder = Regex("""^(?:Order|رقم الطلب): (?:#)?($UUID_PATTERN)\r?\n\r?\n""")
private val uuid = Regex(UUID_PATTERN)

internal data class TicketPresentation(val subject: String, val body: String, val orderNumber: String?)

internal fun SupportTicket.canReply(userId: String?): Boolean =
    userId != null && customerId == userId && status != TicketStatus.CLOSED

internal fun SupportTicket.conversation(messages: List<SupportTicketMessage>): List<SupportTicketMessage> =
    messages.ifEmpty {
        buildList {
            add(SupportTicketMessage("original", id, "customer", presentation().body, createdAt))
            if (adminReply.isNotBlank()) add(SupportTicketMessage("legacy-reply", id, "merchant", adminReply, ""))
        }
    }

internal enum class SupportError(val arabic: String, val english: String) {
    RateLimit(
        "أرسلت عدة تذاكر مؤخراً. يرجى الانتظار 15 دقيقة قبل إرسال تذكرة جديدة.",
        "You have sent several tickets recently. Please wait 15 minutes before sending another.",
    ),
    InvalidMessage(
        "تحقق من العنوان (حتى 160 حرفًا) ونص الرسالة (من 1 إلى 4000 حرف).",
        "Check the subject (up to 160 characters) and message (1–4,000 characters).",
    ),
    Unavailable("تعذر إرسال الرسالة. يرجى المحاولة مرة أخرى.", "Unable to send your message. Please try again."),
}

internal fun mapSupportError(raw: String): SupportError = when {
    raw.contains("rate_limit_exceeded", ignoreCase = true) -> SupportError.RateLimit
    raw.contains("invalid_support_message", ignoreCase = true) -> SupportError.InvalidMessage
    else -> SupportError.Unavailable
}

internal fun SupportTicket.presentation(): TicketPresentation {
    val prefix = legacyOrder.find(message)
    val embedded = prefix?.groupValues?.get(1)
    val reference = orderId?.trim()?.takeIf { it.isNotEmpty() } ?: embedded
    val body = if (prefix != null && embedded.equals(reference, ignoreCase = true)) {
        message.substring(prefix.range.last + 1)
    } else message
    val short = reference?.let { if (uuid.matches(it)) it.take(8) else it.removePrefix("#") }
    val title = if (reference != null && short != null && uuid.matches(reference)) {
        subject.replace(reference, short, ignoreCase = true)
    } else subject
    return TicketPresentation(title, body, short?.let { "#$it" })
}

internal fun formatTicketDate(raw: String, localeTag: String, zone: TimeZone = TimeZone.getDefault()): String? {
    val text = raw.trim().replace(Regex("""(\.\d{3})\d+"""), "$1")
    val iso = text.contains('T')
    val pattern = if (!iso) "yyyy-MM-dd HH:mm" else
        "yyyy-MM-dd'T'HH:mm:ss" + (if ('.' in text) ".SSS" else "") + "XXX"
    val parser = SimpleDateFormat(pattern, Locale.US).apply {
        isLenient = false
        timeZone = zone
     }
    val pos = ParsePosition(0)
    val date = parser.parse(text, pos)?.takeIf { pos.index == text.length } ?: return null
    val locale = if (localeTag.startsWith("ar", ignoreCase = true)) Locale.forLanguageTag("ar-EG") else Locale.ENGLISH
    return DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, locale).apply {
        timeZone = zone
    }.format(date)
}
