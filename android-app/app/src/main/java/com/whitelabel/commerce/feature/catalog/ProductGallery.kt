package com.whitelabel.commerce.feature.catalog

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ZoomIn
import androidx.compose.material.icons.rounded.ZoomOut
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import coil.compose.SubcomposeAsyncImage
import com.whitelabel.commerce.core.designsystem.components.ProductImageFallback
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.Product
import kotlinx.coroutines.launch

@Composable
internal fun ProductGallery(product: Product, selectedColor: String?, badge: @Composable BoxScope.() -> Unit) {
    val gallery = remember(product.imageUrl, product.galleryUrls, product.colorImages) {
        (listOfNotNull(product.imageUrl) + product.galleryUrls + product.colorImages.values)
            .filter(String::isNotBlank).distinct()
    }
    val selectedImage = product.imageFor(selectedColor)
    val pager = rememberPagerState(initialPage = gallery.indexOf(selectedImage).coerceAtLeast(0)) { gallery.size }
    val scope = rememberCoroutineScope()
    var lightboxPage by rememberSaveable(product.id) { mutableStateOf<Int?>(null) }
    LaunchedEffect(selectedColor, selectedImage, gallery) {
        val page = gallery.indexOf(selectedImage)
        if (page >= 0 && page != pager.currentPage) pager.animateScrollToPage(page)
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.fillMaxWidth().aspectRatio(4f / 3f).clip(MaterialTheme.shapes.large)
            .background(MaterialTheme.colorScheme.surfaceVariant)) {
            if (gallery.isEmpty()) {
                ProductImageFallback()
            } else {
                HorizontalPager(state = pager, key = { gallery[it] }, modifier = Modifier.fillMaxSize()) { index ->
                    SubcomposeAsyncImage(
                        model = gallery[index], contentDescription = product.displayName,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxSize().clickable(
                            role = Role.Button, onClickLabel = localized("تكبير الصورة", "Enlarge image"),
                        ) { lightboxPage = index },
                        error = { ProductImageFallback() },
                    )
                }
                Surface(
                    color = Color.Black.copy(alpha = 0.68f), contentColor = Color.White,
                    shape = CircleShape, modifier = Modifier.align(Alignment.BottomEnd).padding(10.dp),
                ) {
                    Row(
                        Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        if (gallery.size > 1) GalleryCounter(pager.currentPage, gallery.size)
                        Icon(Icons.Rounded.ZoomIn, contentDescription = null, modifier = Modifier.size(16.dp))
                    }
                }
                if (gallery.size > 1) {
                    Row(
                        Modifier.align(Alignment.BottomStart).padding(14.dp)
                            .background(Color.Black.copy(alpha = 0.55f), CircleShape).padding(5.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        val count = minOf(gallery.size, 5)
                        val start = (pager.currentPage - count / 2).coerceIn(0, gallery.size - count)
                        repeat(count) { i ->
                            Box(Modifier.size(5.dp).background(
                                Color.White.copy(alpha = if (start + i == pager.currentPage) 1f else 0.48f), CircleShape,
                            ))
                        }
                    }
                }
            }
            badge()
        }
        if (gallery.size > 1) {
            val thumbnails = rememberLazyListState()
            LaunchedEffect(pager.currentPage) {
                val index = pager.currentPage
                val layout = thumbnails.layoutInfo
                val visible = layout.visibleItemsInfo.any {
                    it.index == index && it.offset >= layout.viewportStartOffset &&
                        it.offset + it.size <= layout.viewportEndOffset
                }
                if (!visible) thumbnails.animateScrollToItem(index)
            }
            LazyRow(state = thumbnails, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                itemsIndexed(gallery, key = { _, url -> url }) { index, url ->
                    val active = index == pager.currentPage
                    val border by animateColorAsState(
                        if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                        label = "thumbnail border",
                    )
                    Surface(
                        modifier = Modifier.size(60.dp).clip(MaterialTheme.shapes.small)
                            .selectable(selected = active, role = Role.Tab) { scope.launch { pager.animateScrollToPage(index) } },
                        shape = MaterialTheme.shapes.small, border = BorderStroke(if (active) 2.dp else 1.dp, border),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                    ) {
                        AsyncImage(url, localized("صورة ${index + 1}", "Image ${index + 1}"),
                            modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    }
                }
            }
        }
    }
    lightboxPage?.takeIf { it in gallery.indices }?.let { index ->
        GalleryLightbox(gallery, index, product.displayName) { finalIndex ->
            lightboxPage = null
            scope.launch { pager.scrollToPage(finalIndex) }
        }
    }
}

@Composable
private fun GalleryCounter(page: Int, total: Int) {
    Text("\u2066${page + 1} / $total\u2069", style = MaterialTheme.typography.labelMedium.copy(fontFeatureSettings = "tnum"))
}

@Composable
private fun GalleryLightbox(images: List<String>, initialPage: Int, name: String, onClose: (Int) -> Unit) {
    val pager = rememberPagerState(initialPage = initialPage) { images.size }
    var scale by remember(pager.currentPage) { mutableFloatStateOf(1f) }
    var zoomRequest by remember { mutableStateOf<(() -> Unit)?>(null) }

    Dialog(onDismissRequest = { onClose(pager.currentPage) },
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black).systemBarsPadding()) {
            HorizontalPager(state = pager, key = { images[it] }, userScrollEnabled = scale <= 1f, modifier = Modifier.fillMaxSize()) { page ->
                if (page == pager.currentPage) {
                    ZoomableImage(images[page], name, scale, { scale = it }, { zoomRequest = it })
                } else {
                    AsyncImage(images[page], name, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
                }
            }
            Surface(
                Modifier.fillMaxWidth().align(Alignment.TopCenter),
                color = Color.Black.copy(alpha = .64f), contentColor = Color.White,
            ) {
                Row(Modifier.padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.weight(1f).padding(start = 8.dp)) { GalleryCounter(pager.currentPage, images.size) }
                    IconButton(onClick = { zoomRequest?.invoke() }) {
                        Icon(if (scale > 1f) Icons.Rounded.ZoomOut else Icons.Rounded.ZoomIn,
                            localized("تغيير التكبير", "Toggle zoom"))
                    }
                    IconButton(onClick = { onClose(pager.currentPage) }) {
                        Icon(Icons.Rounded.Close, localized("إغلاق", "Close"))
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ZoomableImage(
    url: String, name: String, scale: Float, onScale: (Float) -> Unit, onZoomReady: (() -> Unit) -> Unit,
) {
    var viewport by remember { mutableStateOf(IntSize.Zero) }
    var imageSize by remember { mutableStateOf(Size.Zero) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    // Read the current scale for every gesture sample, including multiple samples within one frame.
    val zoom = remember { mutableFloatStateOf(scale) }
    val scope = rememberCoroutineScope()
    fun setTransform(newScale: Float, newOffset: Offset) {
        val fit = if (imageSize.width > 0 && imageSize.height > 0) {
            minOf(viewport.width / imageSize.width, viewport.height / imageSize.height)
        } else 0f
        val maxX = ((imageSize.width * fit * newScale - viewport.width) / 2f).coerceAtLeast(0f)
        val maxY = ((imageSize.height * fit * newScale - viewport.height) / 2f).coerceAtLeast(0f)
        offset = Offset(newOffset.x.coerceIn(-maxX, maxX), newOffset.y.coerceIn(-maxY, maxY))
        zoom.floatValue = newScale
        onScale(newScale)
    }
    val transform = rememberTransformableState { change, pan, _ ->
        val current = zoom.floatValue
        val next = (current * change).coerceIn(1f, 3.5f)
        setTransform(next, offset * (next / current) + pan)
    }
    fun toggleZoom(focus: Offset) {
        scope.launch {
            transform.transform {
                val initialScale = zoom.floatValue
                val initialOffset = offset
                val target = if (initialScale > 1f) 1f else 2.5f
                animate(initialScale, target, animationSpec = tween(220)) { value, _ ->
                    setTransform(value, focus + (initialOffset - focus) * (value / initialScale))
                }
            }
        }
    }
    LaunchedEffect(url) { onZoomReady { toggleZoom(Offset.Zero) } }
    Box(
        Modifier.fillMaxSize().clipToBounds().onSizeChanged { viewport = it }
            .pointerInput(url) {
                detectTapGestures(onDoubleTap = {
                    toggleZoom(it - Offset(size.width / 2f, size.height / 2f))
                })
            }
            .transformable(state = transform, canPan = { zoom.floatValue > 1f }),
    ) {
        AsyncImage(
            model = url, contentDescription = name, contentScale = ContentScale.Fit,
            onSuccess = { imageSize = it.painter.intrinsicSize },
            modifier = Modifier.fillMaxSize().graphicsLayer {
                scaleX = zoom.floatValue
                scaleY = zoom.floatValue
                translationX = offset.x
                translationY = offset.y
            },
        )
    }
}
