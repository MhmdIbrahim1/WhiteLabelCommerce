package com.whitelabel.commerce.core.data.remote.dto

import com.whitelabel.commerce.core.domain.model.Category
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class CategoryDto(
    @SerialName("id") val id: String,
    @SerialName("slug") val slug: String,
    @SerialName("name_en") val nameEn: String? = null,
    @SerialName("name") val name: String,
) {
    fun toDomain(): Category = Category(
        id = id,
        slug = slug,
        name = name, nameEn = nameEn,
    )
}
