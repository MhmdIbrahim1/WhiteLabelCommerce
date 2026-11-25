package com.whitelabel.commerce.core.data.local

import com.whitelabel.commerce.core.domain.model.BrandColors
import com.whitelabel.commerce.core.domain.model.BrandPresets
import com.whitelabel.commerce.core.domain.model.StoreSettings
import kotlinx.serialization.Serializable

@Serializable
data class BrandColorsAssetDto(
    val primary: String = "#164E63",
    val secondary: String = "#C2410C",
    val surface: String = "#FFFFFF",
)

@Serializable
data class BrandPresetsAssetDto(
    val productCard: String = "outlined",
    val hero: String = "slider",
)

@Serializable
data class BrandConfigAssetDto(
    val storeName: String = "Store",
    val currency: String = "EGP",
    val locale: String = "ar-EG",
    val colors: BrandColorsAssetDto = BrandColorsAssetDto(),
    val borderRadius: Int = 12,
    val whatsappNumber: String = "",
    val supportEmail: String = "support@example.com",
    val shippingFee: Double = 50.0,
    val presets: BrandPresetsAssetDto = BrandPresetsAssetDto(),
) {
    fun toDomain(): StoreSettings = StoreSettings(
        storeName = storeName,
        currency = currency,
        locale = locale,
        colors = BrandColors(
            primary = colors.primary,
            secondary = colors.secondary,
            surface = colors.surface,
        ),
        borderRadius = borderRadius.coerceAtLeast(0),
        whatsappNumber = whatsappNumber,
        supportEmail = supportEmail,
        shippingFee = shippingFee.coerceAtLeast(0.0),
        banners = emptyList(),
        presets = BrandPresets(
            productCard = presets.productCard,
            hero = presets.hero,
        ),
        isSyncedFromRemote = false,
    )
}
