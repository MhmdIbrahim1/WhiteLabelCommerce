package com.whitelabel.commerce

import com.whitelabel.commerce.core.data.remote.dto.ProductDto
import com.whitelabel.commerce.core.data.remote.dto.ProductReviewDto
import com.whitelabel.commerce.core.data.remote.dto.ReviewEligibilityDto
import com.whitelabel.commerce.core.data.remote.dto.ToggleWishlistResultDto
import com.whitelabel.commerce.core.domain.model.ProductReview
import com.whitelabel.commerce.core.domain.model.ReviewFormatting
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReviewsAndWishlistTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun productDtoDecodesRatingAggregatesAndDefaultsCleanly() {
        val withRatings = """
            {
              "id": "p-1",
              "category_id": "cat-1",
              "name": "تيشيرت بولو",
              "price": 650.0,
              "stock": 12,
              "avg_rating": 4.75,
              "review_count": 4
            }
        """.trimIndent()
        val ratedProduct = json.decodeFromString<ProductDto>(withRatings).toDomain()
        assertEquals(4.75, ratedProduct.avgRating, 0.001)
        assertEquals(4, ratedProduct.reviewCount)
        assertTrue(ratedProduct.hasReviews)
        assertEquals("4.8", ratedProduct.formattedRating)

        val unratedJson = """
            {
              "id": "p-2",
              "category_id": "cat-1",
              "name": "حقيبة جلدية",
              "price": 1200.0,
              "stock": 5
            }
        """.trimIndent()
        val unratedProduct = json.decodeFromString<ProductDto>(unratedJson).toDomain()
        assertEquals(0.0, unratedProduct.avgRating, 0.001)
        assertEquals(0, unratedProduct.reviewCount)
        assertFalse(unratedProduct.hasReviews)
        assertEquals("0.0", unratedProduct.formattedRating)
    }

    @Test
    fun reviewAndEligibilityDtosDeserializeWithMerchantReply() {
        val payload = """
            {
              "eligible": true,
              "order_id": "ord-123",
              "existing_review": {
                "id": "rev-1",
                "store_id": "00000000-0000-0000-0000-000000000001",
                "product_id": "p-1",
                "user_id": "u-1",
                "order_id": "ord-123",
                "author_name": "أحمد منصور",
                "rating": 5,
                "comment": "خامة ممتازة جداً",
                "is_verified_purchase": true,
                "status": "published",
                "admin_reply": "شكراً لتقييمك الرائع!",
                "admin_replied_at": "2026-11-25T00:00:00Z",
                "created_at": "2026-11-24T12:00:00Z"
              }
            }
        """.trimIndent()
        val eligibility = json.decodeFromString<ReviewEligibilityDto>(payload).toDomain()
        assertTrue(eligibility.eligible)
        assertEquals("ord-123", eligibility.orderId)
        val review = eligibility.existingReview
        assertNotNull(review)
        assertEquals(5, review!!.rating)
        assertEquals("أحمد منصور", review.authorName)
        assertTrue(review.isVerifiedPurchase)
        assertEquals("شكراً لتقييمك الرائع!", review.adminReply)

        val standalone = json.decodeFromString<ProductReviewDto>(
            """{"id":"rev-2","product_id":"p-1","author_name":"","rating":9,"comment":"Hi"}""",
        ).toDomain()
        assertEquals(5, standalone.rating)
        assertEquals("Verified Buyer", standalone.authorName)
    }

    @Test
    fun onlyTheSignedInAuthorCanTakeOneTurnAfterTheOpeningReply() {
        val own = ProductReview("r", productId = "p", userId = "author", authorName = "Buyer", rating = 4)
        val review = own.copy(userId = "", adminReply = "Opening")
        assertTrue(review.canFollowUp(own, "author"))
        assertFalse(own.canFollowUp(own, "author"))
        assertFalse(review.canFollowUp(own, null))
        assertFalse(review.canFollowUp(own, "other"))
        assertFalse(review.canFollowUp(own.copy(id = "another"), "author"))
        assertFalse(review.copy(status = "hidden").canFollowUp(own, "author"))
        val thread = json.decodeFromString<ProductReviewDto>(
            """{"id":"r","product_id":"p","admin_reply":"Opening","review_replies":[
                {"role":"merchant","body":"Closing","created_at":"2026-11-25T00:00:00Z"},
                {"role":"customer","body":"Follow-up","created_at":"2026-11-24T00:00:00Z"}]}"""
        ).toDomain()
        assertFalse(thread.canFollowUp(own, "author"))
        assertEquals(listOf("Opening", "Follow-up", "Closing"), thread.thread.map { it.body })
    }

    @Test
    fun followUpLengthCountsUnicodeCharactersAndDatesUseTheSelectedLanguage() {
        val text = "🙂".repeat(500)
        assertTrue(ReviewFormatting.validFollowUp(text))
        assertFalse(ReviewFormatting.validFollowUp(text + "a"))
        assertFalse(ReviewFormatting.validFollowUp("  "))
        val time = "2026-11-25T23:12:00.123456+00:00"
        assertTrue(ReviewFormatting.replyDate(time, java.util.Locale.UK).contains("26 Nov"))
        assertTrue(ReviewFormatting.replyDate(time, java.util.Locale.forLanguageTag("ar-EG")).contains("نوفمبر"))
        assertEquals("", ReviewFormatting.replyDate(null, java.util.Locale.US))
    }

    @Test
    fun toggleWishlistDtoDecodesInWishlistAndCount() {
        val added = json.decodeFromString<ToggleWishlistResultDto>(
            """{"in_wishlist":true,"wishlist_count":3}""",
        )
        assertTrue(added.inWishlist)
        assertEquals(3, added.wishlistCount)

        val removed = json.decodeFromString<ToggleWishlistResultDto>(
            """{"in_wishlist":false,"wishlist_count":2}""",
        )
        assertFalse(removed.inWishlist)
        assertEquals(2, removed.wishlistCount)
    }

    @Test
    fun ratingStatsAndBilingualLabelsFormatAccurately() {
        val reviews = listOf(
            ProductReview(id = "1", productId = "p-1", authorName = "A", rating = 5, status = "published"),
            ProductReview(id = "2", productId = "p-1", authorName = "B", rating = 4, status = "published"),
            ProductReview(id = "3", productId = "p-1", authorName = "C", rating = 1, status = "hidden"),
        )
        val stats = ReviewFormatting.computeStats(reviews)
        assertEquals(2, stats.total)
        assertEquals(4.5, stats.average, 0.001)
        assertEquals("4.5", stats.formattedAverage)
        assertEquals(1, stats.distribution.first { it.stars == 5 }.count)
        assertEquals(0.5f, stats.distribution.first { it.stars == 5 }.fraction, 0.001f)
        assertEquals(1, stats.distribution.first { it.stars == 4 }.count)
        assertEquals(0, stats.distribution.first { it.stars == 1 }.count)

        assertEquals("ممتاز", ReviewFormatting.ratingCaption(5, isRtl = true))
        assertEquals("Excellent", ReviewFormatting.ratingCaption(5, isRtl = false))
        assertEquals("ضعيف", ReviewFormatting.ratingCaption(1, isRtl = true))
        assertEquals("Poor", ReviewFormatting.ratingCaption(1, isRtl = false))
    }
}
