package com.whitelabel.commerce.core.domain.model

data class WalletTransaction(
    val id: String,
    val orderId: String? = null,
    val type: String,
    val amount: Double,
    val balanceAfter: Double,
    val noteAr: String = "",
    val noteEn: String = "",
    val createdAt: String = "",
)

data class WalletSummary(
    val balance: Double = 0.0,
    val currency: String = "EGP",
    val cashbackEnabled: Boolean = true,
    val cashbackPercentage: Double = 5.0,
    val transactions: List<WalletTransaction> = emptyList(),
)
