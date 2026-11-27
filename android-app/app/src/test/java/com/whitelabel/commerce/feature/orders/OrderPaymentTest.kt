package com.whitelabel.commerce.feature.orders

import com.whitelabel.commerce.core.designsystem.arabicLanguage
import com.whitelabel.commerce.core.domain.model.OrderStatus
import org.junit.Assert.*
import org.junit.Test

class OrderPaymentTest {
    @Test fun paymentStatusesRemainDistinctInBothLanguages() {
        val labels = mapOf(
            "paid" to ("مدفوع" to "Paid"), "pending" to ("قيد الدفع" to "Payment pending"),
            "unpaid" to ("لم يُدفع بعد" to "Unpaid"), "cod_pending" to ("الدفع عند الاستلام" to "Pay on delivery"),
            "failed" to ("فشل الدفع" to "Payment failed"), "refund_pending" to ("بانتظار رد المبلغ" to "Refund pending"),
            "refunded" to ("تم رد المبلغ" to "Refunded"), "voided" to ("أُلغيت عملية الدفع" to "Payment voided"),
        )
        val previous = arabicLanguage.value
        try {
            for (arabic in listOf(true, false)) {
                arabicLanguage.value = arabic
                for ((status, text) in labels) assertEquals(if (arabic) text.first else text.second, paymentStatusLabel(status, "paymob_card"))
                assertEquals(if (arabic) "الدفع عند الاستلام" else "Pay on delivery", paymentStatusLabel("unpaid", "cod"))
                assertEquals(if (arabic) "كوبون خصم" else "Promo coupon", orderMethodLabel("coupon"))
            }
        } finally {
            arabicLanguage.value = previous
        }
    }

    @Test fun reservationUsesExactDeadlineAndSupportsLegacyMissingExpiry() {
        val cutoff = "1970-01-01T02:01:00.000000+02:00"
        for (method in listOf("paymob_card", "paymob_wallet")) {
            for (status in listOf("unpaid", "pending", "failed")) {
                for (fulfillment in listOf(OrderStatus.PENDING, OrderStatus.CONFIRMED)) {
                    val before = orderPaymentWindow(method, status, fulfillment, cutoff, 59_999)
                    assertTrue(before.canRetry)
                    assertEquals(1L, before.remainingMillis)
                    assertTrue(orderPaymentWindow(method, status, fulfillment, cutoff, 60_000).ended)
                    assertFalse(orderPaymentWindow(method, status, fulfillment, cutoff, 60_001).canRetry)
                    assertTrue(orderPaymentWindow(method, status, fulfillment, null, 60_000).canRetry)
                }
            }
        }
    }

    @Test fun closedFulfillmentsAndSettledPaymentsNeverRetry() {
        for (fulfillment in listOf(OrderStatus.CANCELLED, OrderStatus.SHIPPED, OrderStatus.DELIVERED)) {
            assertTrue(orderPaymentWindow("paymob_card", "unpaid", fulfillment, null, 0).ended)
        }
        for (status in listOf("paid", "cod_pending", "refund_pending", "refunded", "voided")) {
            assertFalse(orderPaymentWindow("paymob_card", status, OrderStatus.PENDING, null, 0).canRetry)
        }
        for (method in listOf("cod", "wallet", "coupon")) {
            assertFalse(orderPaymentWindow(method, "unpaid", OrderStatus.PENDING, null, 0).canRetry)
        }
        assertFalse(orderPaymentWindow("paymob_wallet", "unpaid", OrderStatus.PENDING, "invalid", 0).canRetry)
    }
}
