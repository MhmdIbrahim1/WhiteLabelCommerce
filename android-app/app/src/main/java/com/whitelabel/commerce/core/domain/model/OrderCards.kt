package com.whitelabel.commerce.core.domain.model

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Immutable
@Serializable
data class OrderCardSummary(
    val id: String, val status: String,
    @SerialName("created_at") val createdAt: String,
    val total: Double?, val currency: String,
    @SerialName("payment_status") val paymentStatus: String,
    @SerialName("item_count") val itemCount: Int,
    val thumbnails: List<String> = emptyList(),
    val userId: String = "",
)
@Immutable
@Serializable
data class AccountCounts(val orders: Int = 0, val addresses: Int = 0, val tickets: Int = 0, val wishlist: Int = 0)

enum class HistoryFilter(val param: String, val ar: String, val en: String) {
    All("all","الكل","All"), Active("active","قيد التنفيذ","Active"),
    Completed("completed","مكتملة","Completed"), Cancelled("cancelled","ملغية","Cancelled");

    fun accepts(status: OrderStatus) = when (this) {
        All -> true
        Active -> status != OrderStatus.DELIVERED && status != OrderStatus.CANCELLED
        Completed -> status == OrderStatus.DELIVERED
        Cancelled -> status == OrderStatus.CANCELLED
    }
}
