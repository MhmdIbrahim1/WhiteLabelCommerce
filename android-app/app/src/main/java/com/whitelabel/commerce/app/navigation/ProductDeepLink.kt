package com.whitelabel.commerce.app.navigation

import java.net.URI
import java.net.URLDecoder

/** Absolute storefront links must belong to this APK's tenant. Relative links are also used by notifications. */
internal fun parseProductDeepLink(link: String, storeSlug: String, rootHost: String): String? {
    val uri = runCatching { URI(link) }.getOrNull() ?: return null
    val path = uri.rawPath ?: return null
    if (!path.startsWith('/')) return null
    val parts = path.removePrefix("/").removeSuffix("/").split('/')
    val scopedPath = storeSlug.isNotBlank() && parts.size == 4 &&
        parts[0] == "s" && parts[1] == storeSlug && parts[2] == "products"
    val directPath = parts.size == 2 && parts[0] in setOf("products", "product")
    if (!scopedPath && !directPath) return null
    if (uri.isAbsolute || uri.rawAuthority != null) {
        if (!uri.scheme.equals("https", true) || uri.rawUserInfo != null || uri.port !in setOf(-1, 80, 443)) return null
        val expectedHost = if (scopedPath || storeSlug.isBlank()) rootHost else "$storeSlug.$rootHost"
        if (!expectedHost.equals(uri.host, true)) return null
    }
    return URLDecoder.decode(parts.last().replace("+", "%2B"), "UTF-8")
        .takeIf { it.isNotBlank() && it != "." && it != ".." && it.none { ch -> ch.isISOControl() || ch == '/' || ch == '\\' } }
}
