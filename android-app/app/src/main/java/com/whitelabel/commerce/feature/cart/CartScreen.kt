package com.whitelabel.commerce.feature.cart

import com.whitelabel.commerce.core.designsystem.components.ColorSwatchMapper

import com.whitelabel.commerce.core.designsystem.localized

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.ShoppingCartCheckout
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.SubcomposeAsyncImage
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.components.BrandEmptyState
import com.whitelabel.commerce.core.designsystem.components.FlashRoseColor
import com.whitelabel.commerce.core.designsystem.components.FreeShippingProgressBar
import com.whitelabel.commerce.core.designsystem.components.ProductImageFallback
import com.whitelabel.commerce.core.designsystem.components.rememberShimmerBrush
import com.whitelabel.commerce.core.designsystem.formatPrice
import com.whitelabel.commerce.core.domain.model.CartItem
import com.whitelabel.commerce.core.domain.model.Product

@Composable
fun CartScreen(
    onProceedToCheckout: () -> Unit,
    onContinueShopping: () -> Unit,
    onProductClick: (String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: CartViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val brandColors = LocalBrandColors.current

    if (state.items.isEmpty()) {
        Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            BrandEmptyState(
                icon = Icons.Outlined.ShoppingBag,
                title = localized("سلة التسوق فارغة", "Your cart is empty"),
                subtitle = localized("أضف المنتجات التي تعجبك وسنحتفظ بها لك تلقائياً حتى إتمام الطلب.", "Add products to your cart to check out."),
                actionLabel = localized("تصفح المنتجات", "Browse products"),
                onAction = onContinueShopping,
            )
        }
        return
    }

    Column(modifier = modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = localized("سلة التسوق (${state.items.sumOf { it.quantity }} قطعة)", "Shopping cart (${state.items.sumOf { it.quantity }} items)"),
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    TextButton(onClick = viewModel::clearCart) {
                        Text(
                            text = localized("إفراغ السلة", "Empty cart"),
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }

            if (state.cartIncentiveEnabled && state.freeShippingThreshold > 0.0) {
                item {
                    FreeShippingProgressBar(
                        enabled = state.cartIncentiveEnabled,
                        threshold = state.freeShippingThreshold,
                        subtotal = state.subtotal,
                        currency = state.currency,
                        locale = state.locale,
                    )
                }
            }

            if (state.remainingForFreeShipping > 0.0 && state.upsellProducts.isNotEmpty()) {
                item {
                    CartUpsellStrip(
                        products = state.upsellProducts,
                        remainingAmount = state.remainingForFreeShipping,
                        currency = state.currency,
                        locale = state.locale,
                        onProductClick = onProductClick,
                        onAddClick = { product ->
                            if (product.sizes.isNotEmpty() || product.colors.isNotEmpty()) onProductClick(product.id)
                            else viewModel.addUpsellProduct(product)
                        },
                    )
                }
            }

            items(state.items, key = { it.lineKey }) { item ->
                CartItemCard(
                    item = item,
                    currency = state.currency,
                    locale = state.locale,
                    onClick = { onProductClick(item.productId) },
                    onIncrement = { viewModel.increment(item) },
                    onDecrement = { viewModel.decrement(item) },
                    onRemove = { viewModel.remove(item.lineKey) },
                )
            }

            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, brandColors.hairline),
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Text(
                            text = localized("ملخص الطلب", "Order summary"),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                        )
                        SummaryRow(
                            label = localized("المجموع الفرعي", "Subtotal"),
                            value = formatPrice(state.subtotal, state.currency, state.locale),
                        )
                        SummaryRow(
                            label = localized("رسوم الشحن", "Shipping fee"),
                            value = if (state.shippingFee == 0.0) {
                                localized("مجاني", "Free")
                            } else {
                                formatPrice(state.shippingFee, state.currency, state.locale)
                            },
                            highlightSuccess = state.shippingFee == 0.0,
                        )
                        HorizontalDivider(color = brandColors.hairline)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = localized("الإجمالي الكلي", "Grand total"),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = formatPrice(state.total, state.currency, state.locale),
                                style = MaterialTheme.typography.titleLarge,
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                }
            }
        }

        // Sticky Checkout CTA bar
        Surface(
            color = MaterialTheme.colorScheme.surface,
            shadowElevation = 6.dp,
        ) {
            Column {
                HorizontalDivider(color = brandColors.hairline)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(
                            text = localized("الإجمالي", "Total"),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = formatPrice(state.total, state.currency, state.locale),
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Bold,
                        )
                    }

                    Button(
                        onClick = onProceedToCheckout,
                        shape = MaterialTheme.shapes.small,
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.ShoppingCartCheckout,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                        )
                        Text(
                            text = localized("إتمام الطلب", "Checkout"),
                            style = MaterialTheme.typography.labelLarge,
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CartItemCard(
    item: CartItem,
    currency: String,
    locale: String,
    onClick: () -> Unit,
    onIncrement: () -> Unit,
    onDecrement: () -> Unit,
    onRemove: () -> Unit,
) {
    val brandColors = LocalBrandColors.current

    Card(
        onClick = onClick,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, brandColors.hairline),
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Product Thumbnail
            Box(
                modifier = Modifier
                    .size(84.dp)
                    .clip(MaterialTheme.shapes.small)
                    .background(MaterialTheme.colorScheme.surfaceVariant),
            ) {
                if (!item.imageUrl.isNullOrBlank()) {
                    SubcomposeAsyncImage(
                        model = item.imageUrl,
                        contentDescription = item.displayName,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                        loading = {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(rememberShimmerBrush()),
                            )
                        },
                        error = { ProductImageFallback() },
                    )
                } else {
                    ProductImageFallback()
                }
            }

            // Item Info & Quantity Controls
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top,
                ) {
                    Text(
                        text = item.displayName,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(
                        onClick = onRemove,
                        modifier = Modifier.size(28.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.DeleteOutline,
                            contentDescription = localized("حذف المنتج", "Remove product"),
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }

                // Variant pills (Size & Color)
                if (!item.selectedSize.isNullOrBlank() || !item.selectedColor.isNullOrBlank()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        item.selectedSize?.let { size ->
                            VariantTag(text = localized("المقاس: $size", "Size: $size"))
                        }
                        item.selectedColor?.let(ColorSwatchMapper::displayLabel)?.let { color ->
                            VariantTag(text = localized("اللون: $color", "Color: $color"))
                        }
                    }
                }

                Spacer(modifier = Modifier.height(2.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = formatPrice(item.lineTotal, currency, locale),
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold,
                    )

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Surface(
                            onClick = onDecrement,
                            shape = MaterialTheme.shapes.extraSmall,
                            color = MaterialTheme.colorScheme.surfaceVariant,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Remove,
                                contentDescription = localized("إنقاص", "Decrease"),
                                modifier = Modifier
                                    .padding(6.dp)
                                    .size(16.dp),
                            )
                        }
                        Text(
                            text = item.quantity.toString(),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                        )
                        Surface(
                            onClick = onIncrement,
                            enabled = item.quantity < item.maxStock.coerceAtLeast(1),
                            shape = MaterialTheme.shapes.extraSmall,
                            color = MaterialTheme.colorScheme.primaryContainer,
                            contentColor = MaterialTheme.colorScheme.primary,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Add,
                                contentDescription = localized("زيادة", "Increase"),
                                modifier = Modifier
                                    .padding(6.dp)
                                    .size(16.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun VariantTag(text: String) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
        shape = MaterialTheme.shapes.extraSmall,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
        )
    }
}

@Composable
private fun CartUpsellStrip(
    products: List<Product>,
    remainingAmount: Double,
    currency: String,
    locale: String,
    onProductClick: (String) -> Unit,
    onAddClick: (Product) -> Unit,
) {
    val brandColors = LocalBrandColors.current
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, brandColors.hairline),
        shape = MaterialTheme.shapes.medium,
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
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.AutoAwesome,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = localized(
                            "أكمل طلبك للشحن المجاني",
                            "Add to unlock free shipping",
                        ),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.65f),
                    contentColor = MaterialTheme.colorScheme.primary,
                    shape = CircleShape,
                ) {
                    Text(
                        text = localized(
                            "متبقي ${formatPrice(remainingAmount, currency, locale)}",
                            "${formatPrice(remainingAmount, currency, locale)} away",
                        ),
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontFeatureSettings = "tnum",
                        ),
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
            }

            LazyRow(
                contentPadding = PaddingValues(horizontal = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(products, key = { "upsell_${it.id}" }) { product ->
                    val flashActive = product.isFlashSaleActive()
                    val effective = product.effectivePrice()
                    Surface(
                        onClick = { onProductClick(product.id) },
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                        shape = MaterialTheme.shapes.medium,
                        border = BorderStroke(1.dp, brandColors.hairline),
                        modifier = Modifier.width(236.dp),
                    ) {
                        Row(
                            modifier = Modifier.padding(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(50.dp)
                                    .clip(MaterialTheme.shapes.small)
                                    .background(MaterialTheme.colorScheme.surface),
                            ) {
                                if (!product.imageUrl.isNullOrBlank()) {
                                    SubcomposeAsyncImage(
                                        model = product.imageUrl,
                                        contentDescription = product.displayName,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize(),
                                        error = { ProductImageFallback() },
                                    )
                                } else {
                                    ProductImageFallback()
                                }
                                if (flashActive) {
                                    Surface(
                                        color = FlashRoseColor,
                                        shape = CircleShape,
                                        modifier = Modifier
                                            .align(Alignment.TopStart)
                                            .padding(3.dp)
                                            .size(16.dp),
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                imageVector = Icons.Rounded.Bolt,
                                                contentDescription = null,
                                                tint = Color.White,
                                                modifier = Modifier.size(10.dp),
                                            )
                                        }
                                    }
                                }
                            }

                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(2.dp),
                            ) {
                                Text(
                                    text = product.displayName,
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Text(
                                        text = formatPrice(effective, currency, locale),
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = if (flashActive) FlashRoseColor else MaterialTheme.colorScheme.primary,
                                        maxLines = 1,
                                    )
                                    if (flashActive) {
                                        Text(
                                            text = formatPrice(product.price, currency, locale),
                                            style = MaterialTheme.typography.labelSmall.copy(
                                                textDecoration = TextDecoration.LineThrough,
                                            ),
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                }
                            }

                            Surface(
                                onClick = { onAddClick(product) },
                                color = MaterialTheme.colorScheme.primary,
                                contentColor = MaterialTheme.colorScheme.onPrimary,
                                shape = CircleShape,
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Add,
                                        contentDescription = null,
                                        modifier = Modifier.size(14.dp),
                                    )
                                    Text(
                                        text = localized("أضف", "Add"),
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryRow(
    label: String,
    value: String,
    highlightSuccess: Boolean = false,
) {
    val brandColors = LocalBrandColors.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = if (highlightSuccess) brandColors.success else MaterialTheme.colorScheme.onSurface,
        )
    }
}
