package com.whitelabel.commerce.core.data.remote

import com.whitelabel.commerce.BuildConfig

object SupabaseStorageUrls {
    private const val PRODUCT_IMAGES_BUCKET = "product-images"

    fun resolveProductImageUrl(imagePath: String?): String? {
        val raw = imagePath?.trim().orEmpty()
        if (raw.isEmpty()) return null
        if (raw.startsWith("https://", ignoreCase = true) || raw.startsWith("http://", ignoreCase = true)) {
            return raw
        }
        val baseUrl = BuildConfig.SUPABASE_URL.trimEnd('/')
        if (baseUrl.isEmpty()) return null
        val normalizedPath = raw.trimStart('/')
        return "$baseUrl/storage/v1/object/public/$PRODUCT_IMAGES_BUCKET/$normalizedPath"
    }
}
