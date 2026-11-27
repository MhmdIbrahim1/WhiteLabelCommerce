package com.whitelabel.commerce.core.domain.model

enum class OrderStatus(val rawValue: String, private val arabicText: String) {
    PENDING("pending", "قيد المراجعة"),
    CONFIRMED("confirmed", "جاري التجهيز"),
    SHIPPED("shipped", "تم الشحن"),
    DELIVERED("delivered", "تم التوصيل"),
    CANCELLED("cancelled", "ملغي");
    val arabicLabel: String get() = com.whitelabel.commerce.core.designsystem.localized(arabicText, when (this) {
        PENDING -> "Pending"
        CONFIRMED -> "Confirmed"
        SHIPPED -> "Shipped"
        DELIVERED -> "Delivered"
        CANCELLED -> "Cancelled"
    })


    companion object {
        fun fromRaw(value: String?): OrderStatus =
            entries.firstOrNull { it.rawValue.equals(value, ignoreCase = true) } ?: PENDING
    }
}

enum class PaymentMethod(val rawValue: String, val arabicLabel: String) {
    COD("cod", "الدفع عند الاستلام"),
    CARD("paymob_card", "بطاقة ائتمان"),
    WALLET("paymob_wallet", "محفظة إلكترونية"),
    STORE_WALLET("wallet", "محفظة المتجر"),
    COUPON("coupon", "كوبون خصم");

    companion object {
        fun fromRaw(value: String?): PaymentMethod? =
            entries.firstOrNull { it.rawValue.equals(value, ignoreCase = true) }
    }
}

data class OrderItem(
    val id: String,
    val orderId: String,
    val productId: String? = null,
    val productName: String,
    val unitPrice: Double,
    val quantity: Int,
    val size: String? = null,
    val color: String? = null,
) {
    val lineTotal: Double
        get() = unitPrice * quantity
}

data class Order(
    val lat: Double? = null,
    val lng: Double? = null,
    val paymentStatus: String = "unpaid",
    val trackingNumber: String? = null,
    val carrier: String? = null,
    val id: String,
    val userId: String? = null,
    val status: OrderStatus = OrderStatus.PENDING,
    val shippingAddress: String,
    val phone: String? = null,
    val paymentMethod: PaymentMethod? = null,
    val currency: String,
    val subtotal: Double? = null,
    val shippingFee: Double,
    val walletDiscount: Double = 0.0,
    val cashbackEarned: Double = 0.0,
    val total: Double? = null,
    val guestTracking: Boolean = false,
    val createdAt: String,
    val items: List<OrderItem> = emptyList(),
    val reservationExpiresAt: String? = null,
    val paymentReview: String? = null,
    val discountAmount: Double = 0.0,
)

/**
 * Receipt returned by public.checkout_reviewed, including idempotent replays.
 */
data class CheckoutResult(
    val orderNumber: String,
    val amount: Double,
    val currency: String,
    val method: String,
    val paymentStatus: String,
    val fulfillmentStatus: OrderStatus,
    val reservationExpiresAt: String?,
    val created: Boolean,
    val guest: Boolean,
)

/**
 * Narrowly-scoped guest order tracking payload returned by `public.track_guest_order`.
 */
data class GuestOrderTracking(
    val paymentStatus: String = "unpaid",
    val trackingNumber: String? = null,
    val carrier: String? = null,
    val method: String = "cod",
    val id: String,
    val status: OrderStatus,
    val createdAt: String,
    val reservationExpiresAt: String? = null,
    val paymentReview: String? = null,
)

internal fun Order.trackingSummary() = GuestOrderTracking(
    id = id, status = status, createdAt = createdAt, method = paymentMethod?.rawValue ?: "cod",
    paymentStatus = paymentStatus, trackingNumber = trackingNumber, carrier = carrier,
    reservationExpiresAt = reservationExpiresAt, paymentReview = paymentReview,
)
