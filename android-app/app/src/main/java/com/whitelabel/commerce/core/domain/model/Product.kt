package com.whitelabel.commerce.core.domain.model

import com.whitelabel.commerce.core.designsystem.localized
import kotlin.math.roundToInt

data class ProductSpecification(
    val keyAr: String = "",
    val keyEn: String = "",
    val valueAr: String = "",
    val valueEn: String = "",
) {
    val displayKey: String
        get() = localized(
            arabic = keyAr.ifBlank { keyEn },
            english = keyEn.ifBlank { keyAr },
        )

    val displayValue: String
        get() = localized(
            arabic = valueAr.ifBlank { valueEn },
            english = valueEn.ifBlank { valueAr },
        )

    val isValid: Boolean
        get() = (keyAr.isNotBlank() || keyEn.isNotBlank()) && (valueAr.isNotBlank() || valueEn.isNotBlank())
}

data class Product(
    val id: String,
    val categoryId: String,
    val slug: String = "",
    val nameEn: String? = null,
    val name: String,
    val descriptionEn: String? = null,
    val description: String = "",
    val price: Double,
    val oldPrice: Double? = null,
    val stock: Int = 0,
    val isActive: Boolean = true,
    val sizes: List<String> = emptyList(),
    val colors: List<String> = emptyList(),
    val imagePath: String? = null,
    val imageUrl: String? = null,
    val specifications: List<ProductSpecification> = emptyList(),
    val avgRating: Double = 0.0,
    val reviewCount: Int = 0,
    val matchType: String? = null,
    val createdAt: String? = null,
) {
    val hasReviews: Boolean
        get() = reviewCount > 0

    val formattedRating: String
        get() = ReviewFormatting.formatScore(avgRating)
    val displayDescription: String
        get() = localized(description, descriptionEn?.takeIf { it.isNotBlank() } ?: description)

    val displayName: String
        get() = localized(name, nameEn?.takeIf { it.isNotBlank() } ?: name)

    val isInStock: Boolean
        get() = stock > 0

    val isLowStock: Boolean
        get() = stock in 1..5

    val hasDiscount: Boolean
        get() = oldPrice != null && oldPrice > price

    val discountPercent: Int?
        get() {
            val previous = oldPrice ?: return null
            if (previous <= 0.0 || previous <= price) return null
            return (((previous - price) / previous) * 100.0).roundToInt().coerceIn(1, 99)
        }
}
