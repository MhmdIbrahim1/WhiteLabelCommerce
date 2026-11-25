package com.whitelabel.commerce.core.data.remote.dto

import com.whitelabel.commerce.core.domain.model.CheckoutResult
import com.whitelabel.commerce.core.domain.model.GuestOrderTracking
import com.whitelabel.commerce.core.domain.model.Order
import com.whitelabel.commerce.core.domain.model.OrderItem
import com.whitelabel.commerce.core.domain.model.OrderStatus
import com.whitelabel.commerce.core.domain.model.PaymentMethod
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class OrderItemDto(
    @SerialName("id") val id: String,
    @SerialName("order_id") val orderId: String,
    @SerialName("product_id") val productId: String? = null,
    @SerialName("product_name") val productName: String,
    @SerialName("unit_price") val unitPrice: Double,
    @SerialName("quantity") val quantity: Int,
    @SerialName("size") val size: String? = null,
    @SerialName("color") val color: String? = null,
) {
    fun toDomain(): OrderItem = OrderItem(
        id = id,
        orderId = orderId,
        productId = productId,
        productName = productName,
        unitPrice = unitPrice,
        quantity = quantity,
        size = size,
        color = color,
    )
}

@Serializable
data class OrderDto(
    @SerialName("payment_status") val paymentStatus: String = "unpaid",
    @SerialName("tracking_number") val trackingNumber: String? = null,
    @SerialName("shipping_carrier") val carrier: String? = null,
    @SerialName("id") val id: String,
    @SerialName("user_id") val userId: String? = null,
    @SerialName("status") val status: String = "pending",
    @SerialName("shipping_address") val shippingAddress: String,
    @SerialName("phone") val phone: String? = null,
    @SerialName("payment_method") val paymentMethod: String? = null,
    @SerialName("currency") val currency: String,
    @SerialName("subtotal") val subtotal: Double? = null,
    @SerialName("shipping_fee") val shippingFee: Double,
    @SerialName("wallet_discount") val walletDiscount: Double = 0.0,
    @SerialName("cashback_earned") val cashbackEarned: Double = 0.0,
    @SerialName("total") val total: Double? = null,
    @SerialName("guest_tracking") val guestTracking: Boolean = false,
    @SerialName("created_at") val createdAt: String,
    @SerialName("order_items") val orderItems: List<OrderItemDto> = emptyList(),
) {
    fun toDomain(): Order = Order(
        paymentStatus = paymentStatus, trackingNumber = trackingNumber, carrier = carrier,
        id = id,
        userId = userId,
        status = OrderStatus.fromRaw(status),
        shippingAddress = shippingAddress,
        phone = phone,
        paymentMethod = PaymentMethod.fromRaw(paymentMethod),
        currency = currency,
        subtotal = subtotal,
        shippingFee = shippingFee,
        walletDiscount = walletDiscount,
        cashbackEarned = cashbackEarned,
        total = total,
        guestTracking = guestTracking,
        createdAt = createdAt,
        items = orderItems.map { it.toDomain() },
    )
}

/**
 * Minimal guest order insert payload matching Supabase RLS policy `submit_guest_order`
 * (`grant insert (shipping_address) on public.orders to anon`).
 */
@Serializable
data class GuestOrderInsertDto(
    @SerialName("shipping_address") val shippingAddress: String,
)

@Serializable
data class CheckoutLineDto(
    @SerialName("id") val id: String,
    @SerialName("quantity") val quantity: Int,
    @SerialName("size") val size: String? = null,
    @SerialName("color") val color: String? = null,
)

@Serializable
data class CheckoutRpcParamsDto(
    @SerialName("p_store") val store: String,
    @SerialName("p_coupon_code") val coupon: String?,
    @SerialName("p_customer_name") val name: String,
    @SerialName("p_use_wallet") val useWallet: Boolean = false,
    @SerialName("request_key") val requestKey: String,
    @SerialName("address") val address: String,
    @SerialName("customer_phone") val customerPhone: String,
    @SerialName("payment") val payment: String,
    @SerialName("lines") val lines: List<CheckoutLineDto>,
)

@Serializable
data class CheckoutResultDto(
    @SerialName("order_number") val orderNumber: String,
    @SerialName("amount") val amount: Double,
    @SerialName("order_currency") val orderCurrency: String,
) {
    fun toDomain(): CheckoutResult = CheckoutResult(
        orderNumber = orderNumber,
        amount = amount,
        currency = orderCurrency,
    )
}

@Serializable
data class GuestOrderTrackParamsDto(
    @SerialName("p_store") val store: String,
    @SerialName("order_number") val orderNumber: String,
    @SerialName("customer_phone") val customerPhone: String,
)

@Serializable
data class GuestOrderTrackingDto(
    @SerialName("payment_status") val paymentStatus: String = "unpaid",
    @SerialName("tracking_number") val trackingNumber: String? = null,
    @SerialName("shipping_carrier") val carrier: String? = null,
    @SerialName("payment_method") val method: String = "cod",
    @SerialName("id") val id: String,
    @SerialName("status") val status: String,
    @SerialName("created_at") val createdAt: String,
) {
    fun toDomain(): GuestOrderTracking = GuestOrderTracking(
        paymentStatus = paymentStatus, trackingNumber = trackingNumber, carrier = carrier,
        method = method,
        id = id,
        status = OrderStatus.fromRaw(status),
        createdAt = createdAt,
    )
}
