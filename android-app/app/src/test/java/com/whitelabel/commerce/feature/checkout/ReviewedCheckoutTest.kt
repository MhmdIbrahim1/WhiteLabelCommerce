package com.whitelabel.commerce.feature.checkout

import com.whitelabel.commerce.core.data.local.SavedOrderReceiptEntity
import com.whitelabel.commerce.core.data.remote.dto.CheckoutResultDto
import com.whitelabel.commerce.core.data.remote.validCheckoutBase
import com.whitelabel.commerce.core.designsystem.arabicLanguage
import com.whitelabel.commerce.core.domain.model.CartItem
import com.whitelabel.commerce.core.domain.model.OrderStatus
import com.whitelabel.commerce.core.domain.model.PaymentMethod
import com.whitelabel.commerce.core.domain.model.StoreSettings
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class ReviewedCheckoutTest {
    private val cart = CheckoutUiState(
        form = CheckoutFormState(coupon = "FREE", couponSubtotal = 100.0, discount = 100.0),
        cartItems = listOf(CartItem(productId = "p", productName = "Item", unitPrice = 100.0, quantity = 1, maxStock = 1)),
        subtotal = 100.0,
        storeSettings = StoreSettings(shippingFee = 0.0),
    )

    @Test fun fullCouponChoosesCouponEvenWhenWalletIsSelectedButNoCreditIsUsed() {
        val state = cart.copy(form = cart.form.copy(useStoreWallet = true), signedInEmail = "a@example.test", walletBalance = 200.0)
        assertTrue(state.fullyCoveredByCoupon)
        assertFalse(state.fullyPaidByWallet)
        assertEquals(0.0, state.grandTotal, 0.0)
        assertEquals(PaymentMethod.COUPON, state.paymentMethod)
        assertEquals("coupon", state.paymentMethod.rawValue)
    }

    @Test fun shippingAndWalletDistinguishPartialDiscountFromFullyCoveredOrder() {
        val withShipping = cart.copy(storeSettings = StoreSettings(shippingFee = 9.995))
        assertFalse(withShipping.fullyCoveredByCoupon)
        assertEquals(10.0, withShipping.grandTotal, 0.0)
        assertEquals(PaymentMethod.COD, withShipping.paymentMethod)
        val withCredit = withShipping.copy(form = cart.form.copy(useStoreWallet = true), signedInEmail = "a@example.test", walletBalance = 20.0)
        assertFalse(withCredit.fullyCoveredByCoupon)
        assertTrue(withCredit.fullyPaidByWallet)
        assertEquals(PaymentMethod.STORE_WALLET, withCredit.paymentMethod)
        assertFalse(cart.copy(subtotal = 101.0).fullyCoveredByCoupon)
    }

    @Test fun reviewedRpcDecodesPersistedOrderOnReplay() {
        val result = Json.decodeFromString<CheckoutResultDto>(
            """{"order_number":"saved","amount":0,"order_currency":"EGP","method":"coupon","pay_status":"paid","fulfillment":"confirmed","expires_at":null,"created":false,"guest":true}"""
        ).toDomain()
        assertEquals("saved", result.orderNumber)
        assertEquals("coupon", result.method)
        assertEquals("paid", result.paymentStatus)
        assertEquals(OrderStatus.CONFIRMED, result.fulfillmentStatus)
        assertEquals("EGP", result.currency)
        assertEquals(0.0, result.amount, 0.0)
        assertNull(result.reservationExpiresAt)
        assertFalse(result.created)
        assertTrue(result.guest)
    }

    @Test fun oldReceiptsDecodeAndOnlyUnsettledOnlineOrdersEnterPayment() {
        val receipt = Json.decodeFromString<SavedOrderReceiptEntity>(
            """{"orderNumber":"old","customerName":"buyer","phone":"01000000000","shippingAddress":"Cairo","currency":"EGP","subtotal":100,"shippingFee":0,"total":100,"createdAt":"2026-11-20"}"""
        ).toDomain()
        assertNull(receipt.reservationExpiresAt)
        for (method in listOf("cod", "coupon", "wallet")) assertFalse(receipt.copy(method = method).requiresOnlinePayment)
        val online = receipt.copy(method = "paymob_card", reservationExpiresAt = "2026-11-21T01:00:00Z")
        assertTrue(online.requiresOnlinePayment)
        assertFalse(online.copy(paymentStatus = "paid").requiresOnlinePayment)
        assertFalse(online.copy(total = 0.0).requiresOnlinePayment)
        assertEquals(online, SavedOrderReceiptEntity.fromDomain(online).toDomain())
    }

    @Test fun checkoutBaseIsHttpsAndRoutesToTheSelectedTenant() {
        assertEquals("https://shop.example/s/nova-store", validCheckoutBase("https://shop.example/", "nova-store"))
        assertEquals("https://omar-a7a.shop.example", validCheckoutBase("https://omar-a7a.shop.example/", "omar-a7a"))
        for (url in listOf("", "bad url", "http://shop.example", "https://user@shop.example", "https://shop.example/?q=1")) {
            assertNull(validCheckoutBase(url, "nova-store"))
        }
    }

    @Test fun quoteAndCouponErrorsTellShopperWhatToReviewInBothLanguages() {
        val previous = arabicLanguage.value
        try {
            arabicLanguage.value = false
            assertTrue(mapCheckoutError("checkout_quote_changed").contains("order total changed"))
            assertTrue(mapCheckoutError("coupon_does_not_cover_order").contains("no longer covers"))
            arabicLanguage.value = true
            assertTrue(mapCheckoutError("checkout_quote_changed").contains("تغيّر إجمالي الطلب"))
            assertTrue(mapCheckoutError("coupon_does_not_cover_order").contains("كود الخصم"))
        } finally {
            arabicLanguage.value = previous
        }
    }
}
