package com.whitelabel.commerce.core.data.repository

import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.data.remote.dto.ProductReviewDto
import com.whitelabel.commerce.core.data.remote.dto.ReviewEligibilityDto
import com.whitelabel.commerce.core.data.remote.runSuspendCatching
import com.whitelabel.commerce.core.domain.model.ProductReview
import com.whitelabel.commerce.core.domain.model.ReviewEligibility
import com.whitelabel.commerce.core.domain.repository.ReviewRepository
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order as SortOrder
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ReviewRepositoryImpl @Inject constructor(
    private val supabase: SupabaseClient,
) : ReviewRepository {

    override suspend fun getPublishedReviews(productId: String): Result<List<ProductReview>> =
        runSuspendCatching {
            supabase
                .from("product_reviews")
                .select(Columns.raw(REVIEW_COLUMNS)) {
                    filter {
                        eq("store_id", BuildConfig.STORE_ID)
                        eq("product_id", productId)
                        eq("status", "published")
                    }
                    order(column = "created_at", order = SortOrder.DESCENDING)
                    limit(100)
                }
                .decodeList<ProductReviewDto>()
                .map { it.toDomain() }
        }

    override suspend fun checkEligibility(productId: String): Result<ReviewEligibility> =
        runSuspendCatching {
            if (supabase.auth.currentUserOrNull() == null) {
                return@runSuspendCatching ReviewEligibility(eligible = false)
            }
            val dto = supabase.postgrest.rpc(
                function = "can_review_product",
                parameters = buildJsonObject {
                    put("p_store_id", BuildConfig.STORE_ID)
                    put("p_product_id", productId)
                },
            ).decodeAs<ReviewEligibilityDto>()
            dto.toDomain()
        }

    override suspend fun submitReview(
        productId: String,
        rating: Int,
        comment: String,
    ): Result<ProductReview> = runSuspendCatching {
        val dto = supabase.postgrest.rpc(
            function = "submit_product_review",
            parameters = buildJsonObject {
                put("p_store_id", BuildConfig.STORE_ID)
                put("p_product_id", productId)
                put("p_rating", rating.coerceIn(1, 5))
                put("p_comment", comment.trim().take(1500))
            },
        ).decodeAs<ProductReviewDto>()
        dto.toDomain()
    }
}
