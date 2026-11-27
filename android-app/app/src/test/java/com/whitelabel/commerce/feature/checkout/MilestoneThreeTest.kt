package com.whitelabel.commerce.feature.checkout

import com.whitelabel.commerce.core.data.remote.PhoneNormalizer
import com.whitelabel.commerce.core.data.repository.*
import com.whitelabel.commerce.core.designsystem.arabicLanguage
import com.whitelabel.commerce.core.designsystem.formatPrice
import com.whitelabel.commerce.feature.account.mapAuthError
import com.whitelabel.commerce.feature.catalog.CatalogUiState
import com.whitelabel.commerce.feature.orders.orderMethodLabel
import org.junit.Assert.*
import org.junit.Test
import java.io.File

class MilestoneThreeTest {
    @Test fun storefrontProjectionsExcludePrivateColumns() {
        assertFalse(PRODUCT_COLUMNS.contains("cost_price"))
        assertFalse(SETTINGS_COLUMNS.contains("pending_owner_email"))
        assertFalse(REVIEW_COLUMNS.split(",").any { it in setOf("order_id", "user_id") })
        assertFalse(listOf(PRODUCT_COLUMNS, SETTINGS_COLUMNS, REVIEW_COLUMNS, CATEGORY_COLUMNS).any { "*" in it })
    }

    @Test fun profileReadRequiresStoreAndUser() {
        val file = File("src/main/java/com/whitelabel/commerce/core/data/repository/AuthRepositoryImpl.kt").readText()
        val read = file.substringAfter("""from("store_customers")""").substringBefore("decodeList")
        assertTrue(read.contains("""eq("store_id", BuildConfig.STORE_ID)"""))
        assertTrue(read.contains("""eq("user_id", userId)"""))
    }

    @Test fun tenantBuildRequiresDistinctPackage() {
        val gradle = File("build.gradle.kts").readText()
        assertTrue(gradle.contains("resolvedAppIdSuffix != null || !resolvedStoreId.equals(NOVA_STORE_ID"))
        assertTrue(gradle.contains("Custom storeId requires appIdSuffix"))
    }

    @Test fun validatesPaymentOriginAndStatus() {
        assertTrue(isPaymobUrl("https://accept.paymobsolutions.com/"))
        assertFalse(isPaymobUrl("https://example.org/"))
        assertFalse(isLocalOrLanHost("192.168.999.1"))
        assertFalse(isPaymentConfirmed("pending"))
        assertTrue(isPaymentConfirmed("paid"))
    }

    @Test fun selectingAllClearsFlashDeals() {
        assertFalse(CatalogUiState(flashDealsOnly = true).selectCategory(null).flashDealsOnly)
    }

    @Test fun acceptsInternationalEgyptianPhone() {
        assertEquals("01012345678", PhoneNormalizer.normalizeForEgyptCheckout("+201012345678"))
    }

    @Test fun localizedWalletCurrencyAndAuthErrors() {
        val previous = arabicLanguage.value
        try {
            arabicLanguage.value = false
            assertEquals("Store Wallet", orderMethodLabel("wallet"))
            assertEquals("12 EGP", formatPrice(12.0, "EGP", "en"))
            assertTrue(mapAuthError("email_not_confirmed").contains("confirm your email"))
            assertTrue(mapAuthError("over_request_rate_limit").contains("Too many attempts"))
            arabicLanguage.value = true
            assertEquals("محفظة المتجر", orderMethodLabel("wallet"))
            assertEquals("12 ج.م", formatPrice(12.0, "EGP", "ar"))
        } finally {
            arabicLanguage.value = previous
        }
    }
}
