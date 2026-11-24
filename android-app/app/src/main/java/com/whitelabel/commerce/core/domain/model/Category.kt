package com.whitelabel.commerce.core.domain.model

data class Category(
    val id: String,
    val slug: String,
    val nameEn: String? = null,
    val name: String,
) {
    val displayName: String get() = com.whitelabel.commerce.core.designsystem.localized(name, nameEn?.takeIf { it.isNotBlank() } ?: name)

}
