package com.whitelabel.commerce.core.domain.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

data class BrandColors(
    val primary: String = "#164E63",
    val secondary: String = "#C2410C",
    val page: String = "#F8FAFC",
    val surface: String = "#FFFFFF",
)

data class BrandPresets(
    val productCard: String = "outlined",
    val hero: String = "slider",
)

/**
 * Unified white-label store configuration matching both `assets/brand-config.json`
 * and the singleton `public.store_settings` table (`id = true`) in Supabase.
 */
data class StoreSettings(
    val hero: HeroConfig = HeroConfig(),
    val heroSectionVisible: Boolean = true,
    val codEnabled: Boolean = true,
    val paymobEnabled: Boolean = false,
    val paymobCardEnabled: Boolean = false,
    val paymobWalletEnabled: Boolean = false,
    val storeName: String = "Store",
    val currency: String = "EGP",
    val locale: String = "ar-EG",
    val colors: BrandColors = BrandColors(),
    val borderRadius: Int = 12,
    val whatsappNumber: String = "",
    val supportEmail: String = "support@example.com",
    val shippingFee: Double = 50.0,
    val cartIncentiveEnabled: Boolean = true,
    val freeShippingThreshold: Double = 1000.0,
    val cashbackEnabled: Boolean = true,
    val cashbackPercentage: Double = 5.0,
    val banners: List<String> = emptyList(),
    val presets: BrandPresets = BrandPresets(),
    val isSyncedFromRemote: Boolean = false,
    val themeTemplate: String = "modern-minimal",
) {
    fun effectiveShippingFee(subtotal: Double): Double =
        if (cartIncentiveEnabled && freeShippingThreshold > 0.0 && subtotal >= freeShippingThreshold) {
            0.0
        } else {
            shippingFee
        }

    fun isFreeShippingUnlocked(subtotal: Double): Boolean =
        cartIncentiveEnabled && freeShippingThreshold > 0.0 && subtotal >= freeShippingThreshold
    /**
     * Master Hero Banner visibility honoring both `ui_config.pages.home.hero_visible`
     * and the `hero_banner` entry inside `ui_config.homeSections`.
     */
    val isHeroVisible: Boolean
        get() = hero.visible && heroSectionVisible

    val paymentMethods: List<PaymentMethod>
        get() = buildList {
            if (codEnabled) add(PaymentMethod.COD)
            if (paymobEnabled && paymobCardEnabled) add(PaymentMethod.CARD)
            if (paymobEnabled && paymobWalletEnabled) add(PaymentMethod.WALLET)
        }

    val isRtl: Boolean
        get() = locale.startsWith("ar", ignoreCase = true) ||
            locale.startsWith("he", ignoreCase = true) ||
            locale.startsWith("fa", ignoreCase = true) ||
            locale.startsWith("ur", ignoreCase = true)
}

@Serializable
data class PromoBannerCampaign(
    val id: String = "",
    val active: Boolean = true,
    @SerialName("badge_ar") val badgeAr: String = "",
    @SerialName("badge_en") val badgeEn: String = "",
    @SerialName("title_ar") val titleAr: String = "",
    @SerialName("title_en") val titleEn: String = "",
    @SerialName("subtitle_ar") val subtitleAr: String = "",
    @SerialName("subtitle_en") val subtitleEn: String = "",
    @SerialName("cta_text_ar") val ctaTextAr: String = "",
    @SerialName("cta_text_en") val ctaTextEn: String = "",
    @SerialName("cta_link") val ctaLink: String = "/products",
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("gradient_start") val gradientStart: String = "#164E63",
    @SerialName("gradient_end") val gradientEnd: String = "#0E7490",
)

@Serializable
data class HeroConfig(
    @SerialName("hero_visible") val visible: Boolean = true,
    @SerialName("hero_badge_visible") val badgeVisible: Boolean = true,
    @SerialName("hero_badge_ar") val badgeAr: String = "",
    @SerialName("hero_badge_en") val badgeEn: String = "",
    @SerialName("hero_title_ar") val titleAr: String = "",
    @SerialName("hero_title_en") val titleEn: String = "",
    @SerialName("hero_subtitle_ar") val subtitleAr: String = "قطع منتقاة بعناية تجمع بين الأناقة الهادئة وجودة التفاصيل اليومية.",
    @SerialName("hero_subtitle_en") val subtitleEn: String = "Curated pieces blending quiet elegance with everyday craftsmanship.",
    @SerialName("hero_cta_visible") val ctaVisible: Boolean = true,
    @SerialName("hero_cta_text_ar") val ctaTextAr: String = "",
    @SerialName("hero_cta_text_en") val ctaTextEn: String = "",
    @SerialName("hero_cta_link") val ctaLink: String = "/products",
    @SerialName("hero_image_url") val imageUrl: String? = null,
    @SerialName("hero_overlay_opacity") val overlayOpacity: Int = 45,
    @SerialName("heroBg") val heroBg: String? = null,
    @SerialName("heroText") val heroText: String? = null,
    @SerialName("bannerSpeedMs") val bannerSpeedMsRaw: Int? = null,
    @SerialName("banner_autoplay_seconds") val bannerAutoplaySeconds: Double? = null,
    @SerialName("promo_banners") val promoBanners: List<PromoBannerCampaign> = emptyList(),
) {
    val bannerSpeedMs: Int
        get() = when {
            bannerSpeedMsRaw != null -> bannerSpeedMsRaw.coerceIn(0, 15000)
            bannerAutoplaySeconds != null -> (bannerAutoplaySeconds * 1000.0).toInt().coerceIn(0, 15000)
            else -> 4500
        }

    val activePromoBanners: List<PromoBannerCampaign>
        get() = promoBanners.filter { it.active }
}
