package com.whitelabel.commerce.feature.catalog

import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.data.remote.dto.ProductDto
import com.whitelabel.commerce.core.domain.model.Product
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ProductColorGalleryTest {
    private val product = Product(
        id = "shirt", categoryId = "clothing", name = "Oxford", price = 500.0,
        imageUrl = "cover", galleryUrls = listOf("cover", "", "back"),
        colorImages = mapOf("أزرق" to "legacy-blue", "أبيض" to "legacy-white"),
        colorGalleries = mapOf(
            "أزرق" to listOf("", "blue-front", "blue-side", "blue-front", "blue-back"),
            "أبيض" to listOf("  "),
        ),
    )

    @Test fun selectionReturnsOnlyTheMatchingViewsAndUsesTheirHeroForTheCart() {
        assertEquals(listOf("blue-front", "blue-side", "blue-back"), product.galleryFor("أزرق"))
        assertEquals("blue-front", product.imageFor("أزرق"))
    }

    @Test fun emptyOrMissingGalleryFallsBackInOrderWithoutDuplicateOrBlankImages() {
        assertEquals(listOf("legacy-white", "cover", "back"), product.galleryFor("أبيض"))
        assertEquals("legacy-white", product.imageFor("أبيض"))
        assertEquals(listOf("cover", "back"), product.galleryFor("أحمر"))
        assertEquals("cover", product.imageFor(null))
        assertEquals(listOf("cover", "back"), product.galleryFor(null))
        val galleryOnly = product.copy(imageUrl = null, galleryUrls = listOf("", "back"))
        assertEquals("back", galleryOnly.imageFor(null))
        assertNull(galleryOnly.copy(galleryUrls = emptyList()).imageFor(null))
    }

    @Test fun dtoReadsWireFieldAndResolvesEachPathInOrder() {
        val fields = """"id":"shirt","category_id":"clothing","name":"Oxford","price":500"""
        val remote = "https://example.com/angle.webp"
        val dto = Json.decodeFromString<ProductDto>(
            """{$fields,"color_galleries":{"أزرق":[" /shirt/front.webp "," ","$remote"]}}""",
        )
        val base = BuildConfig.SUPABASE_URL.trimEnd('/').takeIf { it.isNotEmpty() }
        val expected = listOfNotNull(base?.let { "$it/storage/v1/object/public/product-images/shirt/front.webp" }, remote)
        assertEquals(mapOf("أزرق" to expected), dto.toDomain().colorGalleries)
        assertEquals(emptyMap<String, List<String>>(), Json.decodeFromString<ProductDto>("{$fields}").toDomain().colorGalleries)
    }
}
