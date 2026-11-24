package com.whitelabel.commerce.feature.checkout

import android.annotation.SuppressLint
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.AccountBalanceWallet
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.data.remote.PhoneNormalizer
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.LocalStoreSettings
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject

enum class PaymentFlowOutcome {
    SUCCESS,
    FAILED,
    PENDING,
    CANCELLED,
}

private val EGYPT_WALLET_REGEX = Regex("^01[0125][0-9]{8}$")

internal fun isPendingPaymobUrl(rawUrl: String): Boolean {
    val query = rawUrl.substringAfter('?', "")
    if (query.isEmpty()) return false
    return query.split('&').any { pair ->
        val key = pair.substringBefore('=').trim().lowercase()
        val value = pair.substringAfter('=', "").trim().lowercase()
        key == "pending" && (value == "true" || value == "1")
    }
}

/**
 * Extracts the signed query string ONLY when the URL is strictly Paymob's final
 * `/acceptance/post_pay` receipt endpoint with `pending != true` AND an explicit
 * terminal `success=true` or `success=false` parameter.
 *
 * Returns `null` for `about:blank`, `/acceptance/iframes/...`, wallet OTP/PIN redirects
 * carrying `pending=true&success=false`, 3DS challenges, or any intermediate redirect.
 */
internal fun extractStrictPostPayQuery(rawUrl: String): String? {
    val trimmed = rawUrl.trim()
    if (!trimmed.startsWith("https://", ignoreCase = true)) return null
    val pathAndQuery = trimmed.substringAfter("://").substringAfter('/', "")
    val path = "/" + pathAndQuery.substringBefore('?')
    val query = pathAndQuery.substringAfter('?', "")
    if (query.isEmpty()) return null
    if (!path.contains("/acceptance/post_pay", ignoreCase = true)) return null

    var successValue: String? = null
    for (pair in query.split('&')) {
        val key = pair.substringBefore('=').trim().lowercase()
        val value = pair.substringAfter('=', "").trim().lowercase()
        if (key == "pending" && (value == "true" || value == "1")) {
            return null
        }
        if (key == "success") {
            successValue = value
        }
    }
    if (successValue != "true" && successValue != "false") return null
    return query
}

private fun isAllowedWebStoreBase(base: URL): Boolean =
    base.protocol == "https" ||
        (BuildConfig.DEBUG && base.host in setOf("10.0.2.2", "localhost", "127.0.0.1") && base.protocol == "http")

@HiltViewModel
class PaymentViewModel @Inject constructor(
    private val orders: OrderRepository,
) : ViewModel() {

    suspend fun status(id: String, phone: String): String? {
        val account = orders.getMyOrders().getOrNull()?.find { it.id == id }
        return account?.paymentStatus ?: orders.trackGuestOrder(id, phone).getOrNull()?.paymentStatus
    }

    suspend fun confirmPaid(id: String) {
        orders.confirmLocalPaymentSuccess(id)
    }

    suspend fun initiate(id: String, method: String, wallet: String): String = withContext(Dispatchers.IO) {
        val base = URL(BuildConfig.WEB_STORE_BASE_URL)
        require(isAllowedWebStoreBase(base))
        val conn = URL(base, "/api/payments/paymob/initiate").openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            val body = JSONObject()
                .put("order_id", id)
                .put("method", if (method == "paymob_wallet") "wallet" else "card")
            if (method == "paymob_wallet") {
                body.put("wallet_phone", PhoneNormalizer.normalize(wallet))
            }
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            check(conn.responseCode in 200..299) { "HTTP ${conn.responseCode}" }
            val url = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
                .getString("redirect_url")
            require(URL(url).protocol == "https")
            url
        } finally {
            conn.disconnect()
        }
    }

    /**
     * Bridges Paymob's verified `/acceptance/post_pay` receipt query string directly to
     * `${BuildConfig.WEB_STORE_BASE_URL}/api/payments/paymob/callback` so the server validates
     * the 20-field HMAC-SHA512 signature and persists `orders.payment_status` in Supabase.
     */
    suspend fun bridgePostPayCallback(encodedQuery: String): String? = withContext(Dispatchers.IO) {
        runCatching {
            val base = URL(BuildConfig.WEB_STORE_BASE_URL)
            require(isAllowedWebStoreBase(base))
            val cleanQuery = encodedQuery.trim().removePrefix("?")
            require(cleanQuery.isNotEmpty())
            val callbackUrl = URL(base, "/api/payments/paymob/callback?$cleanQuery")
            val conn = callbackUrl.openConnection() as HttpURLConnection
            try {
                conn.requestMethod = "GET"
                conn.instanceFollowRedirects = false
                conn.connectTimeout = 15_000
                conn.readTimeout = 30_000
                val code = conn.responseCode
                val location = conn.getHeaderField("Location").orEmpty()
                if (code in 300..399 && location.isNotBlank()) {
                    Uri.parse(location).getQueryParameter("payment")
                } else {
                    null
                }
            } finally {
                conn.disconnect()
            }
        }.getOrNull()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun PaymentFlow(
    id: String,
    phone: String,
    method: String,
    initialWallet: String = "",
    onExit: (PaymentFlowOutcome) -> Unit,
    vm: PaymentViewModel = hiltViewModel(),
) {
    val storeSettings = LocalStoreSettings.current
    val brandColors = LocalBrandColors.current
    val scope = rememberCoroutineScope()

    var wallet by rememberSaveable(id) { mutableStateOf(PhoneNormalizer.normalize(initialWallet)) }
    var started by rememberSaveable(id) {
        mutableStateOf(method != "paymob_wallet" || EGYPT_WALLET_REGEX.matches(PhoneNormalizer.normalize(initialWallet)))
    }
    var url by remember(id) { mutableStateOf<String?>(null) }
    var failed by remember(id) { mutableStateOf(false) }
    var bridgedPostPayQuery by remember(id) { mutableStateOf<String?>(null) }
    var callbackOutcome by remember(id) { mutableStateOf<String?>(null) }
    var showCancelDialog by remember { mutableStateOf(false) }
    var checkingBeforeExit by remember { mutableStateOf(false) }
    var pageLoading by remember { mutableStateOf(true) }
    val latestExit by rememberUpdatedState(onExit)

    BackHandler(enabled = !checkingBeforeExit) {
        showCancelDialog = true
    }

    // 1. Initiate Paymob session once wallet is ready (or immediately for card)
    LaunchedEffect(id, started) {
        if (!started) return@LaunchedEffect
        failed = false
        if (vm.status(id, phone) == "paid") {
            vm.confirmPaid(id)
            latestExit(PaymentFlowOutcome.SUCCESS)
            return@LaunchedEffect
        }
        try {
            url = vm.initiate(id, method, wallet)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            failed = true
        }
    }

    // 2. Bridge Paymob `/acceptance/post_pay` (only when explicit `success=true|false` is present)
    LaunchedEffect(id, bridgedPostPayQuery) {
        val query = bridgedPostPayQuery ?: return@LaunchedEffect
        val redirectedOutcome = vm.bridgePostPayCallback(query)
        val dbStatus = vm.status(id, phone)
        when {
            dbStatus == "paid" || redirectedOutcome == "success" -> {
                vm.confirmPaid(id)
                latestExit(PaymentFlowOutcome.SUCCESS)
            }
            dbStatus == "failed" || redirectedOutcome == "failed" -> {
                latestExit(PaymentFlowOutcome.FAILED)
            }
            else -> {
                latestExit(PaymentFlowOutcome.PENDING)
            }
        }
    }

    // 3. Handle direct `/orders?payment=...` redirect AND poll Supabase every 2.5s while WebView is open
    LaunchedEffect(id, url, callbackOutcome, bridgedPostPayQuery) {
        if (url == null && callbackOutcome == null) return@LaunchedEffect

        when (callbackOutcome) {
            "success" -> {
                vm.status(id, phone)
                vm.confirmPaid(id)
                latestExit(PaymentFlowOutcome.SUCCESS)
                return@LaunchedEffect
            }
            "failed" -> {
                latestExit(PaymentFlowOutcome.FAILED)
                return@LaunchedEffect
            }
            "pending" -> {
                repeat(4) {
                    val status = vm.status(id, phone)
                    if (status == "paid") {
                        vm.confirmPaid(id)
                        latestExit(PaymentFlowOutcome.SUCCESS)
                        return@LaunchedEffect
                    }
                    if (status == "failed") {
                        latestExit(PaymentFlowOutcome.FAILED)
                        return@LaunchedEffect
                    }
                    delay(1_500)
                }
                latestExit(PaymentFlowOutcome.PENDING)
                return@LaunchedEffect
            }
        }

        while (url != null && callbackOutcome == null && bridgedPostPayQuery == null) {
            delay(2_500)
            val status = vm.status(id, phone)
            if (status == "paid") {
                vm.confirmPaid(id)
                latestExit(PaymentFlowOutcome.SUCCESS)
                break
            }
        }
    }

    val isConfirming = bridgedPostPayQuery != null || callbackOutcome != null || checkingBeforeExit

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = localized("بوابة الدفع الآمنة", "Secure payment gateway"),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                },
                navigationIcon = {
                    IconButton(
                        enabled = !checkingBeforeExit,
                        onClick = { showCancelDialog = true },
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = localized("إغلاق", "Close"),
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface,
                ),
            )
        },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            when {
                !started -> {
                    val normalizedWallet = PhoneNormalizer.normalize(wallet)
                    val validWallet = EGYPT_WALLET_REGEX.matches(normalizedWallet)
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(20.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            border = BorderStroke(1.dp, brandColors.hairline),
                            shape = MaterialTheme.shapes.medium,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(
                                modifier = Modifier.padding(20.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.AccountBalanceWallet,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(32.dp),
                                )
                                Text(
                                    text = localized("إعادة الدفع بالمحفظة الإلكترونية", "Retry mobile wallet payment"),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                )
                                OutlinedTextField(
                                    value = wallet,
                                    onValueChange = { wallet = PhoneNormalizer.normalize(it) },
                                    singleLine = true,
                                    label = { Text(localized("رقم المحفظة الإلكترونية", "Wallet phone number")) },
                                    placeholder = { Text("010xxxxxxxx") },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                                    isError = wallet.isNotEmpty() && !validWallet,
                                    supportingText = {
                                        if (!validWallet) {
                                            Text(
                                                localized(
                                                    "أدخل رقم موبايل مصري من 11 رقماً يبدأ بـ 010 أو 011 أو 012 أو 015",
                                                    "Enter an 11-digit Egyptian mobile number (010/011/012/015)",
                                                ),
                                            )
                                        }
                                    },
                                    shape = MaterialTheme.shapes.small,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                                Button(
                                    onClick = { started = true },
                                    enabled = validWallet,
                                    shape = MaterialTheme.shapes.small,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(48.dp),
                                ) {
                                    Text(localized("متابعة إلى بوابة الدفع", "Continue to payment"))
                                }
                            }
                        }
                    }
                }

                failed -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.ErrorOutline,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(48.dp),
                            )
                            Text(
                                text = localized("تعذر بدء جلسة الدفع الإلكتروني", "Unable to start online payment"),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                textAlign = TextAlign.Center,
                            )
                            Text(
                                text = localized(
                                    "لا تقلق، سلة التسوق محفوظة كما هي. يمكنك المحاولة مرة أخرى الآن أو من صفحة طلباتي.",
                                    "Your cart is still safe. You can retry now or anytime from My Orders.",
                                ),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center,
                            )
                            Button(
                                onClick = {
                                    failed = false
                                    started = false
                                    started = true
                                },
                                shape = MaterialTheme.shapes.small,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(localized("إعادة المحاولة", "Try again"))
                            }
                            OutlinedButton(
                                onClick = { onExit(PaymentFlowOutcome.FAILED) },
                                shape = MaterialTheme.shapes.small,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(localized("الانتقال إلى طلباتي", "Go to My Orders"))
                            }
                        }
                    }
                }

                url == null || isConfirming -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(14.dp),
                        ) {
                            CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                            Icon(
                                imageVector = Icons.Rounded.Lock,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(22.dp),
                            )
                            Text(
                                text = if (isConfirming) {
                                    localized("جاري التحقق وتأكيد عملية الدفع...", "Verifying and confirming payment…")
                                } else {
                                    localized(
                                        "جاري تحويلك إلى بوابة الدفع الآمنة...",
                                        "Redirecting to secure payment gateway…",
                                    )
                                },
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                                textAlign = TextAlign.Center,
                            )
                            Text(
                                text = localized(
                                    "يرجى عدم إغلاق التطبيق حتى اكتمال التحويل.",
                                    "Please keep the app open while we confirm.",
                                ),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                }

                else -> {
                    Column(modifier = Modifier.fillMaxSize()) {
                        if (pageLoading) {
                            LinearProgressIndicator(
                                modifier = Modifier.fillMaxWidth(),
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                        AndroidView(
                            modifier = Modifier.fillMaxSize(),
                            factory = { ctx ->
                                WebView(ctx).apply {
                                    this.settings.javaScriptEnabled = true
                                    this.settings.domStorageEnabled = true
                                    this.settings.javaScriptCanOpenWindowsAutomatically = true
                                    this.settings.setSupportMultipleWindows(false)
                                    this.settings.allowFileAccess = false
                                    this.settings.allowContentAccess = false
                                    webViewClient = object : WebViewClient() {
                                        override fun onPageFinished(view: WebView, page: String) {
                                            pageLoading = false
                                            if (bridgedPostPayQuery != null || callbackOutcome != null) return
                                            if (isPendingPaymobUrl(page)) return
                                            val strictQuery = extractStrictPostPayQuery(page)
                                            if (strictQuery != null) {
                                                bridgedPostPayQuery = strictQuery
                                            }
                                        }

                                        override fun shouldOverrideUrlLoading(
                                            view: WebView,
                                            request: WebResourceRequest,
                                        ): Boolean {
                                            val target = request.url
                                            val rawTarget = target.toString()
                                            if (rawTarget.equals("about:blank", ignoreCase = true)) {
                                                return false
                                            }

                                            // 0. Never intercept or treat as failed when `pending=true` (e.g. Paymob Wallet pre-PIN redirects)
                                            if (isPendingPaymobUrl(rawTarget)) {
                                                return false
                                            }

                                            // 1. Bridge ONLY Paymob's strict `/acceptance/post_pay` receipt URL with `pending != true` and explicit `success=true|false`
                                            if (request.isForMainFrame) {
                                                val strictQuery = extractStrictPostPayQuery(rawTarget)
                                                if (strictQuery != null) {
                                                    if (bridgedPostPayQuery == null) {
                                                        bridgedPostPayQuery = strictQuery
                                                    }
                                                    return true
                                                }
                                            }

                                            val base = Uri.parse(BuildConfig.WEB_STORE_BASE_URL)
                                            val isLocalDebugHost = BuildConfig.DEBUG &&
                                                base.host in setOf("10.0.2.2", "127.0.0.1", "localhost") &&
                                                target.host in setOf("10.0.2.2", "127.0.0.1", "localhost")
                                            val matchesAppOrigin =
                                                (target.host == base.host || isLocalDebugHost) &&
                                                    target.scheme == base.scheme &&
                                                    target.port == base.port

                                            // 2. Intercept final `/orders?payment=success|failed|pending` redirect
                                            if (request.isForMainFrame && matchesAppOrigin && target.path == "/orders") {
                                                val orderParam = target.getQueryParameter("order")
                                                val paymentParam = target.getQueryParameter("payment")
                                                if (orderParam in listOf(null, "", id) &&
                                                    paymentParam in listOf("success", "failed", "pending")
                                                ) {
                                                    callbackOutcome = paymentParam
                                                }
                                                return true
                                            }

                                            // 3. Rewrite mismatched loopback host in debug
                                            if (isLocalDebugHost && target.host != base.host) {
                                                val port = if (target.port > 0) target.port else base.port
                                                val authority = if (port > 0) "${base.host}:$port" else base.host.orEmpty()
                                                val rewritten = target.buildUpon()
                                                    .authority(authority)
                                                    .build()
                                                    .toString()
                                                view.loadUrl(rewritten)
                                                return true
                                            }

                                            // 4. Never block Paymob HTTPS pages or local debug origin
                                            if (matchesAppOrigin) return false
                                            return !target.scheme.equals("https", ignoreCase = true)
                                        }
                                    }
                                    loadUrl(requireNotNull(url))
                                }
                            },
                            onRelease = {
                                it.stopLoading()
                                it.destroy()
                            },
                        )
                    }
                }
            }
        }
    }

    if (showCancelDialog) {
        AlertDialog(
            onDismissRequest = { showCancelDialog = false },
            title = {
                CompositionLocalProvider(
                    LocalLayoutDirection provides if (storeSettings.isRtl) LayoutDirection.Rtl else LayoutDirection.Ltr,
                ) {
                    Text(localized("مغادرة بوابة الدفع؟", "Leave payment gateway?"))
                }
            },
            text = {
                CompositionLocalProvider(
                    LocalLayoutDirection provides if (storeSettings.isRtl) LayoutDirection.Rtl else LayoutDirection.Ltr,
                ) {
                    Text(
                        localized(
                            "ستبقى منتجاتك محفوظة في السلة، ويمكنك إعادة محاولة الدفع لاحقاً من صفحة طلباتي.",
                            "Your cart will remain intact and you can retry payment anytime from My Orders.",
                        ),
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showCancelDialog = false
                        // Re-query Supabase once before treating Back/Close as cancelled
                        // so an already-paid order is never marked cancelled/failed.
                        scope.launch {
                            checkingBeforeExit = true
                            val dbStatus = vm.status(id, phone)
                            if (dbStatus == "paid") {
                                vm.confirmPaid(id)
                                checkingBeforeExit = false
                                latestExit(PaymentFlowOutcome.SUCCESS)
                            } else {
                                checkingBeforeExit = false
                                latestExit(PaymentFlowOutcome.CANCELLED)
                            }
                        }
                    },
                ) {
                    Text(localized("مغادرة", "Leave"))
                }
            },
            dismissButton = {
                TextButton(onClick = { showCancelDialog = false }) {
                    Text(localized("متابعة الدفع", "Continue payment"))
                }
            },
        )
    }
}
