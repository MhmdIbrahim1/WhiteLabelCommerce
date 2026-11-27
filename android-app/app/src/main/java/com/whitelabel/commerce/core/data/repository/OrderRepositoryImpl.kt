package com.whitelabel.commerce.core.data.repository

import com.whitelabel.commerce.core.domain.model.OrderCardSummary
import com.whitelabel.commerce.core.domain.model.AccountCounts
import com.whitelabel.commerce.core.designsystem.localized

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.whitelabel.commerce.core.data.local.SavedOrderReceiptEntity
import com.whitelabel.commerce.core.data.remote.PhoneNormalizer
import com.whitelabel.commerce.core.data.remote.validCheckoutBase
import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.data.remote.dto.CheckoutLineDto
import com.whitelabel.commerce.core.data.remote.dto.CheckoutResultDto
import com.whitelabel.commerce.core.data.remote.dto.CheckoutRpcParamsDto
import com.whitelabel.commerce.core.data.remote.dto.GuestOrderInsertDto
import com.whitelabel.commerce.core.data.remote.dto.GuestOrderTrackParamsDto
import com.whitelabel.commerce.core.data.remote.dto.GuestOrderTrackingDto
import com.whitelabel.commerce.core.data.remote.dto.OrderDto
import com.whitelabel.commerce.core.data.remote.dto.OrderCardPaymentDto
import com.whitelabel.commerce.core.data.remote.dto.ReturnRequestDto
import com.whitelabel.commerce.core.data.remote.dto.SubmitReturnItemParamDto
import com.whitelabel.commerce.core.data.remote.dto.SubmitReturnParamsDto
import com.whitelabel.commerce.core.data.remote.runSuspendCatching
import com.whitelabel.commerce.core.domain.model.CartItem
import com.whitelabel.commerce.core.domain.model.CheckoutResult
import com.whitelabel.commerce.core.domain.model.GuestOrderTracking
import com.whitelabel.commerce.core.domain.model.Order
import com.whitelabel.commerce.core.domain.model.OrderStatus
import com.whitelabel.commerce.core.domain.model.PaymentMethod
import com.whitelabel.commerce.core.domain.model.ReturnRefundMethod
import com.whitelabel.commerce.core.domain.model.ReturnRequest
import com.whitelabel.commerce.core.domain.model.ReturnRequestType
import com.whitelabel.commerce.core.domain.model.ReturnSubmissionItem
import com.whitelabel.commerce.core.domain.model.SavedOrderReceipt
import com.whitelabel.commerce.core.domain.model.trackingSummary
import com.whitelabel.commerce.core.domain.repository.OrderRepository
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order as SortOrder
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import com.whitelabel.commerce.core.data.di.PrivatePreferences
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OrderRepositoryImpl @Inject constructor(
    private val supabase: SupabaseClient,
    private val dataStore: DataStore<Preferences>,
    private val json: Json,
    private val cart: CartRepositoryImpl,
) : OrderRepository {

    override val savedLocalOrders: Flow<List<SavedOrderReceipt>> = dataStore.data.map { prefs ->
        decodeSavedOrders(prefs[KEY_SAVED_ORDERS]).map { it.toDomain() }
    }

    override suspend fun couponDiscount(code: String, subtotal: Double): Result<Double> = runSuspendCatching {
        val result = supabase.postgrest.rpc("mobile_coupon", buildJsonObject {
            put("p_store", com.whitelabel.commerce.BuildConfig.STORE_ID)
            put("p_code", code)
            put("p_subtotal", subtotal)
        }).decodeList<JsonObject>().single()
        require(result["valid"]?.jsonPrimitive?.boolean == true)
        result.getValue("discount_amount").jsonPrimitive.double
    }

    override suspend fun placeOrder(
        shippingAddress: String,
        customerPhone: String,
        items: List<CartItem>,
        method: com.whitelabel.commerce.core.domain.model.PaymentMethod,
        coupon: String?,
        name: String,
        expectedTotal: Double,
        requestKey: String,
        useWallet: Boolean,
        delivery: com.whitelabel.commerce.core.domain.model.DeliveryPin,
    ): Result<CheckoutResult> = runSuspendCatching {
        val cleanAddress = shippingAddress.trim()
        require(cleanAddress.length in 3..500) { localized("يرجى إدخال عنوان توصيل صحيح (3 أحرف على الأقل).", "Enter a delivery address of at least three characters.") }

        val normalizedPhone = PhoneNormalizer.normalizeForEgyptCheckout(customerPhone)
        require(PhoneNormalizer.isValid(normalizedPhone)) { localized("يرجى إدخال رقم هاتف صحيح (8 إلى 15 رقماً).", "Enter a valid phone number (8–15 digits).") }

        require(items.isNotEmpty() && items.size <= 100) { localized("السلة فارغة.", "Your cart is empty.") }

        val params = CheckoutRpcParamsDto(
            delivery = delivery,
            store = com.whitelabel.commerce.BuildConfig.STORE_ID,
            requestKey = requestKey,
            address = cleanAddress,
            customerPhone = normalizedPhone,
            payment = method.rawValue,
            coupon = coupon,
            name = name,
            useWallet = useWallet || method == PaymentMethod.STORE_WALLET,
            expectedTotal = expectedTotal,
            checkoutBase = validCheckoutBase(BuildConfig.WEB_STORE_BASE_URL, BuildConfig.STORE_SLUG),
            lines = items.map { line ->
                CheckoutLineDto(
                    id = line.productId,
                    quantity = line.quantity,
                    size = line.selectedSize?.takeIf { it.isNotBlank() },
                    color = line.selectedColor?.takeIf { it.isNotBlank() },
                )
            },
        )

        val result = supabase.postgrest
            .rpc(
                function = "checkout_reviewed",
                parameters = json.encodeToJsonElement(params).jsonObject,
            )
            .decodeList<CheckoutResultDto>()
            .firstOrNull()
            ?: error(localized("لم يتم استلام تأكيد الطلب من الخادم.", "The server did not confirm the order."))

        result.toDomain()
    }

    override suspend fun trackGuestOrder(
        orderNumber: String,
        customerPhone: String,
    ): Result<GuestOrderTracking?> = runSuspendCatching {
        val cleanOrderId = orderNumber.trim()
        require(cleanOrderId.isNotEmpty()) { localized("يرجى إدخال رقم الطلب.", "Enter your order number.") }

        val canonicalPhone = PhoneNormalizer.normalizeForEgyptCheckout(customerPhone)
        val fallbackPhone = PhoneNormalizer.normalize(customerPhone)
        require(PhoneNormalizer.isValid(canonicalPhone)) { localized("يرجى إدخال رقم الهاتف المستخدم أثناء الطلب.", "Enter the phone used for this order.") }

        val tracked = runGuestTrackRpc(cleanOrderId, canonicalPhone)
            ?: if (fallbackPhone != canonicalPhone && PhoneNormalizer.isValid(fallbackPhone)) {
                runGuestTrackRpc(cleanOrderId, fallbackPhone)
            } else {
                null
            }

        if (tracked != null) syncReceipt(tracked)
        tracked
    }

    private suspend fun syncReceipt(tracking: GuestOrderTracking, fromAccount: Boolean = false) {
        cart.editWithSettlement { prefs ->
            val current = decodeSavedOrders(prefs[KEY_SAVED_ORDERS])
            val old = current.find { it.orderNumber == tracking.id } ?: return@editWithSettlement null
            val next = old.copy(
                status = tracking.status.rawValue, paymentStatus = tracking.paymentStatus, method = tracking.method,
                carrier = tracking.carrier, trackingNumber = tracking.trackingNumber, createdAt = tracking.createdAt,
                reservationExpiresAt = if (fromAccount) tracking.reservationExpiresAt else old.reservationExpiresAt,
                paymentReview = if (fromAccount) tracking.paymentReview else old.paymentReview,
            )
            if (next != old) prefs[KEY_SAVED_ORDERS] = encodeSavedOrders(current.map { if (it.orderNumber == tracking.id) next else it })
            val confirmedConversion = old.method in setOf("paymob_card", "paymob_wallet") && tracking.method == "cod"
            next.toDomain().takeIf { tracking.paymentStatus == "paid" || confirmedConversion }
        }
    }

    private suspend fun runGuestTrackRpc(orderId: String, phone: String): GuestOrderTracking? {
        val params = GuestOrderTrackParamsDto(
            store = com.whitelabel.commerce.BuildConfig.STORE_ID,
            orderNumber = orderId,
            customerPhone = phone,
        )
        return supabase.postgrest
            .rpc(
                function = "mobile_track",
                parameters = json.encodeToJsonElement(params).jsonObject,
            )
            .decodeList<GuestOrderTrackingDto>()
            .firstOrNull()
            ?.toDomain()
    }

    override suspend fun getMyOrders(filter: String, after: OrderCardSummary?): Result<List<OrderCardSummary>> = runSuspendCatching {
        val owner = supabase.auth.currentUserOrNull()?.id ?: return@runSuspendCatching emptyList()
        val cards = supabase.postgrest.rpc("my_order_cards", buildJsonObject {
            put("p_store_id", com.whitelabel.commerce.BuildConfig.STORE_ID)
            put("p_filter", filter)
            put("p_limit", 13)
            if (after != null) { put("p_before", after.createdAt); put("p_before_id", after.id) }
        }).decodeList<OrderCardSummary>()
        if (cards.isEmpty()) return@runSuspendCatching emptyList()
        // my_order_cards provides paginated items and thumbnails but omits payment method and review.
        val payments = supabase.from("orders").select(Columns.list("id", "status", "payment_method", "payment_status", "payment_review")) {
            filter {
                eq("store_id", BuildConfig.STORE_ID)
                eq("user_id", owner)
                isIn("id", cards.map { it.id })
            }
        }.decodeList<OrderCardPaymentDto>().associateBy { it.id }
        cards.map { card ->
            val payment = payments[card.id]
            card.copy(
                userId = owner, status = payment?.status ?: card.status, paymentMethod = payment?.method,
                paymentStatus = payment?.paymentStatus ?: card.paymentStatus, paymentReview = payment?.paymentReview,
            )
        }
    }

    override suspend fun getAccountCounts(): Result<AccountCounts> = runSuspendCatching {
        supabase.postgrest.rpc("my_account_counts", buildJsonObject {
            put("p_store_id", com.whitelabel.commerce.BuildConfig.STORE_ID)
        }).decodeAs<AccountCounts>()
    }

    override suspend fun getOrderDetail(id: String): Result<Order?> = runSuspendCatching {
        val userId = supabase.auth.currentUserOrNull()?.id ?: return@runSuspendCatching null

        supabase
            .from("orders")
            .select(columns = Columns.raw(
                "id,user_id,status,shipping_address,phone,payment_method,currency,subtotal,shipping_fee," +
                    "wallet_discount,cashback_earned,total,guest_tracking,created_at,payment_status," +
                    "discount_amount,reservation_expires_at,payment_review," +
                    "tracking_number,shipping_carrier,lat,lng,order_items(id,order_id,product_id,product_name,unit_price,quantity,size,color)",
            )) {
                filter { eq("id", id); eq("user_id", userId)
                    eq("store_id", com.whitelabel.commerce.BuildConfig.STORE_ID) }
                limit(1)
            }
            .decodeList<OrderDto>()
            .singleOrNull()?.toDomainOrNull()?.also { syncReceipt(it.trackingSummary(), fromAccount = true) }
    }

    override suspend fun saveLocalOrderReceipt(receipt: SavedOrderReceipt) {
        cart.editWithSettlement { prefs ->
            val current = decodeSavedOrders(prefs[KEY_SAVED_ORDERS]).toMutableList()
            current.removeAll { it.orderNumber == receipt.orderNumber }
            current.add(0, SavedOrderReceiptEntity.fromDomain(receipt))
            val trimmed = current.take(MAX_LOCAL_ORDERS)
            prefs[KEY_SAVED_ORDERS] = encodeSavedOrders(trimmed)
            receipt.takeUnless { it.requiresOnlinePayment }
        }
    }

    override suspend fun updateLocalOrderStatus(
        orderNumber: String,
        status: OrderStatus,
        createdAt: String?,
    ) {
        dataStore.edit { prefs ->
            val current = decodeSavedOrders(prefs[KEY_SAVED_ORDERS]).toMutableList()
            val idx = current.indexOfFirst { it.orderNumber.equals(orderNumber, ignoreCase = true) }
            if (idx >= 0) {
                val existing = current[idx]
                current[idx] = existing.copy(
                    status = status.rawValue,
                    createdAt = createdAt ?: existing.createdAt,
                )
                prefs[KEY_SAVED_ORDERS] = encodeSavedOrders(current)
            }
        }
    }

    override suspend fun confirmLocalPaymentSuccess(orderNumber: String) {
        cart.editWithSettlement { prefs ->
            val current = decodeSavedOrders(prefs[KEY_SAVED_ORDERS]).toMutableList()
            val idx = current.indexOfFirst { it.orderNumber.equals(orderNumber, ignoreCase = true) }
            if (idx < 0) return@editWithSettlement null
            val updated = current[idx].copy(paymentStatus = "paid")
            current[idx] = updated
            prefs[KEY_SAVED_ORDERS] = encodeSavedOrders(current)
            updated.toDomain()
        }
    }

    override suspend fun updateLocalOrderPaymentMethod(orderNumber: String, method: String) {
        dataStore.edit { prefs ->
            val current = decodeSavedOrders(prefs[KEY_SAVED_ORDERS]).toMutableList()
            val idx = current.indexOfFirst { it.orderNumber.equals(orderNumber, ignoreCase = true) }
            if (idx >= 0) {
                current[idx] = current[idx].copy(method = method, paymentStatus = "pending")
                prefs[KEY_SAVED_ORDERS] = encodeSavedOrders(current)
            }
        }
    }

    override suspend fun switchOrderToCod(orderNumber: String, phone: String): Result<Unit> = runSuspendCatching {
        val cleanPhone = PhoneNormalizer.normalize(phone)
        supabase.postgrest.rpc(
            function = "switch_order_to_cod",
            parameters = buildJsonObject {
                put("p_store", com.whitelabel.commerce.BuildConfig.STORE_ID)
                put("p_order_id", orderNumber.trim())
                put("p_phone", cleanPhone)
            },
        )
        cart.editWithSettlement { prefs ->
            val current = decodeSavedOrders(prefs[KEY_SAVED_ORDERS]).toMutableList()
            val idx = current.indexOfFirst { it.orderNumber.equals(orderNumber, ignoreCase = true) }
            if (idx < 0) return@editWithSettlement null
            val updated = current[idx].copy(
                method = "cod",
                paymentStatus = "cod_pending",
                reservationExpiresAt = null,
                status = OrderStatus.CONFIRMED.rawValue,
            )
            current[idx] = updated
            prefs[KEY_SAVED_ORDERS] = encodeSavedOrders(current)
            updated.toDomain()
        }
    }

    override suspend fun getReturnRequestForOrder(orderId: String): Result<ReturnRequest?> = runSuspendCatching {
        val userId = supabase.auth.currentUserOrNull()?.id ?: return@runSuspendCatching null
        val rows = supabase
            .from("return_requests")
            .select() {
                filter {
                    eq("order_id", orderId.trim())
                    eq("store_id", com.whitelabel.commerce.BuildConfig.STORE_ID)
                    eq("user_id", userId)
                }
                order(column = "created_at", order = SortOrder.DESCENDING)
                limit(1)
            }
            .decodeList<ReturnRequestDto>()
        rows.firstOrNull()?.toDomain()
    }

    override suspend fun getMyReturnRequests(): Result<Map<String, ReturnRequest>> = runSuspendCatching {
        val userId = supabase.auth.currentUserOrNull()?.id ?: return@runSuspendCatching emptyMap()
        val rows = supabase
            .from("return_requests")
            .select() {
                filter {
                    eq("store_id", com.whitelabel.commerce.BuildConfig.STORE_ID)
                    eq("user_id", userId)
                }
                order(column = "created_at", order = SortOrder.DESCENDING)
                limit(100)
            }
            .decodeList<ReturnRequestDto>()
        val result = linkedMapOf<String, ReturnRequest>()
        for (dto in rows) {
            val domain = dto.toDomain()
            if (domain.orderId !in result) {
                result[domain.orderId] = domain
            }
        }
        result
    }

    override suspend fun submitReturnRequest(
        orderId: String,
        requestType: ReturnRequestType,
        refundMethod: ReturnRefundMethod,
        reason: String,
        customerNotes: String?,
        items: List<ReturnSubmissionItem>,
    ): Result<ReturnRequest> = runSuspendCatching {
        require(items.isNotEmpty()) {
            localized("يرجى اختيار منتج واحد على الأقل.", "Please select at least one item.")
        }
        val cleanReason = reason.trim()
        require(cleanReason.length >= 2) {
            localized("يرجى اختيار سبب الطلب.", "Please select a reason.")
        }
        val params = SubmitReturnParamsDto(
            storeId = com.whitelabel.commerce.BuildConfig.STORE_ID,
            orderId = orderId.trim(),
            requestType = requestType.rawValue,
            refundMethod = refundMethod.rawValue,
            reason = cleanReason,
            customerNotes = customerNotes?.trim()?.takeIf { it.isNotEmpty() },
            items = items.map { SubmitReturnItemParamDto(orderItemId = it.orderItemId, quantity = it.quantity) },
        )
        supabase.postgrest
            .rpc(
                function = "submit_return_request",
                parameters = json.encodeToJsonElement(params).jsonObject,
            )
            .decodeAs<ReturnRequestDto>()
            .toDomain()
    }

    private suspend fun encodeSavedOrders(rows: List<SavedOrderReceiptEntity>): String =
        PrivatePreferences.encrypt(KEY_SAVED_ORDERS.name, json.encodeToString(rows))

    private suspend fun decodeSavedOrders(raw: String?): List<SavedOrderReceiptEntity> {
        if (raw.isNullOrBlank()) return emptyList()
        return runSuspendCatching {
            json.decodeFromString<List<SavedOrderReceiptEntity>>(PrivatePreferences.decrypt(KEY_SAVED_ORDERS.name, raw))
        }.getOrDefault(emptyList())
    }

    private companion object {
        val KEY_SAVED_ORDERS = stringPreferencesKey("${com.whitelabel.commerce.BuildConfig.STORE_ID}_saved_local_orders_json")
        const val MAX_LOCAL_ORDERS = 30
    }
}
