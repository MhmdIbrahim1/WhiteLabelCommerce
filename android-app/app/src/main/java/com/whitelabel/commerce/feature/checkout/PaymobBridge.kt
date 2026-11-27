package com.whitelabel.commerce.feature.checkout

import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.data.remote.PhoneNormalizer
import com.whitelabel.commerce.core.data.remote.tenantCheckoutBase
import com.whitelabel.commerce.core.designsystem.localized
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.URL

internal sealed interface PaymobInitiation {
    data class Redirect(val url: String) : PaymobInitiation
    data object PendingWalletPrompt : PaymobInitiation
    data object Processing : PaymobInitiation
    data object Declined : PaymobInitiation
}

internal class OrderIneligibleException : IOException("order_ineligible")

internal fun orderIneligibleMessage() = localized(
    "انتهت صلاحية حجز هذا الطلب أو تغيّرت حالته.",
    "This order's payment reservation has expired or its status changed.",
)

internal fun buildPaymobInitiateUrl(base: URL, storeSlug: String): String =
    tenantCheckoutBase(base, storeSlug) + "/api/payments/paymob/initiate"

internal fun paymobInitiationRequest(
    base: URL, storeSlug: String, orderId: String, method: String, phone: String, wallet: String, accessToken: String?,
): Request {
    require(isAllowedWebStoreBase(base))
    val payload = buildJsonObject {
        put("order_id", orderId)
        put("customer_phone", PhoneNormalizer.normalizeForEgyptCheckout(phone))
        put("method", if (method == "paymob_wallet") "wallet" else "card")
        if (method == "paymob_wallet") put("wallet_phone", PhoneNormalizer.normalizeForEgyptCheckout(wallet))
    }
    return Request.Builder()
        .url(buildPaymobInitiateUrl(base, storeSlug))
        .apply { accessToken?.let { header("Authorization", "Bearer $it") } }
        .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
        .build()
}

internal fun parsePaymobInitiation(code: Int, raw: String): PaymobInitiation {
    if (code !in setOf(200, 202, 409, 422)) throw IOException("HTTP $code")
    val json = Json.parseToJsonElement(raw).jsonObject
    fun field(key: String) = (json[key] as? JsonPrimitive)?.content
    val state = field("state")
    return when {
        code == 200 -> {
            val url = field("redirect_url")?.takeIf(::isPaymobUrl) ?: throw IOException("Invalid payment redirect")
            PaymobInitiation.Redirect(url)
        }
        code == 202 && (state == "pending" || (json["pending_wallet_prompt"] as? JsonPrimitive)?.booleanOrNull == true) ->
            PaymobInitiation.PendingWalletPrompt
        code == 202 && state == "processing" -> PaymobInitiation.Processing
        code == 422 && state == "failed" -> PaymobInitiation.Declined
        code == 409 && (field("code") == "order_ineligible" || field("error") == "order_ineligible") ->
            throw OrderIneligibleException()
        else -> throw IOException("Unexpected payment response (HTTP $code)")
    }
}

internal fun matchesStorefrontOrigin(target: HttpUrl, base: HttpUrl, storeSlug: String): Boolean {
    if (target.username.isNotEmpty() || target.password.isNotEmpty() ||
        target.scheme != base.scheme || target.port != base.port
    ) return false
    val tenantHost = storeSlug.isNotBlank() && !base.host.startsWith("$storeSlug.") && target.host == "$storeSlug.${base.host}"
    if (base.scheme == "https") return target.host == base.host || tenantHost
    if (!BuildConfig.DEBUG) return false
    if (base.host.endsWith(".localhost")) return target.host == base.host
    if (!isLocalOrLanHost(base.host)) return false
    return isLocalOrLanHost(target.host) || (base.host == "localhost" && tenantHost)
}

internal fun extractAppOrdersOutcome(targetUrl: String, baseUrl: String, storeSlug: String, orderId: String): String? {
    val target = targetUrl.toHttpUrlOrNull() ?: return null
    val base = baseUrl.toHttpUrlOrNull() ?: return null
    if (!matchesStorefrontOrigin(target, base, storeSlug)) return null
    val path = target.encodedPath
    if (path != "/orders" && path != "/orders/return" &&
        (storeSlug.isBlank() || (path != "/s/$storeSlug/orders" && path != "/s/$storeSlug/orders/return"))
    ) return null
    val orders = target.queryParameterValues("order")
    if (orders.size > 1 || !orders.firstOrNull().isNullOrEmpty() && orders.first() != orderId) return null
    return target.queryParameterValues("payment").singleOrNull()?.takeIf { it in setOf("success", "failed", "pending") }
}
