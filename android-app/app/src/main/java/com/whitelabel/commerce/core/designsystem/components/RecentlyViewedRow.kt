package com.whitelabel.commerce.core.designsystem.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.Product

@Composable
fun RecentlyViewedRow(products: List<Product>, onProductClick: (String) -> Unit, onQuickAdd: (Product) -> Unit) {
    if (products.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(localized("شاهدتها مؤخراً", "Recently Viewed"), style = MaterialTheme.typography.titleMedium)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(products, key = { it.id }) { product ->
                ProductCard(
                    product = product,
                    modifier = Modifier.width(168.dp),
                    onClick = { onProductClick(product.id) },
                    onQuickAdd = {
                        if (product.sizes.isNotEmpty() || product.colors.isNotEmpty()) onProductClick(product.id)
                        else onQuickAdd(product)
                    },
                )
            }
        }
    }
}
