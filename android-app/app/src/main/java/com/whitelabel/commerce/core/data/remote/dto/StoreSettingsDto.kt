package com.whitelabel.commerce.core.data.remote.dto

import com.whitelabel.commerce.core.data.remote.SupabaseStorageUrls
import com.whitelabel.commerce.core.domain.model.BrandColors
import com.whitelabel.commerce.core.domain.model.BrandPresets
import com.whitelabel.commerce.core.domain.model.HeroConfig
import com.whitelabel.commerce.core.domain.model.StoreSettings
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class PublishedHomeSection(
    val type: String = "",
    val visible: Boolean = true,
)

@Serializable
data class PublishedUi(
    val pages: PublishedPages = PublishedPages(),
    val global: PublishedGlobal = PublishedGlobal(),
    val defaultLanguage: String? = null,
    val homeSections: List<PublishedHomeSection> = emptyList(),
)

@Serializable
data class PublishedPages(
    val home: HeroConfig = HeroConfig(),
)

@Serializable
data class PublishedGlobal(
    val primaryButtonBg: String? = null,
    val accentBadge: String? = null,
    val pageBg: String? = null,
    val cardSurface: String? = null,
    val borderRadius: Int? = null,
)

@Serializable
data class StoreSettingsDto(
    @SerialName("default_max_order_qty") val defaultMaxOrderQty: Int? = 10,
    @SerialName("ui_config") val uiConfig: PublishedUi? = null,
    @SerialName("cod_enabled") val codEnabled: Boolean = true,
    @SerialName("paymob_enabled") val paymobEnabled: Boolean = false,
    @SerialName("paymob_card_enabled") val paymobCardEnabled: Boolean = false,
    @SerialName("paymob_wallet_enabled") val paymobWalletEnabled: Boolean = false,
    @SerialName("id") val id: Boolean = true,
    @SerialName("store_name") val storeName: String,
    @SerialName("currency") val currency: String,
    @SerialName("locale") val locale: String,
    @SerialName("primary_color") val primaryColor: String,
    @SerialName("secondary_color") val secondaryColor: String,
    @SerialName("surface_color") val surfaceColor: String,
    @SerialName("border_radius") val borderRadius: Int,
    @SerialName("whatsapp_number") val whatsappNumber: String = "",
    @SerialName("support_email") val supportEmail: String = "",
    @SerialName("shipping_fee") val shippingFee: Double = 0.0,
    @SerialName("cart_incentive_enabled") val cartIncentiveEnabled: Boolean = true,
    @SerialName("free_shipping_threshold") val freeShippingThreshold: Double = 1000.0,
    @SerialName("cashback_enabled") val cashbackEnabled: Boolean = true,
    @SerialName("cashback_percentage") val cashbackPercentage: Double = 5.0,
    @SerialName("theme_template") val themeTemplate: String = "modern-minimal",
    @SerialName("banners") val banners: List<String> = emptyList(),
) {
    fun toDomain(presetsFallback: BrandPresets): StoreSettings {
        val rawHero = uiConfig?.pages?.home ?: HeroConfig()
        val resolvedHero = rawHero.copy(
            imageUrl = SupabaseStorageUrls.resolveProductImageUrl(rawHero.imageUrl),
            overlayOpacity = rawHero.overlayOpacity.coerceIn(0, 80),
            promoBanners = rawHero.promoBanners.map { campaign ->
                campaign.copy(
                    imageUrl = SupabaseStorageUrls.resolveProductImageUrl(campaign.imageUrl),
                )
            },
        )
        val heroSectionEntry = uiConfig?.homeSections?.firstOrNull { it.type == "hero_banner" }

        return StoreSettings(
            defaultMaxOrderQty = defaultMaxOrderQty,
            storeName = storeName,
            currency = currency,
            locale = uiConfig?.defaultLanguage?.takeIf { it in setOf("ar", "en") } ?: locale,
            hero = resolvedHero,
            heroSectionVisible = heroSectionEntry?.visible ?: true,
            codEnabled = codEnabled,
            paymobEnabled = paymobEnabled,
            paymobCardEnabled = paymobCardEnabled,
            paymobWalletEnabled = paymobWalletEnabled,
            colors = BrandColors(
                primary = uiConfig?.global?.primaryButtonBg ?: primaryColor,
                secondary = uiConfig?.global?.accentBadge ?: secondaryColor,
                page = uiConfig?.global?.pageBg ?: "#F8FAFC",
                surface = uiConfig?.global?.cardSurface ?: surfaceColor,
            ),
            themeTemplate = themeTemplate,
            borderRadius = (uiConfig?.global?.borderRadius ?: borderRadius).coerceIn(0, 24),
            whatsappNumber = whatsappNumber,
            supportEmail = supportEmail,
            shippingFee = shippingFee.coerceAtLeast(0.0),
            cartIncentiveEnabled = cartIncentiveEnabled,
            freeShippingThreshold = freeShippingThreshold.coerceAtLeast(0.0),
            cashbackEnabled = cashbackEnabled,
            cashbackPercentage = cashbackPercentage.coerceIn(0.0, 50.0),
            banners = banners.mapNotNull { SupabaseStorageUrls.resolveProductImageUrl(it) },
            presets = presetsFallback,
            isSyncedFromRemote = true,
        )
    }
}
