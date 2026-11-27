package com.whitelabel.commerce.feature.checkout

import android.annotation.SuppressLint
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.material.icons.rounded.LocalShipping
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
import androidx.compose.runtime.mutableIntStateOf
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
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.URL
import java.util.concurrent.TimeUnit
import javax.inject.Inject

enum class PaymentFlowOutcome {
    SUCCESS,
    SWITCHED_TO_COD,
    FAILED,
    PENDING,
    CANCELLED,
}

private enum class PaymentStage { INITIATING, WALLET_PROMPT, PROCESSING, DECLINED, FAILED, INELIGIBLE }

private val EGYPT_WALLET_REGEX = Regex("^01[0125][0-9]{8}$")
private const val PAYMENT_TIMEOUT_MS = 15_000L

internal fun isPaymentConfirmed(dbStatus: String?) = dbStatus == "paid"

internal fun isLocalOrLanHost(host: String?): Boolean {
    val clean = host?.trim()?.lowercase().orEmpty()
    if (clean.isEmpty()) return false
    if (clean == "localhost" || clean == "127.0.0.1") return true
    val parts = clean.split('.')
    if (parts.size != 4 || parts.any { !it.matches(Regex("0|[1-9][0-9]{0,2}")) || it.toInt() > 255 }) return false
    return parts[0] == "10" || (parts[0] == "192" && parts[1] == "168") ||
        (parts[0] == "172" && parts[1].toInt() in 16..31)
}

internal fun isPaymobUrl(raw: String): Boolean = runCatching {
    val uri = java.net.URI(raw)
    val host = uri.host?.lowercase().orEmpty()
    uri.scheme.equals("https", true) && uri.rawUserInfo == null && uri.port in setOf(-1, 443) &&
        (host.endsWith(".paymob.com") || host == "accept.paymobsolutions.com" || host == "paymob.com")
}.getOrDefault(false)

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
 */
internal fun extractStrictPostPayQuery(rawUrl: String): String? {
    val trimmed = rawUrl.trim()
    if (!isPaymobUrl(trimmed)) return null
    val pathAndQuery = trimmed.substringAfter("://").substringAfter('/', "")
    val path = "/" + pathAndQuery.substringBefore('?')
    val query = pathAndQuery.substringAfter('?', "")
    if (query.isEmpty()) return null
    if (path.trimEnd('/') !in setOf("/api/acceptance/post_pay", "/acceptance/post_pay")) return null

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

internal fun isAllowedWebStoreBase(
    base: URL,
    allowLocalLanHttp: Boolean = BuildConfig.DEBUG,
): Boolean =
    base.host.isNotBlank() && base.userInfo == null && (base.protocol.equals("https", ignoreCase = true) ||
        (allowLocalLanHttp && base.protocol.equals("http", ignoreCase = true) &&
            (isLocalOrLanHost(base.host) || base.host.endsWith(".localhost", ignoreCase = true))))

@HiltViewModel
class PaymentViewModel @Inject constructor(
    private val orders: OrderRepository,
    private val supabase: SupabaseClient,
) : ViewModel() {

    private val httpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .followRedirects(false)
            .followSslRedirects(false)
            .build()
    }

    suspend fun status(id: String, phone: String): String? {
        val account = orders.getOrderDetail(id).getOrNull()
        return account?.paymentStatus ?: orders.trackGuestOrder(id, phone).getOrNull()?.paymentStatus
    }

    suspend fun confirmPaid(id: String) {
        orders.confirmLocalPaymentSuccess(id)
    }

    suspend fun switchToCod(id: String, phone: String): Result<Unit> =
        orders.switchOrderToCod(id, phone)

    internal suspend fun initiate(id: String, method: String, phone: String, wallet: String): PaymobInitiation = withContext(Dispatchers.IO) {
        val request = paymobInitiationRequest(
            URL(BuildConfig.WEB_STORE_BASE_URL), BuildConfig.STORE_SLUG, id, method, phone, wallet,
            supabase.auth.currentAccessTokenOrNull(),
        )
        httpClient.newCall(request).execute().use { response ->
            parsePaymobInitiation(response.code, response.body?.string().orEmpty())
        }
    }

    suspend fun bridgePostPayCallback(encodedQuery: String, orderId: String): String? = withContext(Dispatchers.IO) {
        runCatching {
            val base = URL(BuildConfig.WEB_STORE_BASE_URL)
            require(isAllowedWebStoreBase(base))
            val cleanQuery = encodedQuery.trim().removePrefix("?")
            require(cleanQuery.isNotEmpty())
            val callbackUrl = URL(base, "/api/payments/paymob/callback?$cleanQuery").toString()
            val request = Request.Builder().url(callbackUrl).get().build()
            httpClient.newCall(request).execute().use { response ->
                val location = response.header("Location").orEmpty()
                if (response.code in 300..399 && location.isNotBlank()) {
                    extractAppOrdersOutcome(URL(base, location).toString(), base.toString(), BuildConfig.STORE_SLUG, orderId)
                } else {
                    null
                }
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

    var wallet by rememberSaveable(id, method) { mutableStateOf(PhoneNormalizer.normalizeForEgyptCheckout(initialWallet)) }
    var started by rememberSaveable(id, method) {
        mutableStateOf(method != "paymob_wallet" || EGYPT_WALLET_REGEX.matches(wallet))
    }
    var attemptNonce by remember(id) { mutableIntStateOf(0) }
    var url by remember(id) { mutableStateOf<String?>(null) }
    var stage by rememberSaveable(id, method) { mutableStateOf(PaymentStage.INITIATING) }
    val waiting = stage == PaymentStage.WALLET_PROMPT || stage == PaymentStage.PROCESSING
    val failed = stage == PaymentStage.DECLINED || stage == PaymentStage.FAILED || stage == PaymentStage.INELIGIBLE
    var feedback by remember(id) { mutableStateOf<String?>(null) }
    var checkRequested by remember(id) { mutableStateOf(false) }
    var switchingToCod by remember(id) { mutableStateOf(false) }
    var bridgedPostPayQuery by remember(id) { mutableStateOf<String?>(null) }
    var callbackOutcome by remember(id) { mutableStateOf<String?>(null) }
    var showCancelDialog by remember { mutableStateOf(false) }
    var checkingBeforeExit by remember { mutableStateOf(false) }
    var pageLoading by remember { mutableStateOf(true) }
    val latestExit by rememberUpdatedState(onExit)

    BackHandler(enabled = !checkingBeforeExit && !switchingToCod) {
        showCancelDialog = true
    }

    // 1. Initiate Paymob session with 15-second timeout once ready
    LaunchedEffect(id, started, attemptNonce) {
        if (!started || stage != PaymentStage.INITIATING) return@LaunchedEffect
        feedback = null
        url = null
        pageLoading = true
        if (vm.status(id, phone) == "paid") {
            vm.confirmPaid(id)
            latestExit(PaymentFlowOutcome.SUCCESS)
            return@LaunchedEffect
        }
        try {
            when (val result = vm.initiate(id, method, phone, wallet)) {
                is PaymobInitiation.Redirect -> url = result.url
                PaymobInitiation.PendingWalletPrompt -> stage = PaymentStage.WALLET_PROMPT
                PaymobInitiation.Processing -> stage = PaymentStage.PROCESSING
                PaymobInitiation.Declined -> stage = PaymentStage.DECLINED
            }
        } catch (e: CancellationException) {
            throw e
        } catch (_: OrderIneligibleException) {
            stage = PaymentStage.INELIGIBLE
        } catch (_: Exception) {
            stage = PaymentStage.FAILED
            feedback = localized("تعذر بدء عملية الدفع. تحقق من اتصالك وأعد المحاولة.", "Payment could not be started. Check your connection and retry.")
        }
    }

    // 1b. 15-second WebView initial page-load watchdog so the spinner never hangs indefinitely
    LaunchedEffect(url, pageLoading, failed) {
        if (url != null && pageLoading && !failed) {
            delay(PAYMENT_TIMEOUT_MS)
            if (pageLoading && bridgedPostPayQuery == null && callbackOutcome == null) {
                stage = PaymentStage.FAILED
                pageLoading = false
                feedback = localized("استغرق تحميل صفحة بوابة الدفع وقتاً طويلاً.", "The payment gateway page took too long to respond.")
            }
        }
    }

    // 2. Bridge Paymob `/acceptance/post_pay` (only when pending != true and explicit success=true|false)
    LaunchedEffect(id, bridgedPostPayQuery) {
        val query = bridgedPostPayQuery ?: return@LaunchedEffect
        val redirectedOutcome = vm.bridgePostPayCallback(query, id)
        val dbStatus = vm.status(id, phone)
        when {
            isPaymentConfirmed(dbStatus) -> {
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

    // Reconcile redirects and wallet prompts against the server before settling the cart.
    LaunchedEffect(id, url, waiting, failed, callbackOutcome, bridgedPostPayQuery, checkRequested, switchingToCod, checkingBeforeExit) {
        if (failed || switchingToCod || checkingBeforeExit || bridgedPostPayQuery != null) return@LaunchedEffect
        if (url == null && !waiting && callbackOutcome == null) return@LaunchedEffect

        when (callbackOutcome) {
            "failed" -> {
                latestExit(PaymentFlowOutcome.FAILED)
                return@LaunchedEffect
            }
            "success", "pending" -> {
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

        while (true) {
            if (!checkRequested) delay(2_500)
            val status = vm.status(id, phone)
            if (status == "paid") {
                vm.confirmPaid(id)
                latestExit(PaymentFlowOutcome.SUCCESS)
                return@LaunchedEffect
            }
            if (status == "failed" && waiting) {
                stage = PaymentStage.DECLINED
                feedback = null
                checkRequested = false
                return@LaunchedEffect
            }
            if (checkRequested) {
                feedback = if (status == null) {
                    localized("تعذر التحقق الآن. سنحاول مجدداً.", "Could not check the status yet. We’ll check again.")
                } else {
                    localized("لم يصل تأكيد الدفع بعد.", "Payment confirmation is still pending.")
                }
                checkRequested = false
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
                        enabled = !checkingBeforeExit && !switchingToCod,
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
                    val validWallet = EGYPT_WALLET_REGEX.matches(wallet)
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
                                    onValueChange = { wallet = PhoneNormalizer.normalizeForEgyptCheckout(it) },
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

                failed || waiting -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            modifier = Modifier.verticalScroll(rememberScrollState()),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Icon(
                                imageVector = if (waiting) Icons.Rounded.Lock else Icons.Rounded.ErrorOutline,
                                contentDescription = null,
                                tint = if (waiting) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(48.dp),
                            )
                            Text(
                                text = when (stage) {
                                    PaymentStage.WALLET_PROMPT -> localized("في انتظار موافقة المحفظة", "Waiting for wallet approval")
                                    PaymentStage.PROCESSING -> localized("جارٍ التحقق من الدفع", "Payment is processing")
                                    PaymentStage.DECLINED -> localized("رُفضت عملية الدفع", "Payment declined")
                                    PaymentStage.INELIGIBLE -> localized("انتهت مهلة الدفع", "Payment is no longer available")
                                    else -> localized("تعذر إكمال الدفع", "Unable to complete payment")
                                },
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                textAlign = TextAlign.Center,
                            )
                            Text(
                                text = when {
                                    waiting && (stage == PaymentStage.WALLET_PROMPT || method == "paymob_wallet") -> localized(
                                        "وافق على طلب الدفع على هاتفك باستخدام الرقم السري للمحفظة أو رسالة USSD. سنعرض التأكيد هنا.",
                                        "Approve the mobile wallet PIN or USSD prompt on your phone. Confirmation will appear here.",
                                    )
                                    waiting -> localized("سنتحقق تلقائياً من حالة الدفع.", "We’ll check for payment confirmation automatically.")
                                    stage == PaymentStage.INELIGIBLE -> orderIneligibleMessage()
                                    stage == PaymentStage.DECLINED -> localized("يمكنك إعادة المحاولة من هنا.", "You can retry this payment.")
                                    else -> localized("يمكنك مراجعة الطلب من صفحة طلباتي.", "You can review this order in My Orders.")
                                },
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center,
                            )
                            feedback?.let {
                                Text(it, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
                            }
                            if (stage != PaymentStage.INELIGIBLE) {
                                Button(
                                    onClick = {
                                        if (waiting) {
                                            checkRequested = true
                                        } else {
                                            feedback = null
                                            url = null
                                            stage = PaymentStage.INITIATING
                                            attemptNonce += 1
                                        }
                                    },
                                    enabled = !switchingToCod && !checkRequested,
                                    shape = MaterialTheme.shapes.small,
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Text(if (waiting) localized("التحقق من حالة الدفع", "Check payment status") else localized("إعادة المحاولة", "Retry"))
                                }
                            }
                            if (storeSettings.codEnabled && stage != PaymentStage.INELIGIBLE) {
                                OutlinedButton(
                                    onClick = {
                                        scope.launch {
                                            switchingToCod = true
                                            vm.switchToCod(id, phone)
                                                .onSuccess {
                                                    switchingToCod = false
                                                    latestExit(PaymentFlowOutcome.SWITCHED_TO_COD)
                                                }
                                                .onFailure {
                                                    switchingToCod = false
                                                    if (it.message.orEmpty().contains("order_ineligible", ignoreCase = true)) {
                                                        stage = PaymentStage.INELIGIBLE
                                                        feedback = null
                                                    } else {
                                                        feedback = localized("تعذر التحويل إلى الدفع عند الاستلام حالياً.", "Could not switch to Cash on Delivery right now.")
                                                    }
                                                }
                                        }
                                    },
                                    enabled = !switchingToCod,
                                    shape = MaterialTheme.shapes.small,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(48.dp),
                                ) {
                                    if (switchingToCod) {
                                        CircularProgressIndicator(
                                            strokeWidth = 2.dp,
                                            modifier = Modifier.size(18.dp),
                                        )
                                    } else {
                                        Icon(
                                            imageVector = Icons.Rounded.LocalShipping,
                                            contentDescription = null,
                                            modifier = Modifier.size(18.dp),
                                        )
                                        Spacer(modifier = Modifier.size(8.dp))
                                        Text(localized("التحويل للدفع عند الاستلام (COD)", "Switch to Cash on Delivery"))
                                    }
                                }
                            }
                            TextButton(
                                onClick = { onExit(if (waiting) PaymentFlowOutcome.PENDING else PaymentFlowOutcome.FAILED) },
                                enabled = !switchingToCod,
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
                                            extractAppOrdersOutcome(page, BuildConfig.WEB_STORE_BASE_URL, BuildConfig.STORE_SLUG, id)?.let {
                                                callbackOutcome = it
                                                return
                                            }
                                            if (isPendingPaymobUrl(page)) return
                                            val strictQuery = extractStrictPostPayQuery(page)
                                            if (strictQuery != null) {
                                                bridgedPostPayQuery = strictQuery
                                            }
                                        }

                                        override fun onReceivedError(
                                            view: WebView,
                                            request: WebResourceRequest,
                                            error: WebResourceError,
                                        ) {
                                            if (request.isForMainFrame && bridgedPostPayQuery == null && callbackOutcome == null) {
                                                pageLoading = false
                                                stage = PaymentStage.FAILED
                                                feedback = localized("تعذر تحميل صفحة الدفع. يرجى المحاولة مجدداً.", "Failed to load the payment page. Please retry.")
                                            }
                                        }

                                        override fun onReceivedHttpError(
                                            view: WebView,
                                            request: WebResourceRequest,
                                            errorResponse: WebResourceResponse,
                                        ) {
                                            if (request.isForMainFrame && errorResponse.statusCode >= 500 &&
                                                bridgedPostPayQuery == null && callbackOutcome == null
                                            ) {
                                                pageLoading = false
                                                stage = PaymentStage.FAILED
                                                feedback = localized("خادم الدفع غير متاح مؤقتاً.", "The payment server is temporarily unavailable.")
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

                                            // 0. Never intercept or treat as failed when `pending=true` (Paymob Wallet pre-PIN redirects)
                                            if (isPaymobUrl(rawTarget) && isPendingPaymobUrl(rawTarget)) {
                                                return false
                                            }

                                            // 1. Bridge ONLY Paymob's strict `/acceptance/post_pay` receipt URL with pending != true and explicit success=true|false
                                            if (request.isForMainFrame) {
                                                val strictQuery = extractStrictPostPayQuery(rawTarget)
                                                if (strictQuery != null) {
                                                    if (bridgedPostPayQuery == null) {
                                                        bridgedPostPayQuery = strictQuery
                                                    }
                                                    return true
                                                }
                                            }

                                            if (request.isForMainFrame) {
                                                extractAppOrdersOutcome(rawTarget, BuildConfig.WEB_STORE_BASE_URL, BuildConfig.STORE_SLUG, id)?.let {
                                                    callbackOutcome = it
                                                    return true
                                                }
                                            }

                                            val base = BuildConfig.WEB_STORE_BASE_URL.toHttpUrl()
                                            val destination = rawTarget.toHttpUrlOrNull() ?: return true
                                            val matchesAppOrigin = matchesStorefrontOrigin(destination, base, BuildConfig.STORE_SLUG)
                                            if (matchesAppOrigin && base.scheme == "http" && destination.host != base.host &&
                                                isLocalOrLanHost(destination.host)
                                            ) {
                                                view.loadUrl(destination.newBuilder().host(base.host).build().toString())
                                                return true
                                            }

                                            // 4. Never block Paymob HTTPS pages or allowed local origin
                                            if (matchesAppOrigin) return false
                                            return !isPaymobUrl(rawTarget)
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
                            "ستبقى منتجاتك محفوظة في السلة، ويمكنك إعادة المحاولة أو التحويل إلى الدفع عند الاستلام من صفحة طلباتي.",
                            "Your cart will remain intact and you can retry payment or switch to Cash on Delivery anytime from My Orders.",
                        ),
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showCancelDialog = false
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
