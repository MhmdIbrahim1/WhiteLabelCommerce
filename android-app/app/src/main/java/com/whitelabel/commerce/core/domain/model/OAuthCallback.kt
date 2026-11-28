package com.whitelabel.commerce.core.domain.model

import com.whitelabel.commerce.BuildConfig
import java.net.URI
import java.net.URLDecoder

internal val oauthRedirectUri = "${BuildConfig.OAUTH_CALLBACK_SCHEME}://${BuildConfig.OAUTH_CALLBACK_HOST}${BuildConfig.OAUTH_CALLBACK_PATH}"

internal sealed interface OAuthCallback {
    class Code(val value: String) : OAuthCallback
    data object Cancelled : OAuthCallback
    class Failure(val error: String) : OAuthCallback
}

internal fun parseOAuthCallback(raw: String?, expectedHost: String = BuildConfig.OAUTH_CALLBACK_HOST): OAuthCallback? {
    val uri = raw?.let { runCatching { URI(it) }.getOrNull() } ?: return null
    // Match the entire authority and encoded path. Ports, userinfo and encoded path aliases are foreign routes.
    if (uri.scheme != BuildConfig.OAUTH_CALLBACK_SCHEME || uri.rawAuthority != expectedHost ||
        uri.rawPath != BuildConfig.OAUTH_CALLBACK_PATH) return null

    val fields = uri.rawQuery.orEmpty().split('&').groupBy { it.substringBefore('=') }
    fun value(key: String): String? = fields[key]?.singleOrNull()?.substringAfter('=', "")?.let {
        URLDecoder.decode(it, "UTF-8").takeIf(String::isNotBlank)
    }
    if ("error" in fields) {
        val error = value("error") ?: "oauth_callback_invalid"
        return if (error == "access_denied") OAuthCallback.Cancelled else OAuthCallback.Failure(error)
    }
    return value("code")?.let(OAuthCallback::Code) ?: OAuthCallback.Failure("oauth_callback_invalid")
}
