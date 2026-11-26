package com.whitelabel.commerce.core.domain.model

/**
 * Local persistent order receipt stored in DataStore after checkout so guests can view
 * itemized receipts and one-tap refresh live status via `track_guest_order` RPC.
 */
@androidx.compose.runtime.Immutable
data class SavedOrderLine(
    val productId: String,
    val productName: String,
    val productNameEn: String? = null,
    val unitPrice: Double,
    val quantity: Int,
    val size: String? = null,
    val color: String? = null,
    val imageUrl: String? = null,
) {
    val displayName: String get() = com.whitelabel.commerce.core.designsystem.localized(productName, productNameEn?.ifBlank { null } ?: productName)
    val lineTotal: Double
        get() = unitPrice * quantity
}

@androidx.compose.runtime.Immutable
data class SavedOrderReceipt(
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
    val status: OrderStatus = OrderStatus.PENDING,
    val createdAt: String,
    val items: List<SavedOrderLine> = emptyList(),
)
