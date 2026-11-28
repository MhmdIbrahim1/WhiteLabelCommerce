package com.whitelabel.commerce.feature.catalog

import android.content.Intent
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.LocalShipping
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Sync
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.designsystem.components.BannerFeedback
import com.whitelabel.commerce.core.designsystem.components.RecentlyViewedRow
import com.whitelabel.commerce.core.domain.model.PaymentMethod
import com.whitelabel.commerce.core.domain.model.StoreSettings
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Checklist
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Straighten
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import com.whitelabel.commerce.core.designsystem.components.SearchAction
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.LocalStoreSettings
import com.whitelabel.commerce.core.designsystem.components.BrandEmptyState
import com.whitelabel.commerce.core.designsystem.components.ColorSwatchMapper
import com.whitelabel.commerce.core.designsystem.components.FlashRoseColor
import com.whitelabel.commerce.core.designsystem.components.FlashSaleCountdownPill
import com.whitelabel.commerce.core.designsystem.components.rememberFlashSaleTime
import com.whitelabel.commerce.core.designsystem.components.ProductCard
import com.whitelabel.commerce.core.designsystem.components.RatingAmberColor
import com.whitelabel.commerce.core.designsystem.components.RatingAmberTextColor
import com.whitelabel.commerce.core.designsystem.components.WishlistHeartIconButton
import com.whitelabel.commerce.core.designsystem.components.rememberShimmerBrush
import com.whitelabel.commerce.core.designsystem.formatPrice
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.FlashSalePricing
import com.whitelabel.commerce.core.domain.model.WishlistToggleOutcome

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ProductDetailScreen(
    onBack: () -> Unit,
    onSearch: () -> Unit,
    onAddedToCart: (String, String?) -> Unit,
    onBuyNow: () -> Unit,
    onProductClick: (String) -> Unit = {},
    onOpenAccount: () -> Unit = {},
    onShowMessage: (String) -> Unit = {},
    onWishlistSignInPrompt: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: ProductDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val productId = state.product?.id
    LaunchedEffect(lifecycle, viewModel, productId) {
        if (productId != null) lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            viewModel.observeReviewReplies(productId)
        }
    }
    val recent by viewModel.recentlyViewed.collectAsStateWithLifecycle(initialValue = emptyList())
    val context = LocalContext.current
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val brandColors = LocalBrandColors.current
    val settings = LocalStoreSettings.current
    var showSizeGuide by remember { mutableStateOf(false) }
    var showWriteReview by remember { mutableStateOf(false) }
    var showRestockInput by remember(productId, state.selectedSize, state.selectedColor) { mutableStateOf(false) }
    var restockPhone by remember(productId, state.selectedSize, state.selectedColor) { mutableStateOf("") }
    val saleTime = state.product?.let { product ->
        key(product.id, product.flashSaleStartsAt, product.flashSaleEndsAt) {
            val start = remember { FlashSalePricing.parseIsoTimestampMillis(product.flashSaleStartsAt) }
            val end = remember { FlashSalePricing.parseIsoTimestampMillis(product.flashSaleEndsAt) }
            val now = System.currentTimeMillis()
            val nextChange = if (start != null && start > now) start else end?.takeIf { it > now }
            maxOf(now, rememberFlashSaleTime(nextChange) {})
        }
    } ?: 0L

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        // The app shell already places this destination inside the system bars.
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                windowInsets = WindowInsets(0, 0, 0, 0),
                title = {
                    Text(
                        text = state.product?.displayName ?: localized("تفاصيل المنتج", "Product details"),
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = localized("رجوع", "Back"),
                        )
                    }
                },
                actions = {
                    SearchAction(onSearch)
                    state.product?.let { product ->
                        val shareLabel = localized("مشاركة المنتج", "Share product")
                        IconButton(onClick = {
                            val url = buildProductShareUrl(BuildConfig.WEB_STORE_BASE_URL, BuildConfig.STORE_SLUG, product.slug, product.id)
                            val message = buildProductShareText(product, settings.storeName, settings.currency, settings.locale, url, rtl)
                            val intent = Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_SUBJECT, product.displayName)
                                putExtra(Intent.EXTRA_TEXT, message)
                            }
                            context.startActivity(Intent.createChooser(intent, shareLabel))
                        }) {
                            Icon(Icons.Rounded.Share, contentDescription = shareLabel)
                        }
                        WishlistHeartIconButton(
                            isWishlisted = state.isWishlisted,
                            onClick = {
                                viewModel.toggleWishlist { outcome ->
                                    when (outcome) {
                                        WishlistToggleOutcome.RequiresSignIn -> onWishlistSignInPrompt()
                                        is WishlistToggleOutcome.Toggled -> onShowMessage(
                                            if (outcome.inWishlist) {
                                                localized("تمت الإضافة إلى المفضلة", "Saved to wishlist")
                                            } else {
                                                localized("تمت الإزالة من المفضلة", "Removed from wishlist")
                                            },
                                        )
                                        is WishlistToggleOutcome.Failure -> onShowMessage(outcome.message)
                                    }
                                }
                            },
                            modifier = Modifier.padding(end = 10.dp),
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface,
                ),
            )
        },
        bottomBar = {
            state.product?.let { product ->
                PurchaseBar(
                    state = state,
                    total = formatPrice(
                        product.effectivePrice(saleTime) * state.quantity,
                        settings.currency, settings.locale,
                    ),
                    onAdd = {
                        val image = product.imageFor(state.selectedColor)
                        viewModel.addToCart(onShowMessage) { message -> onAddedToCart(message, image) }
                    },
                    onBuy = { viewModel.addToCart(onShowMessage) { onBuyNow() } },
                )
            }
        },
    ) { innerPadding ->
        when {
            state.isLoading -> {
                val brush = rememberShimmerBrush()
                Column(
                    modifier = Modifier.fillMaxSize().padding(innerPadding).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Spacer(Modifier.fillMaxWidth().aspectRatio(0.9f).background(brush))
                    Spacer(Modifier.fillMaxWidth(0.7f).height(28.dp).background(brush))
                    Spacer(Modifier.fillMaxWidth(0.35f).height(20.dp).background(brush))
                    Spacer(Modifier.fillMaxWidth().height(48.dp).background(brush))
                }
            }

            state.errorMessage != null || state.product == null -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    BrandEmptyState(
                        icon = Icons.Outlined.ErrorOutline,
                        title = localized("تعذر عرض المنتج", "Unable to display product"),
                        subtitle = state.errorMessage ?: localized("المنتج غير موجود.", "Product not found."),
                        actionLabel = localized("إعادة المحاولة", "Try again"),
                        onAction = viewModel::loadProduct,
                    )
                }
            }

            else -> {
                val product = state.product!!
                val inventory = remember(product) { product.inventory }
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    ProductGallery(product, state.selectedColor) {
                        val flashPct = product.flashSavingsPercent(saleTime)
                        if (flashPct != null) {
                            Surface(
                                color = FlashRoseColor,
                                contentColor = Color.White,
                                shape = MaterialTheme.shapes.small,
                                modifier = Modifier
                                    .align(Alignment.TopStart)
                                    .padding(12.dp),
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Bolt,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier.size(15.dp),
                                    )
                                    Text(
                                        text = localized("عرض مؤقت -$flashPct%", "Flash -$flashPct%"),
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                            }
                        } else {
                            product.regularDiscountPercent?.let { discount ->
                                Surface(
                                    color = MaterialTheme.colorScheme.secondary,
                                    contentColor = MaterialTheme.colorScheme.onSecondary,
                                    shape = MaterialTheme.shapes.small,
                                    modifier = Modifier
                                        .align(Alignment.TopStart)
                                        .padding(12.dp),
                                ) {
                                    Text(
                                        text = localized("خصم $discount%", "Save $discount%"),
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                                    )
                                }
                            }
                        }
                    }

                    // 2. Title, Rating Pill, Price, Stock Availability Badge
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = product.displayName,
                            style = MaterialTheme.typography.headlineSmall,
                            color = MaterialTheme.colorScheme.onBackground,
                        )

                        if (product.hasReviews) {
                            Surface(
                                color = RatingAmberColor.copy(alpha = 0.14f),
                                shape = CircleShape,
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Star,
                                        contentDescription = null,
                                        tint = RatingAmberColor,
                                        modifier = Modifier.size(15.dp),
                                    )
                                    Text(
                                        text = product.formattedRating,
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = RatingAmberTextColor,
                                    )
                                    Text(
                                        text = localized(
                                            "(${product.reviewCount} تقييم)",
                                            "(${product.reviewCount} reviews)",
                                        ),
                                        style = MaterialTheme.typography.labelMedium,
                                        color = RatingAmberTextColor.copy(alpha = 0.85f),
                                    )
                                }
                            }
                        }

                        val detailFlashActive = product.isFlashSaleActive(saleTime)
                        val detailEffectivePrice = product.effectivePrice(saleTime)
                        val detailStrikePrice = product.displayStrikePrice(saleTime)

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Text(
                                text = formatPrice(detailEffectivePrice, settings.currency, settings.locale),
                                style = MaterialTheme.typography.headlineMedium,
                                color = if (detailFlashActive) FlashRoseColor else MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.Bold,
                            )
                            if (detailStrikePrice != null) {
                                Text(
                                    text = formatPrice(detailStrikePrice, settings.currency, settings.locale),
                                    style = MaterialTheme.typography.titleMedium.copy(
                                        textDecoration = TextDecoration.LineThrough,
                                    ),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }

                        if (detailFlashActive && !product.flashSaleEndsAt.isNullOrBlank()) {
                            FlashSaleCountdownPill(
                                endsAt = product.flashSaleEndsAt,
                                startsAt = product.flashSaleStartsAt,
                                compact = false,
                                showLabel = true,
                            )
                        }

                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Surface(
                                color = when {
                                    state.selectedStock <= 0 -> MaterialTheme.colorScheme.errorContainer
                                    state.selectedStock in 1..5 -> brandColors.warning.copy(alpha = 0.16f)
                                    else -> brandColors.success.copy(alpha = 0.14f)
                                },
                                contentColor = when {
                                    state.selectedStock <= 0 -> MaterialTheme.colorScheme.error
                                    state.selectedStock in 1..5 -> brandColors.warning
                                    else -> brandColors.success
                                },
                                shape = MaterialTheme.shapes.extraSmall,
                            ) {
                                Text(
                                    text = when {
                                        state.selectedStock <= 0 -> localized("نفذت كمية هذا الخيار", "Selected option out of stock")
                                        state.selectedStock <= 5 -> {
                                            val count = "\u2066${state.selectedStock}\u2069"
                                            localized("متبقي $count قطع", "Only $count left")
                                        }
                                        else -> localized("متوفر", "In stock")
                                    },
                                    style = MaterialTheme.typography.labelMedium.copy(fontFeatureSettings = "tnum"),
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                )
                            }
                        }
                    }

                    TrustHighlights(settings)

                    // 3. Size Selector Chips + Size & Measurements Guide Trigger
                    if (product.sizes.isNotEmpty()) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = localized("المقاس", "Size"),
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                TextButton(onClick = { showSizeGuide = true }) {
                                    Icon(
                                        imageVector = Icons.Rounded.Straighten,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp),
                                    )
                                    Text(
                                        text = localized("دليل المقاسات والقياسات", "Size & Measurements Guide"),
                                        style = MaterialTheme.typography.labelMedium,
                                        modifier = Modifier.padding(start = 6.dp),
                                    )
                                }
                            }
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                product.sizes.forEach { size ->
                                    val selected = state.selectedSize == size
                                    val available = inventory.stock(state.selectedColor, size, product.stock) > 0
                                    FilterChip(
                                        selected = selected,
                                        onClick = { viewModel.selectSize(size) },
                                        leadingIcon = if (selected) {
                                            {
                                                Icon(
                                                    imageVector = Icons.Rounded.Check,
                                                    contentDescription = null,
                                                    modifier = Modifier.size(15.dp),
                                                )
                                            }
                                        } else {
                                            null
                                        },
                                        label = {
                                            Text(
                                                text = size,
                                                fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                                                textDecoration = if (!available) TextDecoration.LineThrough else TextDecoration.None,
                                            )
                                        },
                                        shape = MaterialTheme.shapes.small,
                                        colors = FilterChipDefaults.filterChipColors(
                                            selectedContainerColor = MaterialTheme.colorScheme.primary,
                                            selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                                            selectedLeadingIconColor = MaterialTheme.colorScheme.onPrimary,
                                        ),
                                        modifier = Modifier.alpha(if (available) 1f else 0.55f),
                                    )
                                }
                            }
                        }
                    }

                    // 4. Interactive Color Swatches with Stock Availability Clarity
                    if (product.colors.isNotEmpty()) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                text = localized(
                                    "اللون: ${ColorSwatchMapper.displayLabel(state.selectedColor.orEmpty())}",
                                    "Color: ${ColorSwatchMapper.displayLabel(state.selectedColor.orEmpty())}",
                                ),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                            )
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                product.colors.forEach { colorName ->
                                    val selected = state.selectedColor == colorName
                                    val available = inventory.colorStock(colorName, product.stock) > 0
                                    val swatchColor = ColorSwatchMapper.resolveOrNull(colorName)
                                    FilterChip(
                                        selected = selected,
                                        onClick = { viewModel.selectColor(colorName) },
                                        leadingIcon = swatchColor?.let { resolved ->
                                            {
                                                Box(
                                                    modifier = Modifier
                                                        .size(16.dp)
                                                        .clip(CircleShape)
                                                        .background(resolved)
                                                        .border(
                                                            width = 1.dp,
                                                            color = brandColors.hairline,
                                                            shape = CircleShape,
                                                        ),
                                                )
                                            }
                                        },
                                        label = {
                                            Text(
                                                text = ColorSwatchMapper.displayLabel(colorName),
                                                fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                                                textDecoration = if (!available) TextDecoration.LineThrough else TextDecoration.None,
                                            )
                                        },
                                        shape = MaterialTheme.shapes.small,
                                        colors = FilterChipDefaults.filterChipColors(
                                            selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                                            selectedLabelColor = MaterialTheme.colorScheme.primary,
                                        ),
                                        modifier = Modifier.alpha(if (available) 1f else 0.55f),
                                    )
                                }
                            }
                        }
                    }

                    // 5. Quantity Stepper OR Back-in-Stock ("Notify Me") Card
                    if (state.selectedStock <= 0) {
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.25f),
                            ),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)),
                            shape = MaterialTheme.shapes.medium,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                if (state.restockSubscribed) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        Icon(
                                            imageVector = Icons.Rounded.Check,
                                            contentDescription = null,
                                            tint = brandColors.success,
                                        )
                                        Text(
                                            text = localized(
                                                "تم تسجيل طلبك! سننبّهك فور توفر المنتج من جديد.",
                                                "You're on the list! We'll notify you as soon as it's back in stock.",
                                            ),
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.SemiBold,
                                            color = brandColors.success,
                                        )
                                    }
                                } else if (!showRestockInput) {
                                    OutlinedButton(
                                        onClick = { showRestockInput = true },
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Icon(
                                            imageVector = Icons.Rounded.NotificationsActive,
                                            contentDescription = null,
                                            modifier = Modifier.size(18.dp),
                                        )
                                        Text(
                                            text = localized("نبّهني عند توفر هذا الخيار", "Notify Me When This Option Is Back"),
                                            modifier = Modifier.padding(start = 8.dp),
                                        )
                                    }
                                } else {
                                    Text(
                                        text = localized(
                                            "أدخل رقم هاتفك (اختياري للمسجلين) ليصلك تنبيه فوري عند عودة المخزون.",
                                            "Enter your phone (optional if signed in) for an instant restock alert.",
                                        ),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                    OutlinedTextField(
                                        value = restockPhone,
                                        onValueChange = { restockPhone = it },
                                        singleLine = true,
                                        label = {
                                            Text(localized("رقم الهاتف", "Phone Number"))
                                        },
                                        modifier = Modifier.fillMaxWidth(),
                                    )
                                    state.restockError?.let { BannerFeedback(it) }
                                    Button(
                                        onClick = { viewModel.subscribeBackInStock(restockPhone) },
                                        enabled = !state.isSubscribingRestock,
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Icon(
                                            imageVector = Icons.Rounded.NotificationsActive,
                                            contentDescription = null,
                                            modifier = Modifier.size(18.dp),
                                        )
                                        Text(
                                            text = if (state.isSubscribingRestock) {
                                                localized("جارٍ التسجيل…", "Subscribing…")
                                            } else {
                                                localized("تفعيل التنبيه", "Activate Alert")
                                            },
                                            modifier = Modifier.padding(start = 8.dp),
                                        )
                                    }
                                }
                            }
                        }
                    } else {
                        Surface(
                            color = MaterialTheme.colorScheme.surface,
                            shape = MaterialTheme.shapes.medium,
                            border = BorderStroke(1.dp, brandColors.hairline),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 14.dp, vertical = 10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = localized("الكمية", "Quantity"),
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    Surface(
                                        onClick = viewModel::decrementQuantity,
                                        enabled = state.quantity > 1,
                                        shape = MaterialTheme.shapes.small,
                                        color = MaterialTheme.colorScheme.surfaceVariant,
                                    ) {
                                        Icon(
                                            imageVector = Icons.Rounded.Remove,
                                            contentDescription = localized("تقليل الكمية", "Decrease quantity"),
                                            modifier = Modifier.padding(8.dp),
                                        )
                                    }
                                    Text(
                                        text = minOf(state.remaining, state.quantity).toString(),
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    Surface(
                                        onClick = viewModel::incrementQuantity,
                                        enabled = state.quantity < state.remaining,
                                        shape = MaterialTheme.shapes.small,
                                        color = MaterialTheme.colorScheme.primaryContainer,
                                        contentColor = MaterialTheme.colorScheme.primary,
                                    ) {
                                        Icon(
                                            imageVector = Icons.Rounded.Add,
                                            contentDescription = localized("زيادة الكمية", "Increase quantity"),
                                            modifier = Modifier.padding(8.dp),
                                        )
                                    }
                                }
                            }
                        }
                    }

                    if (state.selectedStock > 0 && state.quantity >= state.remaining) {
                        Text(com.whitelabel.commerce.core.domain.model.quantityLimitHint(), style = MaterialTheme.typography.bodySmall)
                    }

                    // 6. Product Description
                    if (product.displayDescription.isNotBlank()) {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(
                                text = localized("وصف المنتج", "Product description"),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                text = product.displayDescription,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }

                    // 7. Bilingual Technical Specifications Table (Phase 7 parity)
                    if (product.specifications.isNotEmpty()) {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            border = BorderStroke(1.dp, brandColors.hairline),
                            shape = MaterialTheme.shapes.medium,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(
                                modifier = Modifier.padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Checklist,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(20.dp),
                                    )
                                    Text(
                                        text = localized("المواصفات والتفاصيل", "Specifications"),
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }

                                product.specifications.forEachIndexed { idx, spec ->
                                    if (idx > 0) {
                                        HorizontalDivider(color = brandColors.hairline)
                                    }
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Text(
                                            text = spec.displayKey,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.weight(0.45f),
                                        )
                                        Text(
                                            text = spec.displayValue,
                                            style = MaterialTheme.typography.bodySmall,
                                            fontWeight = FontWeight.SemiBold,
                                            color = MaterialTheme.colorScheme.onSurface,
                                            modifier = Modifier.weight(0.55f),
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // 8. Verified Customer Reviews Section
                    ProductReviewsSection(
                        reviews = state.reviews,
                        eligibility = state.eligibility,
                        isSignedIn = state.isSignedIn,
                        userId = state.userId,
                        sendingFollowUp = state.sendingFollowUp,
                        followUpFailed = state.followUpFailed,
                        onFollowUp = viewModel::submitFollowUp,
                        isSubmitting = state.isSubmittingReview,
                        submitError = state.reviewSubmitError,
                        onOpenWriteReview = { showWriteReview = true },
                        onOpenAccount = onOpenAccount,
                    )

                    // 9. Related Products ("Customers Also Bought") Horizontal Row
                    if (state.relatedProducts.isNotEmpty()) {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(
                                text = localized("عملاء اشتروا أيضاً", "Customers Also Bought"),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onBackground,
                            )
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                contentPadding = PaddingValues(end = 4.dp),
                            ) {
                                items(state.relatedProducts, key = { "rel_${it.id}" }) { relProduct ->
                                    ProductCard(
                                        product = relProduct,
                                        isWishlisted = relProduct.id in state.wishlistedProductIds,
                                        onToggleWishlist = {
                                            viewModel.toggleWishlistFor(relProduct.id) { outcome ->
                                                if (outcome is WishlistToggleOutcome.RequiresSignIn) {
                                                    onWishlistSignInPrompt()
                                                }
                                            }
                                        },
                                        onClick = { onProductClick(relProduct.id) },
                                        onQuickAdd = {
                                            if (relProduct.sizes.isNotEmpty() || relProduct.colors.isNotEmpty()) {
                                                onProductClick(relProduct.id)
                                            } else {
                                                viewModel.quickAddRelated(relProduct)
                                                onAddedToCart(
                                                    localized(
                                                        "تمت إضافة \"${relProduct.displayName}\" إلى السلة",
                                                        "Added \"${relProduct.displayName}\" to cart",
                                                    ),
                                                    relProduct.imageUrl,
                                                )
                                            }
                                        },
                                        modifier = Modifier.width(184.dp),
                                    )
                                }
                            }
                        }
                    }

                    RecentlyViewedRow(
                        products = recent.filter { it.id != product.id },
                        onProductClick = onProductClick,
                        onQuickAdd = { item ->
                            if (item.colors.isNotEmpty() || item.sizes.isNotEmpty()) onProductClick(item.id)
                            else viewModel.quickAddRelated(item)
                        },
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                }
            }
        }
    }

    if (showSizeGuide) {
        SizeGuideSheet(
            sizes = state.product?.sizes.orEmpty(),
            onDismiss = { showSizeGuide = false },
        )
    }

    if (showWriteReview) {
        WriteReviewBottomSheet(
            initialRating = state.eligibility.existingReview?.rating ?: 5,
            initialComment = state.eligibility.existingReview?.comment.orEmpty(),
            isEditing = state.eligibility.existingReview != null,
            isSubmitting = state.isSubmittingReview,
            onSubmit = { rating, comment ->
                viewModel.submitReview(rating = rating, comment = comment) { msg ->
                    showWriteReview = false
                    onShowMessage(msg)
                }
            },
            onDismiss = { showWriteReview = false },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PurchaseBar(state: ProductDetailUiState, total: String, onAdd: () -> Unit, onBuy: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surface) {
        Column {
            HorizontalDivider(color = LocalBrandColors.current.hairline)
            FlowRow(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Column(Modifier.align(Alignment.CenterVertically).padding(end = 8.dp)) {
                    Text(localized("الإجمالي", "Total"), style = MaterialTheme.typography.labelSmall)
                    Text(
                        "\u2066$total\u2069", style = MaterialTheme.typography.titleMedium.copy(fontFeatureSettings = "tnum"),
                        fontWeight = FontWeight.Bold,
                    )
                }
                if (state.selectedStock <= 0) {
                    Button(onClick = {}, enabled = false, shape = MaterialTheme.shapes.small) {
                        Text(localized("هذا الخيار غير متوفر", "Option unavailable"))
                    }
                } else {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        val inset = PaddingValues(horizontal = 12.dp, vertical = 8.dp)
                        OutlinedButton(
                            onClick = onAdd, enabled = state.canAddToCart,
                            contentPadding = inset, shape = MaterialTheme.shapes.small,
                        ) { Text(localized("أضف للسلة", "Add")) }
                        Button(
                            onClick = onBuy, enabled = state.canAddToCart,
                            contentPadding = inset, shape = MaterialTheme.shapes.small,
                        ) { Text(localized("اشتري الآن", "Buy Now")) }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TrustHighlights(settings: StoreSettings) {
    val shipping = if (settings.cartIncentiveEnabled && settings.freeShippingThreshold > 0) {
        val threshold = "\u2066" + formatPrice(settings.freeShippingThreshold, settings.currency, settings.locale) + "\u2069"
        localized("شحن مجاني للطلبات فوق $threshold", "Free shipping over $threshold")
    } else localized("توصيل سريع لكل المحافظات", "Fast nationwide delivery")
    val methods = settings.paymentMethods
    val cod = PaymentMethod.COD in methods
    val online = PaymentMethod.CARD in methods || PaymentMethod.WALLET in methods
    val payment = when {
        cod && online -> localized("الدفع عند الاستلام أو إلكترونياً", "COD & online payment")
        cod -> localized("الدفع عند الاستلام", "Cash on delivery")
        online -> localized("دفع إلكتروني", "Online payment")
        else -> null
    }
    Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = MaterialTheme.shapes.medium) {
        FlowRow(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            TrustHighlight(Icons.Rounded.LocalShipping, shipping)
            payment?.let { TrustHighlight(Icons.Rounded.CreditCard, it) }
            TrustHighlight(Icons.Rounded.Sync, localized("إرجاع واستبدال سهل", "Easy returns & exchanges"))
        }
    }
}

@Composable
private fun TrustHighlight(icon: ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp))
        Text(text, style = MaterialTheme.typography.bodySmall)
    }
}
