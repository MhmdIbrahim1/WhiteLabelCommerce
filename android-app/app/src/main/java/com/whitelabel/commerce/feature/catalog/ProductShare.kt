package com.whitelabel.commerce.feature.catalog

import com.whitelabel.commerce.core.data.remote.tenantCheckoutBase
import com.whitelabel.commerce.core.designsystem.formatPrice
import com.whitelabel.commerce.core.domain.model.Product
import java.net.URI
import java.net.URLEncoder

internal fun buildProductShareUrl(baseUrl: String, storeSlug: String, productSlug: String, productId: String): String {
    val product = productSlug.trim().ifEmpty { productId }
    val path = "/products/" + URLEncoder.encode(product, "UTF-8").replace("+", "%20")
    val uri = runCatching { URI(baseUrl.trim()) }.getOrNull()?.takeIf {
        it.scheme in setOf("https", "http") && !it.host.isNullOrBlank() && it.rawUserInfo == null &&
            it.rawQuery == null && it.rawFragment == null && (it.port == -1 || it.port in 1..65535)
    } ?: URI("https://shopstage.live")
    val fallback = tenantCheckoutBase(uri.toURL(), storeSlug)
    val host = uri.host.lowercase()
    val suffix = host.substringAfterLast('.')
    val publicOrigin = uri.scheme.equals("https", ignoreCase = true) && '.' in host &&
        suffix.matches(Regex("[a-z]{2,63}|xn--[a-z0-9-]+")) &&
        suffix !in setOf("local", "localhost", "internal", "invalid") && !host.endsWith(".home.arpa")
    if (!publicOrigin || storeSlug.isEmpty() || host.startsWith("$storeSlug.")) return fallback + path
    val origin = URI("https", null, "$storeSlug.$host", uri.port, null, null, null)
    return "$origin$path"
}

internal fun buildProductShareText(
    product: Product, storeName: String, currency: String, locale: String, shareUrl: String, isRtl: Boolean,
): String {
    val name = if (isRtl) {
        product.name.ifBlank { product.nameEn.orEmpty() }
    } else {
        product.nameEn?.takeIf { it.isNotBlank() } ?: product.name
    }
    val now = System.currentTimeMillis()
    val price = formatPrice(product.effectivePrice(now), currency, locale, arabicLabels = isRtl && locale.startsWith("ar", true))
    val offer = when {
        product.isFlashSaleActive(now) -> if (isRtl) "عرض خاطف" else "Flash Sale"
        product.oldPrice != null && product.oldPrice > product.price -> {
            val discount = product.discountPercent
            if (isRtl) "خصم $discount%" else "$discount% off"
        }
        else -> null
    }
    return buildString {
        append(name).append(" · ").appendLine(storeName)
        append('\u2066').append(price).append('\u2069')
        if (offer != null) append(" · ").append(offer)
        appendLine().append(shareUrl)
    }
}
