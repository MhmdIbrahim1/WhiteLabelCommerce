package com.whitelabel.commerce.feature.catalog

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.SwapVert
import androidx.compose.material3.AssistChip
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.components.BrandEmptyState
import com.whitelabel.commerce.core.designsystem.components.ProductCard
import com.whitelabel.commerce.core.designsystem.components.ProductCardSkeleton
import com.whitelabel.commerce.core.designsystem.localized

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CatalogScreen(
    initialCategoryId: String?,
    onConsumeInitialCategory: () -> Unit,
    onProductClick: (String) -> Unit,
    onShowMessage: (String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: CatalogViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val brandColors = LocalBrandColors.current

    LaunchedEffect(initialCategoryId) {
        if (initialCategoryId != null) {
            viewModel.applyExternalCategory(initialCategoryId)
            onConsumeInitialCategory()
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
            // 1. Smart Bilingual Search Bar + 0ms Synonym Hint Chips
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = state.searchQuery,
                        onValueChange = viewModel::onSearchQueryChange,
                        placeholder = {
                            Text(localized("...بحث", "Search)…"))
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
                        modifier = Modifier.fillMaxWidth(),
                    )

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

            // 2. Category Filter Chips
            item(span = { GridItemSpan(maxLineSpan) }) {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    item {
                        FilterChip(
                            selected = state.selectedCategoryId == null,
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

            // 3. Sort Options Row
            item(span = { GridItemSpan(maxLineSpan) }) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.SwapVert,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(CatalogSortOption.entries) { option ->
                            FilterChip(
                                selected = state.sortOption == option,
                                onClick = { viewModel.onSortSelect(option) },
                                label = {
                                    Text(
                                        text = option.labelAr,
                                        style = MaterialTheme.typography.labelMedium,
                                    )
                                },
                                shape = MaterialTheme.shapes.small,
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                                    selectedLabelColor = MaterialTheme.colorScheme.primary,
                                ),
                            )
                        }
                    }
                }
            }

            // 3b. Closest Smart Match Banner (Phase 7c/7d contract)
            if (!state.isLoading && state.isClosestSmartMatch && state.displayedProducts.isNotEmpty()) {
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
                            title = localized("لا توجد منتجات مطابقة", "No matching products"),
                            subtitle = localized(
                                "جرّب تغيير كلمة البحث أو اختيار قسم آخر.",
                                "Try another keyword or choose a different category.",
                            ),
                            actionLabel = localized("عرض كل المنتجات", "View all products"),
                            onAction = {
                                viewModel.onSearchQueryChange("")
                                viewModel.onCategorySelect(null)
                            },
                        )
                    }
                }

                else -> {
                    items(state.displayedProducts, key = { it.id }) { product ->
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
        }
    }
}
