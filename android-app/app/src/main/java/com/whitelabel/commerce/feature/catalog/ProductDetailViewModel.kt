package com.whitelabel.commerce.feature.catalog

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.whitelabel.commerce.core.data.local.RecentlyViewedStore
import com.whitelabel.commerce.core.data.remote.runSuspendCatching
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.AuthSessionState
import com.whitelabel.commerce.core.domain.model.Product
import com.whitelabel.commerce.core.domain.model.ProductReview
import com.whitelabel.commerce.core.domain.model.ReviewEligibility
import com.whitelabel.commerce.core.domain.model.ReviewFormatting
import com.whitelabel.commerce.core.domain.model.WishlistToggleOutcome
import com.whitelabel.commerce.core.domain.repository.AuthRepository
import com.whitelabel.commerce.core.domain.repository.CartRepository
import com.whitelabel.commerce.core.domain.repository.CatalogRepository
import com.whitelabel.commerce.core.domain.repository.ReviewRepository
import com.whitelabel.commerce.core.domain.repository.WishlistRepository
import com.whitelabel.commerce.core.notifications.FcmTokenManager
import com.whitelabel.commerce.core.notifications.NotificationRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.retryWhen
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import com.whitelabel.commerce.core.domain.model.CartItem
import com.whitelabel.commerce.core.domain.model.remainingQuantity
import com.whitelabel.commerce.core.domain.model.quantityLimitHint
import com.whitelabel.commerce.core.domain.repository.StoreRepository
import javax.inject.Inject
import java.util.UUID

data class ProductDetailUiState(
    val product: Product? = null,
    val selectedSize: String? = null,
    val selectedColor: String? = null,
    val quantity: Int = 1,
    val cartLines: List<CartItem> = emptyList(),
    val defaultLimit: Int? = 10,
    val isLoading: Boolean = true,
    val errorMessage: String? = null,
    val isSubscribingRestock: Boolean = false,
    val restockSubscribed: Boolean = false,
    val restockError: String? = null,
    val isWishlisted: Boolean = false,
    val wishlistedProductIds: Set<String> = emptySet(),
    val isSignedIn: Boolean = false,
    val userId: String? = null,
    val sendingFollowUp: Boolean = false,
    val followUpFailed: Boolean = false,
    val reviews: List<ProductReview> = emptyList(),
    val eligibility: ReviewEligibility = ReviewEligibility(),
    val isSubmittingReview: Boolean = false,
    val reviewSubmitError: String? = null,
    val relatedProducts: List<Product> = emptyList(),
    val isAdding: Boolean = false,
) {
    val selectedStock: Int get() = product?.let { it.inventory.stock(selectedColor, selectedSize, it.stock) } ?: 0
    val remaining: Int get() = product?.let {
        cartLines.remainingQuantity(it.id, selectedSize, selectedColor, selectedStock, it.stock, it.maxOrderQty, defaultLimit).coerceAtLeast(0)
    } ?: 0
    val canAddToCart: Boolean
        get() {
            val p = product ?: return false
            if (isAdding || selectedStock <= 0 || quantity <= 0 || quantity > remaining) return false
            if (p.sizes.isNotEmpty() && selectedSize.isNullOrBlank()) return false
            if (p.colors.isNotEmpty() && selectedColor.isNullOrBlank()) return false
            return true
        }

    fun selectOption(color: String?, size: String?) =
        if (selectedColor == color && selectedSize == size) this else copy(
            selectedColor = color, selectedSize = size, quantity = 1,
            restockSubscribed = false, isSubscribingRestock = false, restockError = null,
        )
}

@HiltViewModel
class ProductDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val catalogRepository: CatalogRepository,
    private val cartRepository: CartRepository,
    storeRepository: StoreRepository,
    private val notificationRepository: NotificationRepository,
    private val fcmTokenManager: FcmTokenManager,
    private val reviewRepository: ReviewRepository,
    private val wishlistRepository: WishlistRepository,
    private val authRepository: AuthRepository,
    private val recentlyViewedStore: RecentlyViewedStore,
) : ViewModel() {

    private val productRoute: String = checkNotNull(savedStateHandle["productId"])
    private var restockJob: Job? = null
    val recentlyViewed = recentlyViewedStore.products(catalogRepository)

    private val _uiState = MutableStateFlow(ProductDetailUiState())
    val uiState: StateFlow<ProductDetailUiState> = combine(
        _uiState,
        wishlistRepository.wishlistedProductIds,
        authRepository.sessionState,
        cartRepository.cartItems,
        storeRepository.storeSettings,
    ) { state, wishIds, session, cart, settings ->
        val current = state.copy(
            cartLines = cart,
            defaultLimit = settings.defaultMaxOrderQty,
            isWishlisted = state.product?.id in wishIds,
            wishlistedProductIds = wishIds,
            isSignedIn = session is AuthSessionState.SignedIn,
            userId = (session as? AuthSessionState.SignedIn)?.userId,
        )
        current.copy(quantity = current.quantity.coerceIn(1, current.remaining.coerceAtLeast(1)))
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = ProductDetailUiState(
            wishlistedProductIds = wishlistRepository.wishlistedProductIds.value,
            isSignedIn = authRepository.sessionState.value is AuthSessionState.SignedIn,
        ),
    )

    init {
        loadProduct()
        viewModelScope.launch {
            combine(authRepository.sessionState, _uiState.map { it.product?.id }.distinctUntilChanged()) { session, id ->
                (session as? AuthSessionState.SignedIn)?.userId to id
            }.distinctUntilChanged().collectLatest { (userId, productId) ->
                _uiState.update { it.copy(eligibility = ReviewEligibility(), followUpFailed = false) }
                if (userId != null && productId != null) {
                    val result = reviewRepository.checkEligibility(productId)
                    _uiState.update { it.copy(eligibility = result.getOrDefault(ReviewEligibility())) }
                }
            }
        }
    }

    fun loadProduct() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            val isUuid = runCatching { UUID.fromString(productRoute).toString().equals(productRoute, true) }.getOrDefault(false)
            val productResult = if (isUuid) {
                catalogRepository.getProductById(productRoute)
            } else {
                catalogRepository.getProductBySlug(productRoute)
            }
            productResult
                .onSuccess { product ->
                    if (product == null) {
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                errorMessage = localized("المنتج غير متوفر حالياً.", "Product currently unavailable."),
                            )
                        }
                    } else {
                        _uiState.update {
                            it.copy(
                                product = product,
                                selectedSize = product.inventory.first?.size?.ifEmpty { null } ?: product.sizes.firstOrNull(),
                                selectedColor = product.inventory.first?.color?.ifEmpty { null } ?: product.colors.firstOrNull(),
                                quantity = 1,
                                isLoading = false,
                            )
                        }
                        launch { runSuspendCatching { recentlyViewedStore.record(product.id) } }
                        val reviews = async { reviewRepository.getPublishedReviews(product.id) }
                        val related = async { catalogRepository.getRelatedProducts(product.id, limit = 6) }
                        val reviewsResult = reviews.await()
                        val relatedResult = related.await()
                        _uiState.update { it.copy(
                            reviews = reviewsResult.getOrDefault(it.reviews),
                            relatedProducts = relatedResult.getOrDefault(emptyList()),
                        ) }
                    }
                }
                .onFailure {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = localized("تعذر تحميل بيانات المنتج.", "Unable to load product."),
                        )
                    }
                }
        }
    }

    fun selectSize(size: String) {
        if (_uiState.value.selectedSize == size) return
        restockJob?.cancel()
        _uiState.update { it.selectOption(it.selectedColor, size) }
    }

    fun selectColor(color: String) {
        if (_uiState.value.selectedColor == color) return
        restockJob?.cancel()
        _uiState.update { state ->
            val p = state.product ?: return@update state
            val size = p.inventory.firstSize(color) ?: state.selectedSize ?: p.sizes.firstOrNull()
            state.selectOption(color, size)
        }
    }

    fun incrementQuantity() {
        val visible = uiState.value
        if (visible.quantity < visible.remaining) _uiState.update { it.copy(quantity = visible.quantity + 1) }
    }

    fun decrementQuantity() {
        val quantity = uiState.value.quantity
        if (quantity > 1) _uiState.update { it.copy(quantity = quantity - 1) }
    }

    fun addToCart(onFailure: (String) -> Unit, onAdded: (String) -> Unit) {
        val state = uiState.value
        val product = state.product ?: return
        if (!state.canAddToCart || _uiState.value.isAdding) return
        _uiState.update { it.copy(isAdding = true) }

        viewModelScope.launch {
            val added = runSuspendCatching { cartRepository.addProduct(
                product = product,
                quantity = state.quantity,
                selectedSize = state.selectedSize,
                selectedColor = state.selectedColor,
            ) }
            _uiState.update { it.copy(isAdding = false) }
            added.onSuccess { count ->
                if (count <= 0) onFailure(quantityLimitHint()) else onAdded(localized(
                    "تمت إضافة $count × \"${product.displayName}\" إلى السلة",
                    "Added $count × ${product.displayName} to cart",
                ))
            }.onFailure { onFailure(localized("تعذر تحديث السلة.", "Could not update your cart.")) }
        }
    }

    fun toggleWishlist(onOutcome: (WishlistToggleOutcome) -> Unit) {
        _uiState.value.product?.id?.let { toggleWishlistFor(it, onOutcome) }
    }

    fun toggleWishlistFor(
        targetProductId: String,
        onOutcome: (WishlistToggleOutcome) -> Unit,
    ) {
        viewModelScope.launch {
            onOutcome(wishlistRepository.toggleWishlist(targetProductId))
        }
    }

    fun quickAddRelated(product: Product) {
        viewModelScope.launch {
            cartRepository.addProduct(
                product = product,
                quantity = 1,
                selectedSize = product.sizes.firstOrNull(),
                selectedColor = product.colors.firstOrNull(),
            )
        }
    }

    suspend fun observeReviewReplies(productId: String) {
        reviewRepository.replyUpdates(productId).retryWhen { _, _ -> delay(5_000); true }
            .collect { (id, reply) ->
                _uiState.update { state ->
                    if (state.reviews.none { it.id == id }) state else state.copy(
                        reviews = state.reviews.map { if (it.id == id) it.withReply(reply) else it },
                    )
                }
            }
    }

    fun submitFollowUp(reviewId: String, body: String) {
        val state = _uiState.value
        val productId = state.product?.id ?: return
        val review = state.reviews.find { it.id == reviewId } ?: return
        val userId = (authRepository.sessionState.value as? AuthSessionState.SignedIn)?.userId
        if (state.sendingFollowUp || !ReviewFormatting.validFollowUp(body) ||
            !review.canFollowUp(state.eligibility.existingReview, userId)) return
        _uiState.update { it.copy(sendingFollowUp = true, followUpFailed = false) }
        viewModelScope.launch {
            reviewRepository.followUp(reviewId, body).onSuccess { reply ->
                _uiState.update { current ->
                    current.copy(sendingFollowUp = false, reviews = current.reviews.map {
                        if (it.id == reviewId) it.withReply(reply) else it
                    })
                }
            }.onFailure {
                val latest = reviewRepository.getPublishedReviews(productId)
                _uiState.update { it.copy(sendingFollowUp = false, followUpFailed = true, reviews = latest.getOrDefault(it.reviews)) }
            }
        }
    }

    fun submitReview(
        rating: Int,
        comment: String,
        onSaved: (String) -> Unit,
    ) {
        val productId = _uiState.value.product?.id ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmittingReview = true, reviewSubmitError = null) }
            reviewRepository.submitReview(
                productId = productId,
                rating = rating,
                comment = comment,
            ).onSuccess { saved ->
                _uiState.update { prev ->
                    val updatedList = prev.reviews.toMutableList().apply {
                        val idx = indexOfFirst { it.id == saved.id }
                        if (idx >= 0) set(idx, saved.copy(replies = get(idx).replies)) else add(0, saved)
                    }
                    val stats = ReviewFormatting.computeStats(updatedList)
                    prev.copy(
                        reviews = updatedList,
                        product = prev.product?.copy(
                            avgRating = stats.average,
                            reviewCount = stats.total,
                        ),
                        eligibility = prev.eligibility.copy(
                            eligible = true,
                            existingReview = saved,
                        ),
                        isSubmittingReview = false,
                        reviewSubmitError = null,
                    )
                }
                onSaved(
                    localized(
                        "شكراً لك! تم حفظ تقييمك الموثّق بنجاح.",
                        "Thank you! Your verified review has been saved.",
                    ),
                )
            }.onFailure { err ->
                val raw = err.localizedMessage.orEmpty()
                val msg = when {
                    raw.contains("verified_purchase_required", ignoreCase = true) ->
                        localized(
                            "التقييمات متاحة فقط للمشترين الذين تم تسليم طلبهم لهذا المنتج.",
                            "Reviews are exclusive to verified delivered orders of this product.",
                        )
                    else ->
                        localized(
                            "تعذر حفظ تقييمك حالياً. حاول مرة أخرى.",
                            "Could not save your review right now. Please try again.",
                        )
                }
                _uiState.update { it.copy(isSubmittingReview = false, reviewSubmitError = msg) }
            }
        }
    }

    fun subscribeBackInStock(phone: String?) {
        val state = _uiState.value
        val product = state.product ?: return
        if (state.selectedStock > 0 || restockJob?.isActive == true || state.restockSubscribed) return
        restockJob = viewModelScope.launch {
            _uiState.update { it.copy(isSubscribingRestock = true, restockError = null) }
            val variantKey = listOfNotNull(state.selectedSize, state.selectedColor)
                .filter { it.isNotBlank() }
                .joinToString(" / ")
            val token = fcmTokenManager.syncCurrentToken()
            notificationRepository.subscribeBackInStock(
                productId = product.id,
                variantKey = variantKey,
                phone = phone?.trim()?.takeIf { it.isNotEmpty() },
                pushToken = token,
            ).onSuccess {
                _uiState.update {
                    it.copy(
                        isSubscribingRestock = false,
                        restockSubscribed = true,
                        restockError = null,
                    )
                }
            }.onFailure {
                _uiState.update {
                    it.copy(
                        isSubscribingRestock = false,
                        restockError = localized(
                            "أدخل رقم هاتف صحيح أو سجّل الدخول لتفعيل التنبيه.",
                            "Enter a valid phone number or sign in to activate restock alerts.",
                        ),
                    )
                }
            }
        }
    }
}
