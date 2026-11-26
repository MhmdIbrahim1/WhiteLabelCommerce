package com.whitelabel.commerce.feature.catalog

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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
import javax.inject.Inject

data class ProductDetailUiState(
    val product: Product? = null,
    val selectedSize: String? = null,
    val selectedColor: String? = null,
    val quantity: Int = 1,
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
) {
    val selectedStock: Int get() = product?.let { it.inventory.stock(selectedColor, selectedSize, it.stock) } ?: 0
    val canAddToCart: Boolean
        get() {
            val p = product ?: return false
            if (!p.isInStock || quantity <= 0 || quantity > selectedStock) return false
            if (p.sizes.isNotEmpty() && selectedSize.isNullOrBlank()) return false
            if (p.colors.isNotEmpty() && selectedColor.isNullOrBlank()) return false
            return true
        }
}

@HiltViewModel
class ProductDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val catalogRepository: CatalogRepository,
    private val cartRepository: CartRepository,
    private val notificationRepository: NotificationRepository,
    private val fcmTokenManager: FcmTokenManager,
    private val reviewRepository: ReviewRepository,
    private val wishlistRepository: WishlistRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val productId: String = checkNotNull(savedStateHandle["productId"])

    private val _uiState = MutableStateFlow(ProductDetailUiState())
    val uiState: StateFlow<ProductDetailUiState> = combine(
        _uiState,
        wishlistRepository.wishlistedProductIds,
        authRepository.sessionState,
    ) { state, wishIds, session ->
        state.copy(
            isWishlisted = productId in wishIds,
            wishlistedProductIds = wishIds,
            isSignedIn = session is AuthSessionState.SignedIn,
            userId = (session as? AuthSessionState.SignedIn)?.userId,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = ProductDetailUiState(
            isWishlisted = productId in wishlistRepository.wishlistedProductIds.value,
            wishlistedProductIds = wishlistRepository.wishlistedProductIds.value,
            isSignedIn = authRepository.sessionState.value is AuthSessionState.SignedIn,
        ),
    )

    init {
        loadProduct()
        viewModelScope.launch {
            authRepository.sessionState.map { (it as? AuthSessionState.SignedIn)?.userId }
                .distinctUntilChanged().collectLatest { userId ->
                    _uiState.update { it.copy(eligibility = ReviewEligibility(), followUpFailed = false) }
                    if (userId != null) {
                        val result = reviewRepository.checkEligibility(productId)
                        _uiState.update { it.copy(eligibility = result.getOrDefault(ReviewEligibility())) }
                    }
                }
        }
    }

    fun loadProduct() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            val productDeferred = async { catalogRepository.getProductById(productId) }
            val reviewsDeferred = async { reviewRepository.getPublishedReviews(productId) }
            val relatedDeferred = async { catalogRepository.getRelatedProducts(productId, limit = 6) }

            val productResult = productDeferred.await()
            val reviewsResult = reviewsDeferred.await()
            val relatedResult = relatedDeferred.await()

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
                                quantity = if (product.stock > 0) 1 else 0,
                                reviews = reviewsResult.getOrDefault(it.reviews),
                                relatedProducts = relatedResult.getOrDefault(emptyList()),
                                isLoading = false,
                            )
                        }
                    }
                }
                .onFailure { error ->
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
        _uiState.update { it.copy(selectedSize = size, quantity = 1) }
    }

    fun selectColor(color: String) {
        _uiState.update { state ->
            val p = state.product ?: return@update state
            val size = if (p.inventory.stock(color, state.selectedSize, p.stock) > 0) state.selectedSize else p.inventory.firstSize(color)
            state.copy(selectedColor = color, selectedSize = size, quantity = 1)
        }
    }

    fun incrementQuantity() {
        _uiState.update { state ->
            val maxStock = state.selectedStock
            if (state.quantity < maxStock) state.copy(quantity = state.quantity + 1) else state
        }
    }

    fun decrementQuantity() {
        _uiState.update { state ->
            if (state.quantity > 1) state.copy(quantity = state.quantity - 1) else state
        }
    }

    fun addToCart(onAdded: (String) -> Unit) {
        val state = _uiState.value
        val product = state.product ?: return
        if (!state.canAddToCart) return

        viewModelScope.launch {
            cartRepository.addProduct(
                product = product,
                quantity = state.quantity,
                selectedSize = state.selectedSize,
                selectedColor = state.selectedColor,
            )
            onAdded(
                localized(
                    "تمت إضافة ${state.quantity} × \"${product.displayName}\" إلى السلة",
                    "Added ${state.quantity} × ${product.displayName} to cart",
                ),
            )
        }
    }

    fun toggleWishlist(onOutcome: (WishlistToggleOutcome) -> Unit) {
        viewModelScope.launch {
            onOutcome(wishlistRepository.toggleWishlist(productId))
        }
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

    suspend fun observeReviewReplies() {
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
        viewModelScope.launch {
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
