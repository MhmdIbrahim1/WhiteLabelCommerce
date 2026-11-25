package com.whitelabel.commerce.core.data.remote.dto

import com.whitelabel.commerce.core.domain.model.ReturnRefundMethod
import com.whitelabel.commerce.core.domain.model.ReturnRequest
import com.whitelabel.commerce.core.domain.model.ReturnRequestItem
import com.whitelabel.commerce.core.domain.model.ReturnRequestStatus
import com.whitelabel.commerce.core.domain.model.ReturnRequestType
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ReturnRequestItemDto(
    @SerialName("order_item_id") val orderItemId: String? = null,
    @SerialName("product_id") val productId: String? = null,
    @SerialName("product_name") val productName: String = "",
    @SerialName("quantity") val quantity: Int = 1,
    @SerialName("unit_price") val unitPrice: Double = 0.0,
    @SerialName("line_total") val lineTotal: Double? = null,
    @SerialName("size") val size: String? = null,
    @SerialName("color") val color: String? = null,
) {
    fun toDomain(): ReturnRequestItem = ReturnRequestItem(
        orderItemId = orderItemId,
        productId = productId,
        productName = productName,
        quantity = quantity,
        unitPrice = unitPrice,
        lineTotal = lineTotal ?: (unitPrice * quantity),
        size = size,
        color = color,
    )
}

@Serializable
data class ReturnRequestDto(
    @SerialName("id") val id: String,
    @SerialName("store_id") val storeId: String = "",
    @SerialName("order_id") val orderId: String = "",
    @SerialName("user_id") val userId: String = "",
    @SerialName("request_type") val requestType: String = "return",
    @SerialName("status") val status: String = "pending",
    @SerialName("refund_method") val refundMethod: String = "wallet",
    @SerialName("reason") val reason: String = "",
    @SerialName("customer_notes") val customerNotes: String? = null,
    @SerialName("admin_notes") val adminNotes: String? = null,
    @SerialName("refund_amount") val refundAmount: Double = 0.0,
    @SerialName("items") val items: List<ReturnRequestItemDto> = emptyList(),
    @SerialName("restocked") val restocked: Boolean = false,
    @SerialName("wallet_credited") val walletCredited: Boolean = false,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("updated_at") val updatedAt: String = "",
) {
    fun toDomain(): ReturnRequest = ReturnRequest(
        id = id,
        storeId = storeId,
        orderId = orderId,
        userId = userId,
        requestType = ReturnRequestType.fromRaw(requestType),
        status = ReturnRequestStatus.fromRaw(status),
        refundMethod = ReturnRefundMethod.fromRaw(refundMethod),
        reason = reason,
        customerNotes = customerNotes,
        adminNotes = adminNotes,
        refundAmount = refundAmount,
        items = items.map { it.toDomain() },
        restocked = restocked,
        walletCredited = walletCredited,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )
}

@Serializable
data class SubmitReturnItemParamDto(
    @SerialName("order_item_id") val orderItemId: String,
    @SerialName("quantity") val quantity: Int,
)

@Serializable
data class SubmitReturnParamsDto(
    @SerialName("p_store_id") val storeId: String,
    @SerialName("p_order_id") val orderId: String,
    @SerialName("p_request_type") val requestType: String,
    @SerialName("p_refund_method") val refundMethod: String,
    @SerialName("p_reason") val reason: String,
    @SerialName("p_customer_notes") val customerNotes: String? = null,
    @SerialName("p_items") val items: List<SubmitReturnItemParamDto>,
)
