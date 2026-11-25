package com.whitelabel.commerce.feature.catalog

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.Category
import com.whitelabel.commerce.core.domain.model.Product
import com.whitelabel.commerce.core.domain.model.WishlistToggleOutcome
import com.whitelabel.commerce.core.domain.repository.CartRepository
import com.whitelabel.commerce.core.domain.repository.CatalogRepository
import com.whitelabel.commerce.core.domain.repository.WishlistRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import kotlin.math.ceil
import kotlin.math.floor

enum class CatalogSortOption(private val arabicText: String) {
    RELEVANCE("الأكثر صلة"),
    PRICE_LOW_TO_HIGH("الأقل سعراً"),
    PRICE_HIGH_TO_LOW("الأعلى سعراً"),
    TOP_RATED("الأعلى تقييماً"),
    NEWEST("الأحدث");

    val labelAr: String
        get() = localized(
            arabicText,
            when (this) {
                RELEVANCE -> "Relevance"
                PRICE_LOW_TO_HIGH -> "Price: Low to High"
                PRICE_HIGH_TO_LOW -> "Price: High to Low"
                TOP_RATED -> "Top Rated"
                NEWEST -> "Newest"
            },
        )
}

data class CatalogUiState(
    val categories: List<Category> = emptyList(),
    val rawProducts: List<Product> = emptyList(),
    val wishlistedProductIds: Set<String> = emptySet(),
    val selectedCategoryId: String? = null,
    val searchQuery: String = "",
    val instantHints: List<InstantSearchHint> = emptyList(),
    val isClosestSmartMatch: Boolean = false,
    val sortOption: CatalogSortOption = CatalogSortOption.RELEVANCE,
    val inStockOnly: Boolean = false,
    val flashDealsOnly: Boolean = false,
    val minRating: Double? = null,
    val priceMin: Double? = null,
    val priceMax: Double? = null,
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
) {
    val catalogMinPrice: Double
        get() = rawProducts.minOfOrNull { it.effectivePrice() }?.let { floor(it) } ?: 0.0

    val catalogMaxPrice: Double
        get() = rawProducts.maxOfOrNull { it.effectivePrice() }?.let { ceil(it) } ?: 0.0

    val hasPriceFilter: Boolean
        get() = (priceMin != null && priceMin > catalogMinPrice + 0.01) ||
            (priceMax != null && catalogMaxPrice > 0.0 && priceMax < catalogMaxPrice - 0.01)

    val activeFilterCount: Int
        get() {
            var count = 0
            if (selectedCategoryId != null) count++
            if (inStockOnly) count++
            if (flashDealsOnly) count++
            if (minRating != null) count++
            if (hasPriceFilter) count++
            if (sortOption != CatalogSortOption.RELEVANCE) count++
            return count
        }

    fun filterAndSort(
        inStock: Boolean = inStockOnly,
        flashOnly: Boolean = flashDealsOnly,
        ratingFloor: Double? = minRating,
        minPrice: Double? = priceMin,
        maxPrice: Double? = priceMax,
        sort: CatalogSortOption = sortOption,
        categoryOverride: String? = selectedCategoryId,
        nowMillis: Long = System.currentTimeMillis(),
    ): List<Product> {
        val filtered = rawProducts.filter { product ->
            if (categoryOverride != null && selectedCategoryId == null && product.categoryId != categoryOverride) {
                return@filter false
            }
            if (inStock && !product.isInStock) return@filter false
            if (flashOnly && !product.isFlashSaleActive(nowMillis)) return@filter false
            if (ratingFloor != null && product.avgRating < ratingFloor) return@filter false
            val effPrice = product.effectivePrice(nowMillis)
            if (minPrice != null && effPrice < minPrice - 0.001) return@filter false
            if (maxPrice != null && effPrice > maxPrice + 0.001) return@filter false
            true
        }
        return when (sort) {
            CatalogSortOption.RELEVANCE -> filtered
            CatalogSortOption.PRICE_LOW_TO_HIGH -> filtered.sortedBy { it.effectivePrice(nowMillis) }
            CatalogSortOption.PRICE_HIGH_TO_LOW -> filtered.sortedByDescending { it.effectivePrice(nowMillis) }
            CatalogSortOption.TOP_RATED -> filtered.sortedWith(
                compareByDescending<Product> { it.avgRating }.thenByDescending { it.reviewCount },
            )
            CatalogSortOption.NEWEST -> filtered.sortedByDescending { it.createdAt.orEmpty() }
        }
    }

    val displayedProducts: List<Product>
        get() = filterAndSort()
}

@HiltViewModel
class CatalogViewModel @Inject constructor(
    private val catalogRepository: CatalogRepository,
    private val cartRepository: CartRepository,
    private val wishlistRepository: WishlistRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CatalogUiState())
    val uiState: StateFlow<CatalogUiState> = combine(
        _uiState,
        wishlistRepository.wishlistedProductIds,
    ) { state, wishIds ->
        state.copy(wishlistedProductIds = wishIds)
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = CatalogUiState(
            wishlistedProductIds = wishlistRepository.wishlistedProductIds.value,
        ),
    )

    fun toggleWishlist(
        productId: String,
        onOutcome: (WishlistToggleOutcome) -> Unit,
    ) {
        viewModelScope.launch {
            onOutcome(wishlistRepository.toggleWishlist(productId))
        }
    }

    private var searchJob: Job? = null

    init {
        loadInitial()
    }

    fun applyExternalCategory(categoryIdOrSlug: String?) {
        val resolvedId = if (categoryIdOrSlug.isNullOrBlank()) {
            null
        } else {
            val cats = _uiState.value.categories
            cats.firstOrNull {
                it.id.equals(categoryIdOrSlug, ignoreCase = true) ||
                    it.slug.equals(categoryIdOrSlug, ignoreCase = true)
            }?.id ?: categoryIdOrSlug
        }
        if (_uiState.value.selectedCategoryId != resolvedId || _uiState.value.flashDealsOnly) {
            _uiState.update {
                it.copy(
                    selectedCategoryId = resolvedId,
                    flashDealsOnly = false,
                )
            }
            fetchProducts(isPullRefresh = false)
        }
    }

    fun applyExternalFlashDealsOnly() {
        val categoryChanged = _uiState.value.selectedCategoryId != null
        _uiState.update {
            it.copy(
                selectedCategoryId = null,
                flashDealsOnly = true,
            )
        }
        if (categoryChanged || _uiState.value.rawProducts.isEmpty()) {
            fetchProducts(isPullRefresh = false)
        }
    }

    fun loadInitial() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            val categoriesDeferred = async { catalogRepository.getCategories() }
            val current = _uiState.value
            val productsDeferred = async {
                if (current.searchQuery.isNotBlank()) {
                    catalogRepository.searchProducts(
                        query = current.searchQuery,
                        categoryId = current.selectedCategoryId,
                    )
                } else {
                    catalogRepository.getActiveProducts(
                        categoryId = current.selectedCategoryId,
                    ).map { com.whitelabel.commerce.core.domain.repository.CatalogSearchResult(it, false) }
                }
            }

            val categoriesResult = categoriesDeferred.await()
            val productsResult = productsDeferred.await()
            val error = categoriesResult.exceptionOrNull() ?: productsResult.exceptionOrNull()

            _uiState.update { prev ->
                val searchRes = productsResult.getOrNull()
                prev.copy(
                    categories = categoriesResult.getOrElse { prev.categories },
                    rawProducts = searchRes?.products ?: prev.rawProducts,
                    isClosestSmartMatch = searchRes?.isClosestSmartMatch ?: false,
                    isLoading = false,
                    isRefreshing = false,
                    errorMessage = error?.localizedMessage,
                )
            }
        }
    }

    fun refresh() {
        fetchProducts(isPullRefresh = true)
    }

    fun onSearchQueryChange(query: String) {
        val hints = SearchSynonyms.getInstantHints(query)
        _uiState.update { it.copy(searchQuery = query, instantHints = hints) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(180)
            fetchProducts(isPullRefresh = false)
        }
    }

    fun onHintClick(hint: InstantSearchHint) {
        val q = hint.displayQuery
        _uiState.update { it.copy(searchQuery = q, instantHints = emptyList()) }
        searchJob?.cancel()
        fetchProducts(isPullRefresh = false)
    }

    fun onCategorySelect(categoryId: String?) {
        if (_uiState.value.selectedCategoryId == categoryId) return
        _uiState.update {
            it.copy(
                selectedCategoryId = categoryId,
                priceMin = null,
                priceMax = null,
            )
        }
        fetchProducts(isPullRefresh = false)
    }

    fun onSortSelect(sortOption: CatalogSortOption) {
        _uiState.update { it.copy(sortOption = sortOption) }
    }

    fun toggleInStockOnly() {
        _uiState.update { it.copy(inStockOnly = !it.inStockOnly) }
    }

    fun toggleFlashDealsOnly() {
        _uiState.update { it.copy(flashDealsOnly = !it.flashDealsOnly) }
    }

    fun toggleFourStarPlus() {
        _uiState.update { it.copy(minRating = if (it.minRating != null) null else 4.0) }
    }

    fun applyBottomSheetFilters(
        sortOption: CatalogSortOption,
        categoryId: String?,
        inStockOnly: Boolean,
        flashDealsOnly: Boolean,
        minRating: Double?,
        priceMin: Double?,
        priceMax: Double?,
    ) {
        val categoryChanged = _uiState.value.selectedCategoryId != categoryId
        _uiState.update {
            it.copy(
                sortOption = sortOption,
                selectedCategoryId = categoryId,
                inStockOnly = inStockOnly,
                flashDealsOnly = flashDealsOnly,
                minRating = minRating,
                priceMin = priceMin,
                priceMax = priceMax,
            )
        }
        if (categoryChanged) {
            fetchProducts(isPullRefresh = false)
        }
    }

    fun resetAllFilters() {
        val hadCategory = _uiState.value.selectedCategoryId != null
        _uiState.update {
            it.copy(
                selectedCategoryId = null,
                sortOption = CatalogSortOption.RELEVANCE,
                inStockOnly = false,
                flashDealsOnly = false,
                minRating = null,
                priceMin = null,
                priceMax = null,
            )
        }
        if (hadCategory) {
            fetchProducts(isPullRefresh = false)
        }
    }

    fun quickAddToCart(product: Product) {
        viewModelScope.launch {
            cartRepository.addProduct(
                product = product,
                quantity = 1,
                selectedSize = product.sizes.firstOrNull(),
                selectedColor = product.colors.firstOrNull(),
            )
        }
    }

    private fun fetchProducts(isPullRefresh: Boolean) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoading = !isPullRefresh,
                    isRefreshing = isPullRefresh,
                    errorMessage = null,
                )
            }
            val current = _uiState.value
            val result = if (current.searchQuery.isNotBlank()) {
                catalogRepository.searchProducts(
                    query = current.searchQuery,
                    categoryId = current.selectedCategoryId,
                )
            } else {
                catalogRepository.getActiveProducts(
                    categoryId = current.selectedCategoryId,
                ).map { com.whitelabel.commerce.core.domain.repository.CatalogSearchResult(it, false) }
            }

            result.onSuccess { searchResult ->
                _uiState.update {
                    it.copy(
                        rawProducts = searchResult.products,
                        isClosestSmartMatch = searchResult.isClosestSmartMatch,
                        isLoading = false,
                        isRefreshing = false,
                    )
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        errorMessage = error.localizedMessage,
                    )
                }
            }
        }
    }
}
