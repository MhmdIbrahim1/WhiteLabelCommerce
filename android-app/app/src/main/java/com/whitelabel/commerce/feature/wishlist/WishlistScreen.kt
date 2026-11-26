package com.whitelabel.commerce.feature.wishlist

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import com.whitelabel.commerce.core.designsystem.components.SearchAction
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.whitelabel.commerce.core.designsystem.components.BrandEmptyState
import com.whitelabel.commerce.core.designsystem.components.ProductCard
import com.whitelabel.commerce.core.designsystem.components.ProductCardSkeleton
import com.whitelabel.commerce.core.designsystem.localized

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WishlistScreen(
    onBack: () -> Unit,
    onSearch: () -> Unit,
    onProductClick: (String) -> Unit,
    onBrowseCatalog: () -> Unit,
    onOpenAccount: () -> Unit,
    onShowMessage: (String, String?) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: WishlistViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = localized("المفضلة", "Wishlist"),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                    )
                },
                actions = { SearchAction(onSearch) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = localized("رجوع", "Back"),
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
        when {
            !state.isSignedIn -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                        .padding(20.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    BrandEmptyState(
                        icon = Icons.Outlined.FavoriteBorder,
                        title = localized("قائمة المفضلة السحابية", "Your Cloud Wishlist"),
                        subtitle = localized(
                            "سجّل الدخول لحفظ منتجاتك المفضلة ومزامنتها بين التطبيق والموقع واستقبال تنبيهات الأسعار.",
                            "Sign in to save favorite products across app & web and receive price-drop or restock alerts.",
                        ),
                        actionLabel = localized("تسجيل الدخول", "Sign In"),
                        onAction = onOpenAccount,
                    )
                }
            }

            state.isLoading -> {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentPadding = PaddingValues(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(4) {
                        ProductCardSkeleton()
                    }
                }
            }

            state.errorMessage != null -> {
                Box(Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    BrandEmptyState(
                        icon = Icons.Outlined.FavoriteBorder,
                        title = localized("تعذر تحميل المفضلة", "Could not load wishlist"),
                        subtitle = state.errorMessage.orEmpty(),
                        actionLabel = localized("إعادة المحاولة", "Retry"),
                        onAction = { viewModel.loadWishlist(isPullRefresh = true) },
                    )
                }
            }

            state.items.isEmpty() -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                        .padding(20.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    BrandEmptyState(
                        icon = Icons.Outlined.FavoriteBorder,
                        title = localized("قائمة المفضلة فارغة", "Your wishlist is empty"),
                        subtitle = localized(
                            "اضغط على أيقونة القلب بجانب أي منتج يعجبك لحفظه هنا والعودة إليه بسهولة.",
                            "Tap the heart on any product you love to save it here for later.",
                        ),
                        actionLabel = localized("تصفّح المنتجات", "Explore Catalog"),
                        onAction = onBrowseCatalog,
                    )
                }
            }

            else -> {
                PullToRefreshBox(
                    isRefreshing = state.isRefreshing,
                    onRefresh = { viewModel.loadWishlist(isPullRefresh = true) },
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                ) {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        items(state.items, key = { it.id }) { item ->
                            val product = item.product
                            ProductCard(
                                product = product,
                                isWishlisted = true,
                                onToggleWishlist = {
                                    viewModel.removeFromWishlist(product.id)
                                    onShowMessage(
                                        localized(
                                            "تمت الإزالة من المفضلة",
                                            "Removed from wishlist",
                                        ),
                                        null,
                                    )
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
                                            product.imageUrl,
                                        )
                                    }
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}
