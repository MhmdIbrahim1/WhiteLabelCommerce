package com.whitelabel.commerce.core.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class AbandonedCartItemParamDto(
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("name_en") val nameEn: String? = null,
    @SerialName("quantity") val quantity: Int,
    @SerialName("price") val price: Double,
    @SerialName("size") val size: String? = null,
    @SerialName("color") val color: String? = null,
)

@Serializable
data class UpsertAbandonedCartParamsDto(
    @SerialName("p_store_id") val storeId: String,
    @SerialName("p_session_key") val sessionKey: String,
    @SerialName("p_items") val items: List<AbandonedCartItemParamDto>,
    @SerialName("p_subtotal") val subtotal: Double,
    @SerialName("p_currency") val currency: String = "EGP",
    @SerialName("p_source") val source: String = "android",
    @SerialName("p_customer_name") val customerName: String? = null,
    @SerialName("p_customer_email") val customerEmail: String? = null,
    @SerialName("p_customer_phone") val customerPhone: String? = null,
)

@Serializable
data class MarkAbandonedCartRecoveredParamsDto(
    @SerialName("p_store_id") val storeId: String,
    @SerialName("p_session_key") val sessionKey: String? = null,
    @SerialName("p_order_id") val orderId: String? = null,
)

object AbandonedCartSessionKeys {
    fun forAndroidUser(userId: String): String = "android-${userId.trim()}"
}
