package com.whitelabel.commerce.core.data.remote.dto

import com.whitelabel.commerce.core.domain.model.WalletSummary
import com.whitelabel.commerce.core.domain.model.WalletTransaction
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class WalletTransactionDto(
    @SerialName("id") val id: String = "",
    @SerialName("order_id") val orderId: String? = null,
    @SerialName("type") val type: String = "",
    @SerialName("amount") val amount: Double = 0.0,
    @SerialName("balance_after") val balanceAfter: Double = 0.0,
    @SerialName("note_ar") val noteAr: String = "",
    @SerialName("note_en") val noteEn: String = "",
    @SerialName("created_at") val createdAt: String = "",
) {
    fun toDomain(): WalletTransaction = WalletTransaction(
        id = id,
        orderId = orderId,
        type = type,
        amount = amount,
        balanceAfter = balanceAfter,
        noteAr = noteAr,
        noteEn = noteEn,
        createdAt = createdAt,
    )
}

@Serializable
data class WalletSummaryDto(
    @SerialName("balance") val balance: Double = 0.0,
    @SerialName("currency") val currency: String = "EGP",
    @SerialName("cashback_enabled") val cashbackEnabled: Boolean = true,
    @SerialName("cashback_percentage") val cashbackPercentage: Double = 5.0,
    @SerialName("transactions") val transactions: List<WalletTransactionDto> = emptyList(),
) {
    fun toDomain(): WalletSummary = WalletSummary(
        balance = balance.coerceAtLeast(0.0),
        currency = currency,
        cashbackEnabled = cashbackEnabled,
        cashbackPercentage = cashbackPercentage.coerceIn(0.0, 50.0),
        transactions = transactions.map { it.toDomain() },
    )
}
