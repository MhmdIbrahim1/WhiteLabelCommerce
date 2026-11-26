package com.whitelabel.commerce.core.domain.repository

import com.whitelabel.commerce.core.domain.model.ReviewReply
import com.whitelabel.commerce.core.domain.model.ProductReview
import com.whitelabel.commerce.core.domain.model.ReviewEligibility

interface ReviewRepository {
    fun replyUpdates(productId: String): kotlinx.coroutines.flow.Flow<Pair<String, ReviewReply>>
    suspend fun getPublishedReviews(productId: String): Result<List<ProductReview>>
    suspend fun checkEligibility(productId: String): Result<ReviewEligibility>
    suspend fun followUp(reviewId: String, body: String): Result<ReviewReply>
    suspend fun submitReview(
        productId: String,
        rating: Int,
        comment: String,
    ): Result<ProductReview>
}
