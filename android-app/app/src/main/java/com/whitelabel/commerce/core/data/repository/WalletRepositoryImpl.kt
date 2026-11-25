package com.whitelabel.commerce.core.data.repository

import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.data.remote.dto.WalletSummaryDto
import com.whitelabel.commerce.core.data.remote.runSuspendCatching
import com.whitelabel.commerce.core.domain.model.WalletSummary
import com.whitelabel.commerce.core.domain.repository.WalletRepository
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WalletRepositoryImpl @Inject constructor(
    private val supabase: SupabaseClient,
) : WalletRepository {

    override suspend fun getMyWalletSummary(): Result<WalletSummary> = runSuspendCatching {
        val userId = supabase.auth.currentUserOrNull()?.id
            ?: return@runSuspendCatching WalletSummary()

        val dto = supabase.postgrest.rpc(
            function = "get_customer_wallet_summary",
            parameters = buildJsonObject {
                put("p_store_id", BuildConfig.STORE_ID)
                put("p_user_id", userId)
            },
        ).decodeAs<WalletSummaryDto>()

        dto.toDomain()
    }
}
