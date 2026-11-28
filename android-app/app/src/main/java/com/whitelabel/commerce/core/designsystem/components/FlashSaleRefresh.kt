package com.whitelabel.commerce.core.designsystem.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay

/** Refresh on return and at a scheduled change, without ticking the whole product grid. */
@Composable
fun rememberFlashSaleTime(refreshAtMillis: Long?, onRefresh: () -> Unit): Long {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val refresh by rememberUpdatedState(onRefresh)
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LifecycleResumeEffect(lifecycle) {
        now = System.currentTimeMillis()
        refresh()
        onPauseOrDispose {}
    }
    LaunchedEffect(lifecycle, refreshAtMillis) {
        if (refreshAtMillis != null) lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            delay((refreshAtMillis - System.currentTimeMillis()).coerceAtLeast(0L))
            now = System.currentTimeMillis()
            refresh()
        }
    }
    return now
}
