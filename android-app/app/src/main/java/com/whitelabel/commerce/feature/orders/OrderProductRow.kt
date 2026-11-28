package com.whitelabel.commerce.feature.orders

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.SubcomposeAsyncImage
import com.whitelabel.commerce.core.data.remote.SupabaseStorageUrls
import com.whitelabel.commerce.core.designsystem.components.ColorSwatchMapper
import com.whitelabel.commerce.core.designsystem.components.ProductImageFallback

@Composable
internal fun OrderProductRow(
    productId: String?,
    name: String,
    size: String?,
    color: String?,
    quantity: Int,
    lineTotal: String,
    onOpenProduct: (String) -> Unit,
    thumbnail: (@Composable () -> Unit)? = null,
) {
    val id = productId?.trim()?.takeIf(String::isNotEmpty)
    val content: @Composable () -> Unit = {
        Row(
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = 8.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            thumbnail?.invoke()
            Column(Modifier.weight(1f)) {
                Text(name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                val variant = listOfNotNull(size?.takeIf(String::isNotBlank),
                    color?.takeIf(String::isNotBlank)?.let(ColorSwatchMapper::displayLabel)).joinToString(" · ")
                if (variant.isNotEmpty()) {
                    Text(variant, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("\u2066$lineTotal\u2069", style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = "tnum"))
                Text("\u2066× $quantity\u2069", color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall.copy(fontFeatureSettings = "tnum"))
            }
            if (id != null) Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null,
                modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    if (id == null) {
        Surface(shape = MaterialTheme.shapes.small, color = MaterialTheme.colorScheme.surface, content = content)
    } else {
        Surface(onClick = { onOpenProduct(id) }, shape = MaterialTheme.shapes.small,
            color = MaterialTheme.colorScheme.surfaceContainerLow, content = content)
    }
}

@Composable
internal fun ReceiptThumbnail(imageUrl: String?) {
    SubcomposeAsyncImage(
        model = SupabaseStorageUrls.resolveProductImageUrl(imageUrl),
        contentDescription = null,
        modifier = Modifier.size(44.dp).clip(MaterialTheme.shapes.small),
        contentScale = ContentScale.Crop,
        loading = { ProductImageFallback() },
        error = { ProductImageFallback() },
    )
}
