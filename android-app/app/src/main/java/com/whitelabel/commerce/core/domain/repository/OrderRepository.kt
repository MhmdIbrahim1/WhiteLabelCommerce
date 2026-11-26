package com.whitelabel.commerce.core.domain.repository

import com.whitelabel.commerce.core.domain.model.CartItem
import com.whitelabel.commerce.core.domain.model.CheckoutResult
import com.whitelabel.commerce.core.domain.model.GuestOrderTracking
import com.whitelabel.commerce.core.domain.model.Order
import com.whitelabel.commerce.core.domain.model.OrderStatus
import com.whitelabel.commerce.core.domain.model.ReturnRefundMethod
import com.whitelabel.commerce.core.domain.model.ReturnRequest
import com.whitelabel.commerce.core.domain.model.ReturnRequestType
import com.whitelabel.commerce.core.domain.model.ReturnSubmissionItem
import com.whitelabel.commerce.core.domain.model.SavedOrderReceipt
import kotlinx.coroutines.flow.Flow
import java.util.UUID

interface OrderRepository {
    /**
     * Local order receipts persisted on-device via DataStore for instant guest order history.
     */
    suspend fun couponDiscount(code: String, subtotal: Double): Result<Double>

    val savedLocalOrders: Flow<List<SavedOrderReceipt>>

    /**
     * Trusted transactional COD checkout via `public.store_checkout` RPC.
     * Prices, stock checks, variant validation, and shipping fee are enforced server-side.
     * Pass a stable [requestKey] across retries to guarantee idempotency.
     */
    suspend fun placeOrder(
        shippingAddress: String,
        customerPhone: String,
        items: List<CartItem>,
        method: com.whitelabel.commerce.core.domain.model.PaymentMethod,
        coupon: String?,
        name: String,
        requestKey: String = UUID.randomUUID().toString(),
        useWallet: Boolean = false,
        delivery: com.whitelabel.commerce.core.domain.model.DeliveryPin = com.whitelabel.commerce.core.domain.model.DeliveryPin("", null, null),
    ): Result<CheckoutResult>

    /**
     * Narrowly-scoped guest order status lookup via `public.track_guest_order` RPC.
     */
    suspend fun trackGuestOrder(
        orderNumber: String,
        customerPhone: String,
    ): Result<GuestOrderTracking?>

    /**
     * Reads orders belonging to the currently signed-in customer (`orders.user_id = auth.uid()`).
     * Returns an empty list for anonymous guests without triggering an unauthorized query.
     */
    suspend fun getMyOrders(): Result<List<Order>>

    suspend fun saveLocalOrderReceipt(receipt: SavedOrderReceipt)

    suspend fun updateLocalOrderStatus(
        orderNumber: String,
        status: OrderStatus,
        createdAt: String? = null,
    )

    /**
     * Marks a local online order receipt as paid (e.g., on verified `/orders?payment=success`
     * redirect or DB `paid` confirmation) and idempotently settles its lines from the cart.
     */
    suspend fun confirmLocalPaymentSuccess(orderNumber: String)

    /**
     * Updates the local saved receipt's payment method when the customer switches methods
     * during Retry Payment (e.g., switching from `paymob_wallet` to `paymob_card`).
     */
    suspend fun updateLocalOrderPaymentMethod(orderNumber: String, method: String)

    /**
     * Switches a failed or pending online order to Cash on Delivery (`payment_method = 'cod'`,
     * `payment_status = 'cod_pending'`, `status = 'confirmed'`) via `public.switch_order_to_cod`,
     * updates the local saved receipt, and clears the cart.
     */
    suspend fun switchOrderToCod(orderNumber: String, phone: String): Result<Unit>

    /**
     * Fetches the latest return/exchange request for the given [orderId] in the active store.
     */
    suspend fun getReturnRequestForOrder(orderId: String): Result<ReturnRequest?>

    /**
     * Batch-fetches the latest return/exchange requests for the signed-in user's orders in the active store.
     */
    suspend fun getMyReturnRequests(): Result<Map<String, ReturnRequest>>

    /**
     * Submits a self-service return or exchange request via `public.submit_return_request` RPC.
     */
    suspend fun submitReturnRequest(
        orderId: String,
        requestType: ReturnRequestType,
        refundMethod: ReturnRefundMethod,
        reason: String,
        customerNotes: String?,
        items: List<ReturnSubmissionItem>,
    ): Result<ReturnRequest>
}
