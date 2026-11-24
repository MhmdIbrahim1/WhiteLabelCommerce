package com.whitelabel.commerce.feature.home

import android.net.Uri
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.material.icons.rounded.Category
import androidx.compose.material.icons.rounded.Checkroom
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.Diamond
import androidx.compose.material.icons.rounded.HomeWork
import androidx.compose.material.icons.rounded.ShoppingBag
import androidx.compose.material.icons.rounded.Watch
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
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
import com.whitelabel.commerce.core.designsystem.components.ProductCard
import com.whitelabel.commerce.core.designsystem.components.ProductCardSkeleton
import com.whitelabel.commerce.core.designsystem.components.rememberShimmerBrush
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.designsystem.parseHexColorOrDefault
import com.whitelabel.commerce.core.domain.model.Category
import com.whitelabel.commerce.core.domain.model.Product
import com.whitelabel.commerce.core.domain.model.StoreSettings
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onProductClick: (String) -> Unit,
    onCategoryClick: (String?) -> Unit,
    onHeroRoute: (String) -> Unit,
    onShowMessage: (String) -> Unit,
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
            // 1. Dynamic Bilingual Hero Banner CMS (omitted with ZERO spacer when hero_visible == false)
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

fun parseHeroCategoryParam(link: String): String? = runCatching {
    val parsed = Uri.parse(link)
    if (parsed.isHierarchical) parsed.getQueryParameter("category")?.takeIf { it.isNotBlank() } else null
}.getOrNull()
