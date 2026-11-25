package com.whitelabel.commerce.core.designsystem.components

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.rounded.AddShoppingCart
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.SubcomposeAsyncImage
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.LocalStoreSettings
import com.whitelabel.commerce.core.designsystem.formatPrice
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.Product
import kotlinx.coroutines.delay

val WishlistRoseColor = Color(0xFFE11D48)
val RatingAmberColor = Color(0xFFF59E0B)
val RatingAmberTextColor = Color(0xFFB45309)

/**
 * Unified 4:5 white-label product card used on Home, Catalog, and Wishlist 2-column grids.
 */
@Composable
fun ProductCard(
    product: Product,
    onClick: () -> Unit,
    onQuickAdd: () -> Unit,
    modifier: Modifier = Modifier,
    isWishlisted: Boolean = false,
    onToggleWishlist: (() -> Unit)? = null,
) {
    val brandColors = LocalBrandColors.current
    val settings = LocalStoreSettings.current
    var flashExpired by remember(product.id, product.flashSaleEndsAt, product.flashSalePrice) {
        mutableStateOf(false)
    }
    val activeFlash = !flashExpired && product.isFlashSaleActive()
    val effectivePrice = if (activeFlash) product.effectivePrice() else product.price
    val strikePrice = if (activeFlash) {
        product.price
    } else {
        product.oldPrice?.takeIf { it > product.price }
    }
    val flashPct = if (activeFlash) product.flashSavingsPercent() else null
    val regularDiscount = if (!activeFlash) {
        val prev = product.oldPrice
        if (prev != null && prev > product.price && prev > 0.0) {
            kotlin.math.round(((prev - product.price) / prev) * 100.0).toInt().coerceIn(1, 99)
        } else {
            null
        }
    } else {
        null
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.medium)
            .clickable(onClick = onClick),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, brandColors.hairline),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(0.8f) // 4:5 portrait ratio
                    .background(MaterialTheme.colorScheme.surfaceVariant),
            ) {
                if (!product.imageUrl.isNullOrBlank()) {
                    SubcomposeAsyncImage(
                        model = product.imageUrl,
                        contentDescription = product.displayName,
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
                            ProductImageFallback()
                        },
                    )
                } else {
                    ProductImageFallback()
                }

                // Flash sale discount badge OR regular discount badge
                if (flashPct != null) {
                    Surface(
                        color = FlashRoseColor,
                        contentColor = Color.White,
                        shape = MaterialTheme.shapes.extraSmall,
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(8.dp),
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Bolt,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(12.dp),
                            )
                            Text(
                                text = "-$flashPct%",
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontFeatureSettings = "tnum",
                                ),
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                } else if (regularDiscount != null) {
                    Surface(
                        color = MaterialTheme.colorScheme.secondary,
                        contentColor = MaterialTheme.colorScheme.onSecondary,
                        shape = MaterialTheme.shapes.extraSmall,
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(8.dp),
                    ) {
                        Text(
                            text = "-$regularDiscount%",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp),
                        )
                    }
                }

                // Soft translucent circular Heart toggle button (mirrors in RTL/LTR via TopEnd)
                if (onToggleWishlist != null) {
                    WishlistHeartIconButton(
                        isWishlisted = isWishlisted,
                        onClick = onToggleWishlist,
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(8.dp),
                    )
                }

                // Stock status pill
                if (!product.isInStock) {
                    Surface(
                        color = MaterialTheme.colorScheme.errorContainer,
                        contentColor = MaterialTheme.colorScheme.onErrorContainer,
                        shape = MaterialTheme.shapes.extraSmall,
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .padding(8.dp),
                    ) {
                        Text(
                            text = localized("نفذت الكمية", "Sold out"),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                        )
                    }
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(10.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    text = product.displayName,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    minLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )

                // Calm compact warm-amber single-star badge ONLY when reviewCount > 0
                if (product.hasReviews) {
                    Surface(
                        color = RatingAmberColor.copy(alpha = 0.14f),
                        shape = CircleShape,
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(3.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Star,
                                contentDescription = null,
                                tint = RatingAmberColor,
                                modifier = Modifier.size(13.dp),
                            )
                            Text(
                                text = product.formattedRating,
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = RatingAmberTextColor,
                            )
                            Text(
                                text = "(${product.reviewCount})",
                                style = MaterialTheme.typography.labelSmall,
                                color = RatingAmberTextColor.copy(alpha = 0.85f),
                            )
                        }
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = formatPrice(effectivePrice, settings.currency, settings.locale),
                        style = MaterialTheme.typography.titleSmall,
                        color = if (activeFlash) FlashRoseColor else MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                    )
                    if (strikePrice != null) {
                        Text(
                            text = formatPrice(strikePrice, settings.currency, settings.locale),
                            style = MaterialTheme.typography.bodySmall.copy(
                                textDecoration = TextDecoration.LineThrough,
                            ),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }

                if (activeFlash && !product.flashSaleEndsAt.isNullOrBlank()) {
                    FlashSaleCountdownPill(
                        endsAt = product.flashSaleEndsAt,
                        startsAt = product.flashSaleStartsAt,
                        compact = true,
                        onExpired = { flashExpired = true },
                    )
                }

                Text(
                    text = if (product.isInStock) {
                        localized("متوفر (${product.stock})", "In stock (${product.stock})")
                    } else {
                        localized("غير متوفر حالياً", "Currently unavailable")
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = if (product.isInStock) brandColors.success else MaterialTheme.colorScheme.error,
                )

                Button(
                    onClick = onQuickAdd,
                    enabled = product.isInStock,
                    shape = MaterialTheme.shapes.small,
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(36.dp),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.AddShoppingCart,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = if (product.sizes.isNotEmpty() || product.colors.isNotEmpty()) {
                            localized("اختر وأضف", "Choose options")
                        } else {
                            localized("أضف للسلة", "Add to cart")
                        },
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(start = 6.dp),
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
fun WishlistHeartIconButton(
    isWishlisted: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var burst by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (burst) 1.24f else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessMedium,
        ),
        label = "wishlistHeartScale",
    )

    LaunchedEffect(burst) {
        if (burst) {
            delay(180)
            burst = false
        }
    }

    Surface(
        onClick = {
            burst = true
            onClick()
        },
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.88f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
        shadowElevation = 2.dp,
        modifier = modifier.size(34.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                imageVector = if (isWishlisted) Icons.Rounded.Favorite else Icons.Outlined.FavoriteBorder,
                contentDescription = if (isWishlisted) {
                    localized("إزالة من المفضلة", "Remove from wishlist")
                } else {
                    localized("أضف إلى المفضلة", "Save to wishlist")
                },
                tint = if (isWishlisted) WishlistRoseColor else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .size(18.dp)
                    .graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                    },
            )
        }
    }
}

@Composable
fun ProductImageFallback(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Outlined.Inventory2,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f),
            modifier = Modifier.size(40.dp),
        )
    }
}
