package com.whitelabel.commerce.core.data.local

import com.whitelabel.commerce.core.domain.model.OrderStatus
import com.whitelabel.commerce.core.domain.model.SavedOrderLine
import com.whitelabel.commerce.core.domain.model.SavedOrderReceipt
import com.whitelabel.commerce.core.domain.model.SupportTicket
import com.whitelabel.commerce.core.domain.model.TicketStatus
import kotlinx.serialization.Serializable

@Serializable
data class SavedOrderLineEntity(
    val productId: String,
    val productName: String,
    val productNameEn: String? = null,
    val unitPrice: Double,
    val quantity: Int,
    val size: String? = null,
    val color: String? = null,
    val imageUrl: String? = null,
) {
    fun toDomain(): SavedOrderLine = SavedOrderLine(
        productId = productId,
        productName = productName,
        productNameEn = productNameEn,
        unitPrice = unitPrice,
        quantity = quantity,
        size = size,
        color = color,
        imageUrl = imageUrl,
    )

    companion object {
        fun fromDomain(line: SavedOrderLine): SavedOrderLineEntity = SavedOrderLineEntity(
            productId = line.productId,
            productName = line.productName,
            productNameEn = line.productNameEn,
            unitPrice = line.unitPrice,
            quantity = line.quantity,
            size = line.size,
            color = line.color,
            imageUrl = line.imageUrl,
        )
    }
}

@Serializable
data class SavedOrderReceiptEntity(
    val paymentStatus: String = "unpaid",
    val trackingNumber: String? = null,
    val carrier: String? = null,
    val method: String = "cod",
    val orderNumber: String,
    val customerName: String,
    val phone: String,
    val shippingAddress: String,
    val currency: String,
    val subtotal: Double,
    val shippingFee: Double,
    val total: Double,
    val status: String = OrderStatus.PENDING.rawValue,
    val createdAt: String,
    val items: List<SavedOrderLineEntity> = emptyList(),
) {
    fun toDomain(): SavedOrderReceipt = SavedOrderReceipt(
        orderNumber = orderNumber,
            method = method, paymentStatus = paymentStatus, trackingNumber = trackingNumber, carrier = carrier,
        customerName = customerName,
        phone = phone,
        shippingAddress = shippingAddress,
        currency = currency,
        subtotal = subtotal,
        shippingFee = shippingFee,
        total = total,
        status = OrderStatus.fromRaw(status),
        createdAt = createdAt,
        items = items.map { it.toDomain() },
    )

    companion object {
        fun fromDomain(receipt: SavedOrderReceipt): SavedOrderReceiptEntity = SavedOrderReceiptEntity(
            orderNumber = receipt.orderNumber,
            method = receipt.method, paymentStatus = receipt.paymentStatus, trackingNumber = receipt.trackingNumber, carrier = receipt.carrier,
            customerName = receipt.customerName,
            phone = receipt.phone,
            shippingAddress = receipt.shippingAddress,
            currency = receipt.currency,
            subtotal = receipt.subtotal,
            shippingFee = receipt.shippingFee,
            total = receipt.total,
            status = receipt.status.rawValue,
            createdAt = receipt.createdAt,
            items = receipt.items.map { SavedOrderLineEntity.fromDomain(it) },
        )
    }
}

@Serializable
data class LocalSupportTicketEntity(
    val id: String,
    val subject: String,
    val message: String,
    val status: String = TicketStatus.OPEN.rawValue,
    val adminReply: String = "",
    val orderId: String? = null,
    val createdAt: String,
) {
    fun toDomain(): SupportTicket = SupportTicket(
        id = id,
        customerId = null,
        subject = subject,
        message = message,
        status = TicketStatus.fromRaw(status),
        adminReply = adminReply,
        orderId = orderId,
        createdAt = createdAt,
    )
}
