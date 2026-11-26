package com.whitelabel.commerce.core.designsystem.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import coil.compose.AsyncImage
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.localized
import kotlinx.coroutines.delay
import kotlin.math.abs

enum class BannerKind { Cart, Info, Success, Error }

class BannerMessage(
    val text: String,
    val kind: BannerKind = BannerKind.Info,
    val image: String? = null,
    val actionLabel: String? = null,
    val action: (() -> Unit)? = null,
)

val LocalBanner = staticCompositionLocalOf<(BannerMessage) -> Unit> { {} }

@Composable
fun BannerFeedback(text: String, kind: BannerKind = BannerKind.Error) {
    val show = LocalBanner.current
    LaunchedEffect(text, kind) { if (text.isNotBlank()) show(BannerMessage(text, kind)) }
}

@Composable
fun FloatingBanner(message: BannerMessage?, dismiss: (BannerMessage) -> Unit) {
    if (message == null) return
    key(message) {
        LaunchedEffect(message) {
            delay(if (message.action == null) 4500L else 6500L)
            dismiss(message)
        }
        val density = LocalDensity.current
        var offset by remember { mutableFloatStateOf(0f) }
        val tone = when (message.kind) {
            BannerKind.Error -> MaterialTheme.colorScheme.error
            BannerKind.Success, BannerKind.Cart -> LocalBrandColors.current.success
            BannerKind.Info -> MaterialTheme.colorScheme.primary
        }
        Popup(alignment = Alignment.TopCenter) {
            Surface(
                modifier = Modifier.statusBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp)
                    .widthIn(max = 520.dp).fillMaxWidth()
                    .graphicsLayer { translationX = offset }
                    .semantics { liveRegion = LiveRegionMode.Polite }
                    .draggable(
                        state = rememberDraggableState { offset += it },
                        orientation = Orientation.Horizontal,
                        onDragStopped = { velocity ->
                            val leave = abs(offset) > with(density) { 68.dp.toPx() } ||
                                abs(velocity) > with(density) { 650.dp.toPx() }
                            val target = if (leave) with(density) { 590.dp.toPx() } *
                                (if ((if (abs(offset) > 1f) offset else velocity) < 0f) -1 else 1) else 0f
                            Animatable(offset).animateTo(target, tween(155)) { offset = value }
                            if (leave) dismiss(message)
                        },
                    ),
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 6.dp,
            ) {
                Row(Modifier.padding(start = 12.dp, end = 2.dp), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (message.image != null) {
                        AsyncImage(message.image, null, Modifier.size(38.dp).clip(MaterialTheme.shapes.small),
                            contentScale = ContentScale.Crop)
                    } else {
                        Icon(when (message.kind) {
                            BannerKind.Cart -> Icons.Rounded.ShoppingCart
                            BannerKind.Success -> Icons.Rounded.Check
                            BannerKind.Error -> Icons.Rounded.ErrorOutline
                            BannerKind.Info -> Icons.Rounded.Info
                        }, null, tint = tone)
                    }
                    Text(message.text, Modifier.weight(1f).padding(vertical = 10.dp), style = MaterialTheme.typography.bodyMedium)
                    if (message.action != null && message.actionLabel != null) {
                        TextButton(onClick = { dismiss(message); message.action.invoke() }) { Text(message.actionLabel) }
                    }
                    IconButton(onClick = { dismiss(message) }) {
                        Icon(Icons.Rounded.Close, localized("إغلاق", "Dismiss"))
                    }
                }
            }
        }
    }
}
