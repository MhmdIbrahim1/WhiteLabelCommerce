package com.whitelabel.commerce

import com.whitelabel.commerce.app.navigation.parseProductDeepLink
import com.whitelabel.commerce.core.domain.model.FlashSalePricing
import com.whitelabel.commerce.core.domain.model.Product
import com.whitelabel.commerce.feature.catalog.buildProductShareText
import com.whitelabel.commerce.feature.catalog.buildProductShareUrl
import org.junit.Assert.*
import org.junit.Test

class ProductShareTest {
    private val root = "shopstage.live"
    private val id = "e85d35fc-ddbb-4eed-8030-7cbd4501d415"
    private val product = Product(id, "category", name = "قميص", nameEn = "Shirt", price = 100.0)

    @Test fun storefrontAndTenantHostsRoundTripEncodedProductNames() {
        for (tenant in listOf("nova-store", "omar-a7a")) {
            val slug = "قميص + summer"
            val link = buildProductShareUrl("https://$root", tenant, slug, id)
            assertTrue(link.startsWith("https://$tenant.$root/products/%"))
            assertTrue(link.endsWith("%20%2B%20summer"))
            assertEquals(link, buildProductShareUrl("https://$tenant.$root/", tenant, slug, id))
            assertEquals(slug, parseProductDeepLink(link, tenant, root))
            val explicitPort = buildProductShareUrl("https://$root:80", tenant, slug, id)
            assertEquals(slug, parseProductDeepLink(explicitPort, tenant, root))
        }
    }

    @Test fun fallsBackToIdAndTenantCheckoutPathForDevelopment() {
        assertEquals("http://10.0.2.2:3000/s/nova-store/products/$id",
            buildProductShareUrl("http://10.0.2.2:3000", "nova-store", "  ", id))
        assertEquals("https://$root/products/$id", buildProductShareUrl("https://$root", "", "", id))
        assertEquals("https://nova-store.$root/products/$id",
            buildProductShareUrl("https://$root/s/nova-store", "nova-store", "", id))
        assertEquals("https://nova-store.$root/products/$id", buildProductShareUrl("", "nova-store", "", id))
    }

    @Test fun productParserAcceptsAliasSlugUuidAndTenantPath() {
        assertEquals("summer-shirt", parseProductDeepLink("/products/summer-shirt?ref=email", "nova-store", root))
        assertEquals(id, parseProductDeepLink("/product/$id", "nova-store", root))
        assertEquals(id, parseProductDeepLink("/products/$id", "nova-store", root))
        assertEquals("a+b", parseProductDeepLink("https://$root/s/omar-a7a/products/a+b#details", "omar-a7a", root))
    }

    @Test fun productParserRejectsDifferentTenantHostAndMalformedPaths() {
        for (input in listOf(
            "https://omar-a7a.$root/products/shared", "https://$root/s/omar-a7a/products/shared",
            "//nova-store.$root/products/shared", "http://nova-store.$root/products/shared",
            "https://nova-store.$root.example/products/shared", "/products/", "/products/%2Fother",
            "/products/%2e%2e", "/products/a/b", "/products/%zz", "/s/nova-store/products",
        )) assertNull(input, parseProductDeepLink(input, "nova-store", root))
    }

    @Test fun regularDiscountAndActiveFlashAreLocalizedAndEndWithLink() {
        val link = "https://nova-store.$root/products/shirt"
        for (rtl in listOf(true, false)) {
            fun message(p: Product) = buildProductShareText(p, "Nova", "EGP", if (rtl) "ar-EG" else "en-US", link, rtl)
            val regular = message(product)
            assertTrue(regular.contains(if (rtl) "قميص · Nova" else "Shirt · Nova"))
            assertTrue(regular.contains(if (rtl) "100 ج.م" else "100 EGP"))
            val discount = message(product.copy(oldPrice = 200.0))
            assertTrue(discount.contains(if (rtl) "خصم 50%" else "50% off"))
            val flash = message(product.copy(flashSalePrice = 60.0, flashSaleEndsAt = "2099-12-01T00:00:00Z"))
            assertTrue(flash.contains(if (rtl) "عرض خاطف" else "Flash Sale"))
            assertTrue(flash.contains(if (rtl) "60 ج.م" else "60 EGP"))
            for (text in listOf(regular, discount, flash)) assertEquals(link, text.lines().last())
            assertEquals(regular, message(product.copy(flashSalePrice = 60.0, flashSaleEndsAt = "2001-01-01T00:00:00Z")))
        }
    }

    @Test fun shareFollowsTheDetailPriceAndOfferAtBothFlashBoundaries() {
        val start = "2026-11-28T12:00:00Z"
        val end = "2026-11-28T13:00:00Z"
        val opens = FlashSalePricing.parseIsoTimestampMillis(start)!!
        val expires = FlashSalePricing.parseIsoTimestampMillis(end)!!
        val promoted = product.copy(oldPrice = 250.0, flashSalePrice = product.price,
            flashSaleStartsAt = start, flashSaleEndsAt = end)
        for (rtl in listOf(false, true)) {
            fun offer(p: Product, now: Long) = buildProductShareText(
                p, "Nova", "EGP", if (rtl) "ar-EG" else "en-US", "/products/shirt", rtl, now,
            ).lines()[1]
            val regular = offer(promoted, opens - 1)
            assertTrue(regular.contains(if (rtl) "خصم 60%" else "60% off"))
            assertEquals(regular, offer(promoted, expires))
            val active = offer(promoted, opens)
            assertTrue(active.contains(if (rtl) "عرض خاطف -60%" else "Flash Sale -60%"))
            assertTrue(active.contains(if (rtl) "100 ج.م" else "100 EGP"))
            val deeper = offer(promoted.copy(flashSalePrice = 75.0), expires - 1)
            assertTrue(deeper.contains(if (rtl) "عرض خاطف -25%" else "Flash Sale -25%"))
            assertTrue(deeper.contains(if (rtl) "75 ج.م" else "75 EGP"))
        }
    }
}
