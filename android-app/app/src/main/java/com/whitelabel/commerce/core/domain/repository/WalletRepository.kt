package com.whitelabel.commerce.core.domain.repository

import com.whitelabel.commerce.core.domain.model.WalletSummary

interface WalletRepository {
    suspend fun getMyWalletSummary(): Result<WalletSummary>
}
