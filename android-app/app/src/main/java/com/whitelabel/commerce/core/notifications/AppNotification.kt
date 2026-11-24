package com.whitelabel.commerce.core.notifications

import com.whitelabel.commerce.core.designsystem.arabicLanguage
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

data class AppNotification(
    val id: String,
    val userId: String?,
    val category: String,
    val titleAr: String,
    val titleEn: String,
    val bodyAr: String,
    val bodyEn: String,
    val deepLink: String,
    val isRead: Boolean,
    val createdAt: String,
) {
    val displayTitle: String
        get() = if (arabicLanguage.value) titleAr.ifBlank { titleEn } else titleEn.ifBlank { titleAr }

    val displayBody: String
        get() = if (arabicLanguage.value) bodyAr.ifBlank { bodyEn } else bodyEn.ifBlank { bodyAr }
}

@Serializable
data class NotificationDto(
    val id: String,
    @SerialName("user_id") val userId: String? = null,
    @SerialName("target_role") val targetRole: String = "customer",
    val category: String = "promo_campaign",
    @SerialName("title_ar") val titleAr: String = "",
    @SerialName("title_en") val titleEn: String = "",
    @SerialName("body_ar") val bodyAr: String = "",
    @SerialName("body_en") val bodyEn: String = "",
    @SerialName("deep_link") val deepLink: String = "/",
    @SerialName("is_read") val isRead: Boolean = false,
    @SerialName("created_at") val createdAt: String = "",
) {
    fun toDomain(): AppNotification = AppNotification(
        id = id,
        userId = userId,
        category = category,
        titleAr = titleAr,
        titleEn = titleEn,
        bodyAr = bodyAr,
        bodyEn = bodyEn,
        deepLink = deepLink,
        isRead = isRead,
        createdAt = createdAt,
    )
}
