package com.whitelabel.commerce.feature.home

import android.net.Uri
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.Category
import androidx.compose.material.icons.rounded.Checkroom
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.Diamond
import androidx.compose.material.icons.rounded.HomeWork
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.ShoppingBag
import androidx.compose.material.icons.rounded.Watch
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.SubcomposeAsyncImage
import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.LocalStoreSettings
import com.whitelabel.commerce.core.designsystem.components.BannerSkeleton
import com.whitelabel.commerce.core.designsystem.components.BrandEmptyState
import com.whitelabel.commerce.core.designsystem.components.CategoryChipsSkeletonRow
import com.whitelabel.commerce.core.designsystem.components.FlashRoseColor
import com.whitelabel.commerce.core.designsystem.components.ProductCard
import com.whitelabel.commerce.core.designsystem.components.ProductCardSkeleton
import com.whitelabel.commerce.core.designsystem.components.rememberShimmerBrush
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.designsystem.parseHexColorOrDefault
import com.whitelabel.commerce.core.domain.model.Category
import com.whitelabel.commerce.core.domain.model.FlashSalePricing
import com.whitelabel.commerce.core.domain.model.Product
import com.whitelabel.commerce.core.domain.model.PromoBannerCampaign
import com.whitelabel.commerce.core.domain.model.StoreSettings
import com.whitelabel.commerce.core.domain.model.WishlistToggleOutcome
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.absoluteValue

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onProductClick: (String) -> Unit,
    onCategoryClick: (String?) -> Unit,
    onViewAllFlashDeals: () -> Unit = { onCategoryClick(null) },
    onHeroRoute: (String) -> Unit,
    onShowMessage: (String) -> Unit,
    onWishlistSignInPrompt: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val settings = LocalStoreSettings.current

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { viewModel.loadHomeData(isPullRefresh = true) },
        modifier = modifier.fillMaxSize(),
    ) {
        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // 0. Prominent Interactive Home Search Bar
            item(span = { GridItemSpan(maxLineSpan) }) {
                OutlinedTextField(
                    value = state.searchQuery,
                    onValueChange = viewModel::onSearchQueryChange,
                    singleLine = true,
                    placeholder = {
                        Text(
                            text = localized(
                                "ابحث عن المنتجات بالاسم أو القسم...",
                                "Search products by name or category…",
                            ),
                            maxLines = 1,
                        )
                    },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Rounded.Search,
                            contentDescription = localized("بحث", "Search"),
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    },
                    trailingIcon = {
                        when {
                            state.isSearching -> {
                                CircularProgressIndicator(
                                    strokeWidth = 2.dp,
                                    modifier = Modifier.size(18.dp),
                                )
                            }
                            state.searchQuery.isNotEmpty() -> {
                                IconButton(onClick = viewModel::clearSearch) {
                                    Icon(
                                        imageVector = Icons.Rounded.Close,
                                        contentDescription = localized("مسح البحث", "Clear search"),
                                    )
                                }
                            }
                        }
                    },
                    shape = MaterialTheme.shapes.medium,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = MaterialTheme.colorScheme.surface,
                        unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            // Live Home Search Results (replaces feed smoothly while typing)
            if (state.isSearchActive) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = localized(
                                "نتائج البحث (${state.searchResults.size})",
                                "Search results (${state.searchResults.size})",
                            ),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                        )
                        TextButton(onClick = viewModel::clearSearch) {
                            Text(localized("إغلاق البحث", "Clear"))
                        }
                    }
                }

                state.correction?.let { correction ->
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        com.whitelabel.commerce.core.designsystem.SearchCorrectionBanner(correction, viewModel::searchInstead)
                    }
                }
                if (state.searchResults.isEmpty() && !state.isSearching) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        BrandEmptyState(
                            icon = Icons.Rounded.Search,
                            title = localized("لا توجد نتائج مطابقة", "No matching products"),
                            subtitle = localized(
                                "جرّب كلمات بحث أخرى أو تصفّح جميع الأقسام.",
                                "Try another search keyword or browse all categories.",
                            ),
                            actionLabel = localized("عرض كل المنتجات", "Browse catalog"),
                            onAction = {
                                viewModel.clearSearch()
                                onCategoryClick(null)
                            },
                        )
                    }
                } else {
                    items(state.searchResults, key = { "search_${it.id}" }) { product: Product ->
                        ProductCard(
                            product = product,
                            isWishlisted = product.id in state.wishlistedProductIds,
                            onToggleWishlist = {
                                viewModel.toggleWishlist(product.id) { outcome ->
                                    if (outcome is WishlistToggleOutcome.RequiresSignIn) {
                                        onWishlistSignInPrompt()
                                    }
                                }
                            },
                            onClick = { onProductClick(product.id) },
                            onQuickAdd = {
                                if (product.sizes.isNotEmpty() || product.colors.isNotEmpty()) {
                                    onProductClick(product.id)
                                } else {
                                    viewModel.quickAddToCart(product)
                                    onShowMessage(
                                        localized(
                                            "تمت إضافة \"${product.displayName}\" إلى السلة",
                                            "Added \"${product.displayName}\" to cart",
                                        ),
                                    )
                                }
                            },
                        )
                    }
                }
            } else {
                // 1. Dynamic Bilingual Hero Banner / Multi-Campaign Promo Carousel (omitted with ZERO spacer when hero_visible == false)
                if (settings.isHeroVisible) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        if (state.isLoading && !settings.isSyncedFromRemote) {
                            BannerSkeleton()
                        } else {
                            PublishedHeroBanner(
                                settings = settings,
                                onCtaNavigate = onHeroRoute,
                            )
                        }
                    }
                }

                // 1b. Flash Deals Horizontal Strip (rendered ONLY when active flash deals exist)
                val activeFlashDeals = state.featuredProducts
                    .filter { it.isInStock && it.isFlashSaleActive() }
                    .sortedBy { FlashSalePricing.parseIsoTimestampMillis(it.flashSaleEndsAt) ?: Long.MAX_VALUE }
                if (activeFlashDeals.isNotEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Surface(
                            color = FlashRoseColor.copy(alpha = 0.05f),
                            shape = MaterialTheme.shapes.large,
                            border = BorderStroke(1.dp, FlashRoseColor.copy(alpha = 0.16f)),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(
                                modifier = Modifier.padding(vertical = 12.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 12.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        Surface(
                                            color = FlashRoseColor.copy(alpha = 0.12f),
                                            shape = CircleShape,
                                            modifier = Modifier.size(28.dp),
                                        ) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Icon(
                                                    imageVector = Icons.Rounded.Bolt,
                                                    contentDescription = null,
                                                    tint = FlashRoseColor,
                                                    modifier = Modifier.size(16.dp),
                                                )
                                            }
                                        }
                                        Column {
                                            Text(
                                                text = localized("عروض مؤقتة", "Flash Deals"),
                                                style = MaterialTheme.typography.titleMedium,
                                                fontWeight = FontWeight.Bold,
                                                color = MaterialTheme.colorScheme.onSurface,
                                            )
                                            Text(
                                                text = localized("عروض لفترة محدودة", "Limited-time offers"),
                                                style = MaterialTheme.typography.labelSmall,
                                                color = FlashRoseColor,
                                            )
                                        }
                                    }
                                    TextButton(onClick = onViewAllFlashDeals) {
                                        Text(localized("عرض الكل", "View all"))
                                    }
                                }

                                LazyRow(
                                    contentPadding = PaddingValues(horizontal = 12.dp),
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                ) {
                                    items(activeFlashDeals, key = { "flash_${it.id}" }) { deal ->
                                        ProductCard(
                                            product = deal,
                                            isWishlisted = deal.id in state.wishlistedProductIds,
                                            onToggleWishlist = {
                                                viewModel.toggleWishlist(deal.id) { outcome ->
                                                    if (outcome is WishlistToggleOutcome.RequiresSignIn) {
                                                        onWishlistSignInPrompt()
                                                    }
                                                }
                                            },
                                            onClick = { onProductClick(deal.id) },
                                            onQuickAdd = {
                                                if (deal.sizes.isNotEmpty() || deal.colors.isNotEmpty()) {
                                                    onProductClick(deal.id)
                                                } else {
                                                    viewModel.quickAddToCart(deal)
                                                    onShowMessage(
                                                        localized(
                                                            "تمت إضافة \"${deal.displayName}\" إلى السلة",
                                                            "Added \"${deal.displayName}\" to cart",
                                                        ),
                                                    )
                                                }
                                            },
                                            modifier = Modifier.width(184.dp),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // 2. Categories Section
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = localized("تسوق حسب القسم", "Shop by category"),
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onBackground,
                            )
                            TextButton(onClick = { onCategoryClick(null) }) {
                                Text(localized("عرض الكل", "View all"))
                            }
                        }

                        if (state.isLoading) {
                            CategoryChipsSkeletonRow()
                        } else if (state.categories.isNotEmpty()) {
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                items(state.categories, key = { it.id }) { category ->
                                    CategoryChipCard(
                                        category = category,
                                        onClick = { onCategoryClick(category.id) },
                                    )
                                }
                            }
                        }
                    }
                }

                // 3. Featured / Latest Products Header
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = localized("أحدث المنتجات", "Latest products"),
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onBackground,
                        )
                        if (!state.isLoading && state.featuredProducts.isNotEmpty()) {
                            Text(
                                text = localized(
                                    "${state.featuredProducts.size} منتج",
                                    "${state.featuredProducts.size} products",
                                ),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }

                // 4. Products Grid / Skeleton / Error / Empty
                when {
                    state.isLoading -> {
                        items(4) {
                            ProductCardSkeleton()
                        }
                    }

                    state.errorMessage != null && state.featuredProducts.isEmpty() -> {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            Card(
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                                shape = MaterialTheme.shapes.medium,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Column(
                                    modifier = Modifier.padding(16.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Text(
                                        text = localized("تعذر تحميل المنتجات", "Unable to load products"),
                                        style = MaterialTheme.typography.titleMedium,
                                        color = MaterialTheme.colorScheme.onErrorContainer,
                                    )
                                    Text(
                                        text = state.errorMessage.orEmpty(),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onErrorContainer,
                                    )
                                    OutlinedButton(onClick = { viewModel.loadHomeData(isPullRefresh = false) }) {
                                        Text(localized("إعادة المحاولة", "Try again"))
                                    }
                                }
                            }
                        }
                    }

                    state.featuredProducts.isEmpty() -> {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            BrandEmptyState(
                                icon = Icons.Outlined.Storefront,
                                title = localized("لا توجد منتجات نشطة حالياً", "No active products"),
                                subtitle = localized(
                                    "اسحب للأسفل لتحديث الكتالوج فور إضافة منتجات جديدة.",
                                    "Pull down to refresh the catalog.",
                                ),
                                actionLabel = localized("تحديث", "Refresh"),
                                onAction = { viewModel.loadHomeData(isPullRefresh = true) },
                            )
                        }
                    }

                    else -> {
                        items(state.featuredProducts, key = { it.id }) { product: Product ->
                            ProductCard(
                                product = product,
                                isWishlisted = product.id in state.wishlistedProductIds,
                                onToggleWishlist = {
                                    viewModel.toggleWishlist(product.id) { outcome ->
                                        if (outcome is WishlistToggleOutcome.RequiresSignIn) {
                                            onWishlistSignInPrompt()
                                        }
                                    }
                                },
                                onClick = { onProductClick(product.id) },
                                onQuickAdd = {
                                    if (product.sizes.isNotEmpty() || product.colors.isNotEmpty()) {
                                        onProductClick(product.id)
                                    } else {
                                        viewModel.quickAddToCart(product)
                                        onShowMessage(
                                            localized(
                                                "تمت إضافة \"${product.displayName}\" إلى السلة",
                                                "Added \"${product.displayName}\" to cart",
                                            ),
                                        )
                                    }
                                },
                            )
                        }
                    }
                }
            }

            item(span = { GridItemSpan(maxLineSpan) }) {
                Text(
                    text = localized(
                        "${settings.storeName} • الإصدار v${BuildConfig.VERSION_NAME}",
                        "${settings.storeName} • Version v${BuildConfig.VERSION_NAME}",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp, bottom = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun PublishedHeroBanner(
    settings: StoreSettings,
    onCtaNavigate: (String) -> Unit,
) {
    val activeCampaigns = settings.hero.activePromoBanners
    if (activeCampaigns.isNotEmpty()) {
        MultiCampaignPromoCarousel(
            campaigns = activeCampaigns,
            isRtl = settings.isRtl,
            autoSlideMs = settings.hero.bannerSpeedMs,
            overlayOpacity = settings.hero.overlayOpacity,
            onNavigate = onCtaNavigate,
        )
        return
    }

    val hero = settings.hero
    val isRtl = settings.isRtl
    val primaryColor = parseHexColorOrDefault(hero.heroBg, MaterialTheme.colorScheme.primary)
    val heroTextColor = parseHexColorOrDefault(hero.heroText, Color.White)
    val customImage = hero.imageUrl?.takeIf { it.isNotBlank() }
    val slideImages = if (customImage != null) listOf(customImage) else settings.banners
    val overlayAlpha = hero.overlayOpacity.coerceIn(0, 80) / 100f

    val badgeText = (if (isRtl) hero.badgeAr.trim() else hero.badgeEn.trim())
        .ifBlank { if (isRtl) hero.badgeEn.trim() else hero.badgeAr.trim() }
        .ifBlank { localized("تشكيلة مختارة", "Curated collection") }

    val titleText = (if (isRtl) hero.titleAr.trim() else hero.titleEn.trim())
        .ifBlank { if (isRtl) hero.titleEn.trim() else hero.titleAr.trim() }
        .ifBlank { localized("اكتشف ${settings.storeName}", "Discover ${settings.storeName}") }

    // Respect exact empty subtitle suppression from web-store Phase 8b contract
    val subtitleText = (if (isRtl) hero.subtitleAr else hero.subtitleEn).trim()

    val ctaText = (if (isRtl) hero.ctaTextAr.trim() else hero.ctaTextEn.trim())
        .ifBlank { if (isRtl) hero.ctaTextEn.trim() else hero.ctaTextAr.trim() }
        .ifBlank { localized("تسوّق الآن", "Shop now") }

    val pagerState = rememberPagerState(pageCount = { slideImages.size.coerceAtLeast(1) })
    LaunchedEffect(slideImages.size, hero.bannerSpeedMs) {
        val speed = hero.bannerSpeedMs
        if (slideImages.size > 1 && speed >= 500) {
            while (true) {
                delay(speed.toLong())
                val next = (pagerState.currentPage + 1) % slideImages.size
                pagerState.animateScrollToPage(next)
            }
        }
    }

    val fallbackGradient = Brush.linearGradient(
        colors = listOf(
            primaryColor,
            primaryColor.copy(alpha = 0.86f),
            MaterialTheme.colorScheme.secondary.copy(alpha = 0.88f),
        ),
    )

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(MaterialTheme.shapes.large)
                .background(fallbackGradient),
        ) {
            if (slideImages.isNotEmpty()) {
                HorizontalPager(
                    state = pagerState,
                    modifier = Modifier.matchParentSize(),
                ) { page ->
                    SubcomposeAsyncImage(
                        model = slideImages[page],
                        contentDescription = titleText,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                        loading = {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(rememberShimmerBrush()),
                            )
                        },
                        error = {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(fallbackGradient),
                            )
                        },
                    )
                }

                // Scrim matching web-store hero.tsx linear-gradient(180deg, 0.65*alpha -> alpha)
                Box(
                    modifier = Modifier
                        .matchParentSize()
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    Color(0xFF0A0F1C).copy(alpha = overlayAlpha * 0.65f),
                                    Color(0xFF0A0F1C).copy(alpha = overlayAlpha),
                                ),
                            ),
                        ),
                )
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (hero.badgeVisible && badgeText.isNotBlank()) {
                    Surface(
                        color = Color.White.copy(alpha = 0.18f),
                        contentColor = heroTextColor,
                        shape = MaterialTheme.shapes.extraSmall,
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.AutoAwesome,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp),
                            )
                            Text(
                                text = badgeText,
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }

                Text(
                    text = titleText,
                    style = MaterialTheme.typography.headlineSmall,
                    color = heroTextColor,
                    fontWeight = FontWeight.Bold,
                )

                if (subtitleText.isNotBlank()) {
                    Text(
                        text = subtitleText,
                        style = MaterialTheme.typography.bodyMedium,
                        color = heroTextColor.copy(alpha = 0.92f),
                    )
                }

                if (hero.ctaVisible) {
                    Button(
                        onClick = { onCtaNavigate(hero.ctaLink.ifBlank { "/products" }) },
                        shape = MaterialTheme.shapes.small,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color.White,
                            contentColor = primaryColor,
                        ),
                    ) {
                        Text(
                            text = ctaText,
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                        )
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowForward,
                            contentDescription = null,
                            modifier = Modifier
                                .padding(start = 6.dp)
                                .size(16.dp),
                        )
                    }
                }
            }
        }

        if (slideImages.size > 1) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                repeat(slideImages.size) { index ->
                    val isSelected = pagerState.currentPage == index
                    val width by animateDpAsState(
                        targetValue = if (isSelected) 22.dp else 7.dp,
                        label = "heroDotWidth",
                    )
                    val color by animateColorAsState(
                        targetValue = if (isSelected) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.outlineVariant
                        },
                        label = "heroDotColor",
                    )
                    Box(
                        modifier = Modifier
                            .padding(horizontal = 3.dp)
                            .height(7.dp)
                            .width(width)
                            .clip(CircleShape)
                            .background(color),
                    )
                }
            }
        }
    }
}

@Composable
private fun CategoryChipCard(
    category: Category,
    onClick: () -> Unit,
) {
    val brandColors = LocalBrandColors.current
    Surface(
        onClick = onClick,
        color = MaterialTheme.colorScheme.surface,
        contentColor = MaterialTheme.colorScheme.onSurface,
        shape = MaterialTheme.shapes.medium,
        border = BorderStroke(1.dp, brandColors.hairline),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Surface(
                color = MaterialTheme.colorScheme.primaryContainer,
                shape = CircleShape,
                modifier = Modifier.size(30.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = categoryIconFor(category),
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(16.dp),
                    )
                }
            }
            Text(
                text = category.displayName,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

private fun categoryIconFor(category: Category): ImageVector {
    val key = "${category.slug} ${category.name} ${category.nameEn.orEmpty()}".lowercase()
    return when {
        "accessor" in key || "إكسسوار" in key || "حقيب" in key || "bag" in key -> Icons.Rounded.ShoppingBag
        "cloth" in key || "fashion" in key || "ملابس" in key || "أزياء" in key -> Icons.Rounded.Checkroom
        "watch" in key || "ساعات" in key -> Icons.Rounded.Watch
        "electr" in key || "tech" in key || "إلكترون" in key -> Icons.Rounded.Devices
        "jewel" in key || "مجوهرات" in key -> Icons.Rounded.Diamond
        "home" in key || "منزل" in key -> Icons.Rounded.HomeWork
        else -> Icons.Rounded.Category
    }
}

@Composable
private fun MultiCampaignPromoCarousel(
    campaigns: List<PromoBannerCampaign>,
    isRtl: Boolean,
    autoSlideMs: Int,
    overlayOpacity: Int,
    onNavigate: (String) -> Unit,
) {
    val pagerState = rememberPagerState(pageCount = { campaigns.size })
    val coroutineScope = rememberCoroutineScope()
    val overlayAlpha = overlayOpacity.coerceIn(0, 80) / 100f
    val hasMultiple = campaigns.size > 1
    val effectiveIntervalMs = if (autoSlideMs == 0) 0L else autoSlideMs.toLong().coerceAtLeast(2000L)

    // Smart auto-play: advances smoothly with tween(650, FastOutSlowInEasing) and pauses while dragging
    LaunchedEffect(campaigns.size, effectiveIntervalMs, pagerState.isScrollInProgress) {
        if (hasMultiple && effectiveIntervalMs >= 500L && !pagerState.isScrollInProgress) {
            while (true) {
                delay(effectiveIntervalMs)
                if (!pagerState.isScrollInProgress) {
                    val next = (pagerState.currentPage + 1) % campaigns.size
                    pagerState.animateScrollToPage(
                        page = next,
                        animationSpec = tween(
                            durationMillis = 650,
                            easing = FastOutSlowInEasing,
                        ),
                    )
                }
            }
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        HorizontalPager(
            state = pagerState,
            contentPadding = PaddingValues(horizontal = if (hasMultiple) 14.dp else 0.dp),
            pageSpacing = 12.dp,
            beyondViewportPageCount = 1,
            modifier = Modifier
                .fillMaxWidth()
                .height(224.dp),
        ) { page ->
            val campaign = campaigns[page]
            val rawOffset = pagerState.getOffsetDistanceInPages(page)
            val pageOffset = rawOffset.absoluteValue.coerceIn(0f, 1f)
            val directionSign = if (isRtl) -1f else 1f

            val startColor = parseHexColorOrDefault(campaign.gradientStart, MaterialTheme.colorScheme.primary)
            val endColor = parseHexColorOrDefault(campaign.gradientEnd, MaterialTheme.colorScheme.secondary)
            val fallbackGradient = Brush.linearGradient(colors = listOf(startColor, endColor))

            val badge = (if (isRtl) campaign.badgeAr.trim() else campaign.badgeEn.trim())
                .ifBlank { if (isRtl) campaign.badgeEn.trim() else campaign.badgeAr.trim() }
            val title = (if (isRtl) campaign.titleAr.trim() else campaign.titleEn.trim())
                .ifBlank { if (isRtl) campaign.titleEn.trim() else campaign.titleAr.trim() }
            val subtitle = (if (isRtl) campaign.subtitleAr.trim() else campaign.subtitleEn.trim())
                .ifBlank { if (isRtl) campaign.subtitleEn.trim() else campaign.subtitleAr.trim() }
            val cta = (if (isRtl) campaign.ctaTextAr.trim() else campaign.ctaTextEn.trim())
                .ifBlank { if (isRtl) campaign.ctaTextEn.trim() else campaign.ctaTextAr.trim() }
                .ifBlank { localized("تسوّق الآن", "Shop now") }
            val targetLink = campaign.ctaLink.ifBlank { "/products" }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer {
                        val scale = 0.93f + (1f - pageOffset) * 0.07f
                        scaleX = scale
                        scaleY = scale
                        alpha = 0.72f + (1f - pageOffset) * 0.28f
                    }
                    .clip(MaterialTheme.shapes.large)
                    .background(fallbackGradient)
                    .clickable { onNavigate(targetLink) },
            ) {
                if (!campaign.imageUrl.isNullOrBlank()) {
                    SubcomposeAsyncImage(
                        model = campaign.imageUrl,
                        contentDescription = title,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxSize()
                            .graphicsLayer {
                                scaleX = 1.10f
                                scaleY = 1.10f
                                translationX = rawOffset * 34f * directionSign
                            },
                        loading = {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(rememberShimmerBrush()),
                            )
                        },
                        error = {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(fallbackGradient),
                            )
                        },
                    )
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                Brush.verticalGradient(
                                    colors = listOf(
                                        Color(0xFF0A0F1C).copy(alpha = (overlayAlpha * 0.65f).coerceIn(0.22f, 0.7f)),
                                        Color(0xFF0A0F1C).copy(alpha = (overlayAlpha + 0.18f).coerceIn(0.52f, 0.88f)),
                                    ),
                                ),
                            ),
                    )
                }

                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(18.dp)
                        .graphicsLayer {
                            translationX = rawOffset * -22f * directionSign
                            alpha = 0.65f + (1f - pageOffset) * 0.35f
                        },
                    verticalArrangement = Arrangement.SpaceBetween,
                ) {
                    if (badge.isNotEmpty()) {
                        Surface(
                            color = Color.White.copy(alpha = 0.2f),
                            shape = CircleShape,
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.AutoAwesome,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(13.dp),
                                )
                                Text(
                                    text = badge,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.titleLarge,
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            maxLines = 2,
                        )
                        if (subtitle.isNotEmpty()) {
                            Text(
                                text = subtitle,
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.White.copy(alpha = 0.92f),
                                maxLines = 2,
                            )
                        }
                        Button(
                            onClick = { onNavigate(targetLink) },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color.White,
                                contentColor = startColor,
                            ),
                            shape = CircleShape,
                            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                            modifier = Modifier.padding(top = 4.dp),
                        ) {
                            Text(
                                text = cta,
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Bold,
                            )
                            Icon(
                                imageVector = Icons.AutoMirrored.Rounded.ArrowForward,
                                contentDescription = null,
                                modifier = Modifier
                                    .padding(start = 6.dp)
                                    .size(15.dp),
                            )
                        }
                    }
                }
            }
        }

        if (hasMultiple) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                campaigns.indices.forEach { index ->
                    val selected = pagerState.currentPage == index
                    val width by animateDpAsState(
                        targetValue = if (selected) 26.dp else 7.dp,
                        animationSpec = tween(durationMillis = 280, easing = FastOutSlowInEasing),
                        label = "promo_dot_width_$index",
                    )
                    val color by animateColorAsState(
                        targetValue = if (selected) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.28f)
                        },
                        label = "promo_dot_color_$index",
                    )
                    Box(
                        modifier = Modifier
                            .padding(horizontal = 3.dp)
                            .height(7.dp)
                            .width(width)
                            .clip(CircleShape)
                            .background(color)
                            .clickable {
                                coroutineScope.launch {
                                    pagerState.animateScrollToPage(
                                        page = index,
                                        animationSpec = tween(
                                            durationMillis = 650,
                                            easing = FastOutSlowInEasing,
                                        ),
                                    )
                                }
                            },
                    )
                }
            }
        }
    }
}

fun parseHeroCategoryParam(link: String): String? = runCatching {
    val parsed = Uri.parse(link)
    if (parsed.isHierarchical) parsed.getQueryParameter("category")?.takeIf { it.isNotBlank() } else null
}.getOrNull()
