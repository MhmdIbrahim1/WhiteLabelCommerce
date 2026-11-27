package com.whitelabel.commerce.core.data.remote

import java.net.URL

internal fun tenantCheckoutBase(base: URL, storeSlug: String): String {
    val uri = base.toURI()
    require(uri.scheme in setOf("https", "http") && !uri.host.isNullOrBlank())
    require(uri.port == -1 || uri.port in 1..65535)
    require(uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null)
    require(storeSlug.isEmpty() || storeSlug.matches(Regex("^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")))
    val origin = "${uri.scheme}://${uri.rawAuthority}"
    return if (storeSlug.isEmpty() || uri.host.startsWith("$storeSlug.", ignoreCase = true)) {
        origin
    } else {
        "$origin/s/$storeSlug"
    }
}

internal fun validCheckoutBase(configuredUrl: String, storeSlug: String): String? = runCatching {
    val base = URL(configuredUrl)
    if (base.protocol != "https") null else tenantCheckoutBase(base, storeSlug)
}.getOrNull()
