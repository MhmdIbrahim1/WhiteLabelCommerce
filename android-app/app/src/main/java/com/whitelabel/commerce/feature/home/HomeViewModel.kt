package com.whitelabel.commerce.feature.home

import com.whitelabel.commerce.core.designsystem.localized
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.whitelabel.commerce.core.data.local.RecentlyViewedStore
import com.whitelabel.commerce.core.domain.model.Category
import com.whitelabel.commerce.core.domain.model.Product
import com.whitelabel.commerce.core.domain.model.StoreSettings
import com.whitelabel.commerce.core.domain.model.WishlistToggleOutcome
import com.whitelabel.commerce.core.domain.repository.CartRepository
import com.whitelabel.commerce.core.domain.repository.CatalogRepository
import com.whitelabel.commerce.core.domain.repository.FlashSaleFeed
import com.whitelabel.commerce.core.domain.repository.StoreRepository
import com.whitelabel.commerce.core.domain.repository.WishlistRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import com.whitelabel.commerce.core.domain.repository.SearchCorrection
import com.whitelabel.commerce.core.domain.search.LocalCatalogSearch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
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

data class HomeUiState(
    val storeSettings: StoreSettings = StoreSettings(),
    val categories: List<Category> = emptyList(),
    val featuredProducts: List<Product> = emptyList(),
    val flashSales: FlashSaleFeed = FlashSaleFeed(emptyList(), null),
    val flashSalesLoadFailed: Boolean = false,
    val wishlistedProductIds: Set<String> = emptySet(),
    val searchQuery: String = "",
    val searchResults: List<Product> = emptyList(),
    val correction: SearchCorrection? = null,
    val isSearching: Boolean = false,
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
) {
    val isSearchActive: Boolean
        get() = searchQuery.trim().isNotEmpty()
}

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val storeRepository: StoreRepository,
    private val catalogRepository: CatalogRepository,
    private val cartRepository: CartRepository,
    private val wishlistRepository: WishlistRepository,
    recentlyViewedStore: RecentlyViewedStore,
) : ViewModel() {

    val recentlyViewed = recentlyViewedStore.products(catalogRepository)
    private val localState = MutableStateFlow(HomeUiState())
    private var searchJob: Job? = null
    private var flashJob: Job? = null

    val uiState: StateFlow<HomeUiState> = combine(
        storeRepository.storeSettings,
        localState,
        wishlistRepository.wishlistedProductIds,
    ) { settings, state, wishIds ->
        state.copy(
            storeSettings = settings,
            wishlistedProductIds = wishIds,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = HomeUiState(
            storeSettings = storeRepository.storeSettings.value,
            wishlistedProductIds = wishlistRepository.wishlistedProductIds.value,
        ),
    )

    init {
        loadHomeData(isPullRefresh = false)
    }

    fun loadHomeData(isPullRefresh: Boolean = false) {
        if (isPullRefresh) refreshFlashSales()
        viewModelScope.launch {
            localState.update {
                it.copy(
                    isLoading = !isPullRefresh && it.featuredProducts.isEmpty(),
                    isRefreshing = isPullRefresh,
                    errorMessage = null,
                )
            }

            if (isPullRefresh) launch(kotlinx.coroutines.Dispatchers.IO) { storeRepository.refreshStoreSettings() }
            val categoriesDeferred = async(kotlinx.coroutines.Dispatchers.IO) { catalogRepository.getCategories() }
            val productsDeferred = async(kotlinx.coroutines.Dispatchers.IO) { catalogRepository.getActiveProducts(limit = 20) }

            val categoriesResult = categoriesDeferred.await()
            val productsResult = productsDeferred.await()
            if (isPullRefresh) flashJob?.join()
            val firstError = categoriesResult.exceptionOrNull() ?: productsResult.exceptionOrNull()

            localState.update { prev ->
                val nextFeatured = productsResult.getOrElse { prev.featuredProducts }
                prev.copy(
                    categories = categoriesResult.getOrElse { prev.categories },
                    featuredProducts = nextFeatured,
                    isLoading = false,
                    isRefreshing = false,
                    errorMessage = if (firstError == null) null else localized("تعذر تحميل المتجر. حاول مرة أخرى.", "Could not load the store. Please try again."),
                )
            }
        }
    }

    fun refreshFlashSales() {
        if (flashJob?.isActive == true) return
        flashJob = viewModelScope.launch {
            catalogRepository.getFlashSales(limit = 8).onSuccess { feed ->
                localState.update { it.copy(flashSales = feed, flashSalesLoadFailed = false) }
            }.onFailure {
                localState.update { it.copy(flashSalesLoadFailed = true) }
            }
        }
    }

    fun onSearchQueryChange(query: String) = search(query, exact = false)

    fun searchInstead() {
        localState.value.correction?.let { search(it.original, exact = true) }
    }

    private fun search(query: String, exact: Boolean) {
        searchJob?.cancel()
        val state = localState.value
        val trimmed = query.trim()
        localState.update { it.copy(searchQuery = query, correction = null, searchResults = emptyList(), isSearching = trimmed.isNotEmpty()) }
        if (trimmed.isEmpty()) return
        searchJob = viewModelScope.launch {
            val instant = withContext(Dispatchers.Default) {
                LocalCatalogSearch.search(state.featuredProducts, state.categories, trimmed, exact)
            }
            localState.update { it.copy(searchResults = instant.products, correction = instant.correction) }
            delay(180)
            catalogRepository.searchProducts(query = trimmed, limit = 24, exact = exact)
                .onSuccess { res ->
                    localState.update { it.copy(searchResults = res.products, correction = res.correction, isSearching = false) }
                }
                .onFailure { localState.update { it.copy(isSearching = false) } }
        }
    }

    fun clearSearch() {
        searchJob?.cancel()
        localState.update {
            it.copy(
                searchQuery = "",
                correction = null,
                searchResults = emptyList(),
                isSearching = false,
            )
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

    fun toggleWishlist(
        productId: String,
        onOutcome: (WishlistToggleOutcome) -> Unit,
    ) {
        viewModelScope.launch {
            onOutcome(wishlistRepository.toggleWishlist(productId))
        }
    }
}
