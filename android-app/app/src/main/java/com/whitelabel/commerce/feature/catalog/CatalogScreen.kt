package com.whitelabel.commerce.feature.catalog

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.RangeSlider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.withResumed
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.LocalStoreSettings
import com.whitelabel.commerce.core.designsystem.components.BrandEmptyState
import com.whitelabel.commerce.core.designsystem.components.FlashRoseColor
import com.whitelabel.commerce.core.designsystem.components.ProductCard
import com.whitelabel.commerce.core.designsystem.components.ProductCardSkeleton
import com.whitelabel.commerce.core.designsystem.formatPrice
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.WishlistToggleOutcome

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun CatalogScreen(
    initialCategoryId: String? = null,
    onConsumeInitialCategory: () -> Unit = {},
    initialFlashDealsOnly: Boolean = false,
    onConsumeInitialFlashDeals: () -> Unit = {},
    autofocusSearch: Boolean = false,
    onProductClick: (String) -> Unit,
    onShowMessage: (String, String?) -> Unit,
    onWishlistSignInPrompt: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: CatalogViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val brandColors = LocalBrandColors.current
    val storeSettings = LocalStoreSettings.current
    val searchFocusRequester = remember { FocusRequester() }
    var needsFocus by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf(autofocusSearch) }
    val keyboard = androidx.compose.ui.platform.LocalSoftwareKeyboardController.current
    val lifecycle = androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
    var showFilterSheet by remember { mutableStateOf(false) }

    LaunchedEffect(initialCategoryId) {
        if (initialCategoryId != null) {
            viewModel.applyExternalCategory(initialCategoryId)
            onConsumeInitialCategory()
        }
    }

    LaunchedEffect(initialFlashDealsOnly) {
        if (initialFlashDealsOnly) {
            viewModel.applyExternalFlashDealsOnly()
            onConsumeInitialFlashDeals()
        }
    }

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = viewModel::refresh,
        modifier = modifier.fillMaxSize(),
    ) {
        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // 1. Smart Bilingual Search Bar + Filter Button (with active count badge)
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedTextField(
                            value = state.searchQuery,
                            onValueChange = viewModel::onSearchQueryChange,
                            placeholder = {
                                Text(
                                    text = localized("ابحث عن المنتجات...", "Search products…"),
                                    maxLines = 1,
                                )
                            },
                            leadingIcon = {
                                Icon(
                                    imageVector = Icons.Rounded.Search,
                                    contentDescription = null,
                                )
                            },
                            trailingIcon = {
                                if (state.searchQuery.isNotEmpty()) {
                                    IconButton(onClick = { viewModel.onSearchQueryChange("") }) {
                                        Icon(
                                            imageVector = Icons.Rounded.Close,
                                            contentDescription = localized("مسح البحث", "Clear search"),
                                        )
                                    }
                                }
                            },
                            singleLine = true,
                            shape = MaterialTheme.shapes.medium,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = MaterialTheme.colorScheme.surface,
                                unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                                unfocusedBorderColor = brandColors.hairline,
                            ),
                            modifier = Modifier
                                .weight(1f)
                                .focusRequester(searchFocusRequester),
                        )

                        if (needsFocus) {
                            LaunchedEffect(Unit) {
                                lifecycle.withResumed {
                                    searchFocusRequester.requestFocus()
                                    keyboard?.show()
                                    needsFocus = false
                                }
                            }
                        }

                        BadgedBox(
                            badge = {
                                if (state.activeFilterCount > 0) {
                                    Badge(
                                        containerColor = MaterialTheme.colorScheme.primary,
                                        contentColor = MaterialTheme.colorScheme.onPrimary,
                                    ) {
                                        Text(
                                            text = state.activeFilterCount.toString(),
                                            style = MaterialTheme.typography.labelSmall,
                                        )
                                    }
                                }
                            },
                        ) {
                            FilledTonalIconButton(
                                onClick = { showFilterSheet = true },
                                colors = IconButtonDefaults.filledTonalIconButtonColors(
                                    containerColor = if (state.activeFilterCount > 0) {
                                        MaterialTheme.colorScheme.primaryContainer
                                    } else {
                                        MaterialTheme.colorScheme.surface
                                    },
                                    contentColor = MaterialTheme.colorScheme.primary,
                                ),
                                modifier = Modifier.size(52.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Tune,
                                    contentDescription = localized("تصفية", "Filter"),
                                )
                            }
                        }
                    }

                    if (state.instantHints.isNotEmpty()) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                text = localized("أقسام مقترحة:", "Suggested:"),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                items(state.instantHints, key = { it.tag }) { hint ->
                                    AssistChip(
                                        onClick = { viewModel.onHintClick(hint) },
                                        label = {
                                            Text(
                                                text = hint.displayLabel,
                                                style = MaterialTheme.typography.labelSmall,
                                            )
                                        },
                                        shape = MaterialTheme.shapes.small,
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // 2. Quick Filter Chips (Flash Deals, In Stock, 4★+, Categories)
            item(span = { GridItemSpan(maxLineSpan) }) {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    item(key = "quick_flash") {
                        FilterChip(
                            selected = state.flashDealsOnly,
                            onClick = viewModel::toggleFlashDealsOnly,
                            label = { Text(localized("عروض مؤقتة", "Flash Deals")) },
                            leadingIcon = {
                                Icon(
                                    imageVector = Icons.Rounded.Bolt,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp),
                                )
                            },
                            shape = MaterialTheme.shapes.small,
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = FlashRoseColor,
                                selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                                selectedLeadingIconColor = MaterialTheme.colorScheme.onPrimary,
                            ),
                        )
                    }
                    item(key = "quick_stock") {
                        FilterChip(
                            selected = state.inStockOnly,
                            onClick = viewModel::toggleInStockOnly,
                            label = { Text(localized("متوفر فقط", "In Stock")) },
                            leadingIcon = if (state.inStockOnly) {
                                {
                                    Icon(
                                        imageVector = Icons.Rounded.Check,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp),
                                    )
                                }
                            } else {
                                null
                            },
                            shape = MaterialTheme.shapes.small,
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                                selectedLabelColor = MaterialTheme.colorScheme.primary,
                                selectedLeadingIconColor = MaterialTheme.colorScheme.primary,
                            ),
                        )
                    }
                    item(key = "quick_rating") {
                        FilterChip(
                            selected = state.minRating != null,
                            onClick = viewModel::toggleFourStarPlus,
                            label = { Text(localized("+4 تقييم", "4★ & Up")) },
                            leadingIcon = {
                                Icon(
                                    imageVector = Icons.Rounded.Star,
                                    contentDescription = null,
                                    modifier = Modifier.size(15.dp),
                                )
                            },
                            shape = MaterialTheme.shapes.small,
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                                selectedLabelColor = MaterialTheme.colorScheme.primary,
                                selectedLeadingIconColor = MaterialTheme.colorScheme.primary,
                            ),
                        )
                    }
                    item(key = "cat_all") {
                        FilterChip(
                            selected = state.selectedCategoryId == null && !state.flashDealsOnly,
                            onClick = { viewModel.onCategorySelect(null) },
                            label = { Text(localized("الكل", "All")) },
                            shape = MaterialTheme.shapes.small,
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MaterialTheme.colorScheme.primary,
                                selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                            ),
                        )
                    }
                    items(state.categories, key = { it.id }) { category ->
                        FilterChip(
                            selected = state.selectedCategoryId == category.id,
                            onClick = { viewModel.onCategorySelect(category.id) },
                            label = { Text(category.displayName) },
                            shape = MaterialTheme.shapes.small,
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MaterialTheme.colorScheme.primary,
                                selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                            ),
                        )
                    }
                }
            }

            // 3. Active Filter Bar / Result Count
            if (!state.isLoading && (state.activeFilterCount > 0 || state.displayedProducts.isNotEmpty())) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = if (state.flashDealsOnly) {
                                localized(
                                    "العروض المؤقتة النشطة (${state.displayedProducts.size})",
                                    "Active Flash Deals (${state.displayedProducts.size})",
                                )
                            } else {
                                localized(
                                    "${state.displayedProducts.size} منتج",
                                    "${state.displayedProducts.size} products",
                                )
                            },
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.SemiBold,
                        )
                        if (state.activeFilterCount > 0) {
                            TextButton(onClick = viewModel::resetAllFilters) {
                                Text(localized("مسح الفلاتر", "Clear filters"))
                            }
                        }
                    }
                }
            }

            val correction = state.correction
            if (!state.isLoading && correction != null && state.displayedProducts.isNotEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    com.whitelabel.commerce.core.designsystem.SearchCorrectionBanner(correction, viewModel::searchInstead)
                }
            } else if (!state.isLoading && state.isClosestSmartMatch && state.displayedProducts.isNotEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Surface(
                        color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.65f),
                        contentColor = MaterialTheme.colorScheme.primary,
                        shape = MaterialTheme.shapes.small,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.AutoAwesome,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                            )
                            Text(
                                text = localized(
                                    "عرض أقرب النتائج الذكية لبحثك",
                                    "Showing closest smart matches for your search",
                                ),
                                style = MaterialTheme.typography.labelMedium,
                            )
                        }
                    }
                }
            }

            // 4. Grid Content
            when {
                state.isLoading -> {
                    items(6) {
                        ProductCardSkeleton()
                    }
                }

                state.errorMessage != null && state.displayedProducts.isEmpty() -> {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Text(
                                text = state.errorMessage.orEmpty(),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.error,
                            )
                            OutlinedButton(onClick = viewModel::loadInitial) {
                                Text(localized("إعادة المحاولة", "Try again"))
                            }
                        }
                    }
                }

                state.displayedProducts.isEmpty() -> {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        BrandEmptyState(
                            icon = Icons.Outlined.SearchOff,
                            title = if (state.flashDealsOnly) {
                                localized("لا توجد عروض مؤقتة مطابقة", "No matching flash deals")
                            } else {
                                localized("لا توجد منتجات مطابقة", "No matching products")
                            },
                            subtitle = localized(
                                "جرّب تعديل خيارات التصفية أو مسح كلمة البحث.",
                                "Try adjusting your filters or clearing your search.",
                            ),
                            actionLabel = localized("عرض كل المنتجات", "View all products"),
                            onAction = {
                                viewModel.onSearchQueryChange("")
                                viewModel.resetAllFilters()
                            },
                        )
                    }
                }

                else -> {
                    items(state.displayedProducts, key = { it.id }) { product ->
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

    if (showFilterSheet) {
        CatalogFilterBottomSheet(
            loadCategory = viewModel::loadCategory,
            state = state,
            currency = storeSettings.currency,
            locale = storeSettings.locale,
            onDismiss = { showFilterSheet = false },
            onReset = {
                viewModel.resetAllFilters()
                showFilterSheet = false
            },
            onApply = { sort, categoryId, inStock, flashOnly, minRating, minPrice, maxPrice ->
                viewModel.applyBottomSheetFilters(
                    sortOption = sort,
                    categoryId = categoryId,
                    inStockOnly = inStock,
                    flashDealsOnly = flashOnly,
                    minRating = minRating,
                    priceMin = minPrice,
                    priceMax = maxPrice,
                )
                showFilterSheet = false
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun CatalogFilterBottomSheet(
    loadCategory: suspend (String, String?) -> Result<com.whitelabel.commerce.core.domain.repository.CatalogSearchResult>,
    state: CatalogUiState,
    currency: String,
    locale: String,
    onDismiss: () -> Unit,
    onReset: () -> Unit,
    onApply: (
        sortOption: CatalogSortOption,
        categoryId: String?,
        inStockOnly: Boolean,
        flashDealsOnly: Boolean,
        minRating: Double?,
        priceMin: Double?,
        priceMax: Double?,
    ) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val minBound = state.catalogMinPrice.toFloat()
    val maxBound = state.catalogMaxPrice.toFloat().coerceAtLeast(minBound)
    val hasPriceRange = maxBound > minBound + 1f

    var draftSort by remember { mutableStateOf(state.sortOption) }
    var draftCategoryId by remember { mutableStateOf(state.selectedCategoryId) }
    var draftInStock by remember { mutableStateOf(state.inStockOnly) }
    var draftFlashOnly by remember { mutableStateOf(state.flashDealsOnly) }
    var draftMinRating by remember { mutableStateOf(state.minRating) }
    var draftPriceRange by remember {
        val start = (state.priceMin?.toFloat() ?: minBound).coerceIn(minBound, maxBound)
        val end = (state.priceMax?.toFloat() ?: maxBound).coerceIn(start, maxBound)
        mutableStateOf(start..end)
    }

    val draftMinPrice = if (hasPriceRange && draftPriceRange.start > minBound + 0.5f) {
        draftPriceRange.start.toDouble()
    } else {
        null
    }
    val draftMaxPrice = if (hasPriceRange && draftPriceRange.endInclusive < maxBound - 0.5f) {
        draftPriceRange.endInclusive.toDouble()
    } else {
        null
    }

    val previewProducts by androidx.compose.runtime.produceState(
        initialValue = state.rawProducts,
        draftCategoryId, state.selectedCategoryId, state.searchQuery, state.exactQuery, state.rawProducts,
    ) {
        value = if (draftCategoryId == state.selectedCategoryId) state.rawProducts else
            loadCategory(state.searchQuery, draftCategoryId).getOrNull()?.products.orEmpty()
    }
    val previewCount = state.copy(rawProducts = previewProducts).filterAndSort(
        inStock = draftInStock,
        flashOnly = draftFlashOnly,
        ratingFloor = draftMinRating,
        minPrice = draftMinPrice,
        maxPrice = draftMaxPrice,
        sort = draftSort,
        categoryOverride = draftCategoryId,
    ).size

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding(),
        ) {
            // Sheet Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = localized("تصفية وترتيب المنتجات", "Filter & Sort"),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                IconButton(onClick = onDismiss) {
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = localized("إغلاق", "Close"),
                    )
                }
            }

            HorizontalDivider()

            Column(
                modifier = Modifier
                    .weight(1f, fill = false)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                // Sort Options
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = localized("الترتيب حسب", "Sort By"),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                    )
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        CatalogSortOption.entries.forEach { option ->
                            FilterChip(
                                selected = draftSort == option,
                                onClick = { draftSort = option },
                                label = { Text(option.labelAr) },
                                shape = MaterialTheme.shapes.small,
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                                    selectedLabelColor = MaterialTheme.colorScheme.primary,
                                ),
                            )
                        }
                    }
                }

                // Price Range Slider
                if (hasPriceRange) {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = localized("نطاق السعر", "Price Range"),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = "${formatPrice(draftPriceRange.start.toDouble(), currency, locale)} – ${formatPrice(draftPriceRange.endInclusive.toDouble(), currency, locale)}",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                        RangeSlider(
                            value = draftPriceRange,
                            onValueChange = { draftPriceRange = it },
                            valueRange = minBound..maxBound,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }

                // Category Single-Select
                if (state.categories.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = localized("القسم", "Category"),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                        )
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            FilterChip(
                                selected = draftCategoryId == null,
                                onClick = { draftCategoryId = null },
                                label = { Text(localized("الكل", "All")) },
                                shape = MaterialTheme.shapes.small,
                            )
                            state.categories.forEach { category ->
                                FilterChip(
                                    selected = draftCategoryId == category.id,
                                    onClick = { draftCategoryId = category.id },
                                    label = { Text(category.displayName) },
                                    shape = MaterialTheme.shapes.small,
                                )
                            }
                        }
                    }
                }

                // Toggles
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = localized("المنتجات المتوفرة فقط", "In Stock Only"),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                        )
                        Switch(
                            checked = draftInStock,
                            onCheckedChange = { draftInStock = it },
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = localized("العروض المؤقتة فقط", "Flash Deals Only"),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                        )
                        Switch(
                            checked = draftFlashOnly,
                            onCheckedChange = { draftFlashOnly = it },
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = localized("تقييم 4 نجوم فأعلى", "Rated 4★ & Up"),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                        )
                        Switch(
                            checked = draftMinRating != null,
                            onCheckedChange = { checked -> draftMinRating = if (checked) 4.0 else null },
                        )
                    }
                }
            }

            HorizontalDivider()

            // Sticky Bottom Bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 14.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedButton(
                    onClick = onReset,
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier
                        .weight(0.4f)
                        .height(48.dp),
                ) {
                    Text(localized("إعادة تعيين", "Reset"))
                }
                Button(
                    onClick = {
                        onApply(
                            draftSort,
                            draftCategoryId,
                            draftInStock,
                            draftFlashOnly,
                            draftMinRating,
                            draftMinPrice,
                            draftMaxPrice,
                        )
                    },
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier
                        .weight(0.6f)
                        .height(48.dp),
                ) {
                    Text(
                        text = localized(
                            "عرض النتائج ($previewCount)",
                            "Show Results ($previewCount)",
                        ),
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
            Spacer(modifier = Modifier.height(4.dp))
        }
    }
}
