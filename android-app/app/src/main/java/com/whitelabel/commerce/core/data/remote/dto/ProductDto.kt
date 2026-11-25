package com.whitelabel.commerce.core.data.remote.dto

import com.whitelabel.commerce.core.data.remote.SupabaseStorageUrls
import com.whitelabel.commerce.core.domain.model.Product
import com.whitelabel.commerce.core.domain.model.ProductSpecification
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ProductSpecificationDto(
    @SerialName("key_ar") val keyAr: String = "",
    @SerialName("key_en") val keyEn: String = "",
    @SerialName("value_ar") val valueAr: String = "",
    @SerialName("value_en") val valueEn: String = "",
) {
    fun toDomain(): ProductSpecification = ProductSpecification(
        keyAr = keyAr.trim(),
        keyEn = keyEn.trim(),
        valueAr = valueAr.trim(),
        valueEn = valueEn.trim(),
    )
}

@Serializable
data class ProductDto(
    @SerialName("id") val id: String,
    @SerialName("category_id") val categoryId: String,
    @SerialName("slug") val slug: String = "",
    @SerialName("name_en") val nameEn: String? = null,
    @SerialName("name") val name: String,
    @SerialName("description_en") val descriptionEn: String? = null,
    @SerialName("description") val description: String = "",
    @SerialName("price") val price: Double,
    @SerialName("old_price") val oldPrice: Double? = null,
    @SerialName("flash_sale_price") val flashSalePrice: Double? = null,
    @SerialName("flash_sale_starts_at") val flashSaleStartsAt: String? = null,
    @SerialName("flash_sale_ends_at") val flashSaleEndsAt: String? = null,
    @SerialName("stock") val stock: Int = 0,
    @SerialName("is_active") val isActive: Boolean = true,
    @SerialName("sizes") val sizes: List<String> = emptyList(),
    @SerialName("colors") val colors: List<String> = emptyList(),
    @SerialName("image_path") val imagePath: String? = null,
    @SerialName("specifications") val specifications: List<ProductSpecificationDto> = emptyList(),
    @SerialName("avg_rating") val avgRating: Double = 0.0,
    @SerialName("review_count") val reviewCount: Int = 0,
    @SerialName("match_type") val matchType: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
) {
    fun toDomain(): Product = Product(
        id = id,
        categoryId = categoryId,
        slug = slug,
        name = name,
        nameEn = nameEn,
        description = description,
        descriptionEn = descriptionEn,
        price = price,
        oldPrice = oldPrice,
        flashSalePrice = flashSalePrice,
        flashSaleStartsAt = flashSaleStartsAt,
        flashSaleEndsAt = flashSaleEndsAt,
        stock = stock,
        isActive = isActive,
        sizes = sizes,
        colors = colors,
        imagePath = imagePath,
        imageUrl = SupabaseStorageUrls.resolveProductImageUrl(imagePath),
        specifications = specifications.map { it.toDomain() }.filter { it.isValid },
        avgRating = avgRating,
        reviewCount = reviewCount,
        matchType = matchType,
        createdAt = createdAt,
    )
}
