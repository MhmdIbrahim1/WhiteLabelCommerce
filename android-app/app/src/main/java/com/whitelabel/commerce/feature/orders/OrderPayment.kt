package com.whitelabel.commerce.feature.orders

import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.FlashSalePricing
import com.whitelabel.commerce.core.domain.model.OrderStatus

internal fun paymentStatusLabel(status: String, method: String?): String = when (status.lowercase()) {
    "paid" -> localized("مدفوع", "Paid")
    "pending" -> localized("قيد الدفع", "Payment pending")
    "unpaid" -> if (method.equals("cod", true)) localized("الدفع عند الاستلام", "Pay on delivery")
        else localized("لم يُدفع بعد", "Unpaid")
    "cod_pending" -> localized("الدفع عند الاستلام", "Pay on delivery")
    "failed" -> localized("فشل الدفع", "Payment failed")
    "refund_pending" -> localized("بانتظار رد المبلغ", "Refund pending")
    "refunded" -> localized("تم رد المبلغ", "Refunded")
    "voided" -> localized("أُلغيت عملية الدفع", "Payment voided")
    else -> localized("حالة الدفع غير متاحة", "Payment status unavailable")
}

internal data class OrderPaymentWindow(
    val canRetry: Boolean = false,
    val ended: Boolean = false,
    val remainingMillis: Long? = null,
)

internal fun orderPaymentWindow(
    method: String, paymentStatus: String, fulfillment: OrderStatus,
    reservationExpiresAt: String?, now: Long,
): OrderPaymentWindow {
    if (method !in setOf("paymob_card", "paymob_wallet") || paymentStatus !in setOf("unpaid", "pending", "failed")) {
        return OrderPaymentWindow()
    }
    if (fulfillment !in setOf(OrderStatus.PENDING, OrderStatus.CONFIRMED)) {
        return OrderPaymentWindow(ended = true)
    }
    if (reservationExpiresAt == null) return OrderPaymentWindow(canRetry = true)
    val expires = FlashSalePricing.parseIsoTimestampMillis(reservationExpiresAt)
    if (expires == null || expires <= now) return OrderPaymentWindow(ended = true)
    return OrderPaymentWindow(canRetry = true, remainingMillis = expires - now)
}
