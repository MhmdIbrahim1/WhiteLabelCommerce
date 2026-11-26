package com.whitelabel.commerce.core.data.repository

import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.data.remote.dto.ReviewReplyDto
import com.whitelabel.commerce.core.data.remote.dto.ProductReviewDto
import com.whitelabel.commerce.core.data.remote.dto.ReviewEligibilityDto
import com.whitelabel.commerce.core.data.remote.runSuspendCatching
import com.whitelabel.commerce.core.domain.model.ReviewReply
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
import io.github.jan.supabase.postgrest.query.filter.FilterOperator
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.jsonPrimitive
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

    override fun replyUpdates(productId: String) = flow {
        val channel = supabase.realtime.channel("review-replies-${BuildConfig.STORE_ID}-$productId")
        try {
            val changes = channel.postgresChangeFlow<PostgresAction.Insert>("public") {
                table = "review_replies"
                filter("store_id", FilterOperator.EQ, BuildConfig.STORE_ID)
            }
            channel.subscribe()
            changes.collect { change ->
                val row = change.record
                val id = row.getValue("review_id").jsonPrimitive.content
                emit(id to ReviewReply(row.getValue("role").jsonPrimitive.content,
                    row.getValue("body").jsonPrimitive.content, row.getValue("created_at").jsonPrimitive.content))
            }
        } finally {
            withContext(NonCancellable) { supabase.realtime.removeChannel(channel) }
        }
    }

    override suspend fun followUp(reviewId: String, body: String): Result<ReviewReply> = runSuspendCatching {
        supabase.from("review_replies").insert(buildJsonObject {
            put("store_id", BuildConfig.STORE_ID)
            put("review_id", reviewId)
            put("role", "customer")
            put("body", body.trim())
        }) { select(Columns.raw("role,body,created_at")) }.decodeSingle<ReviewReplyDto>().toDomain()
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
