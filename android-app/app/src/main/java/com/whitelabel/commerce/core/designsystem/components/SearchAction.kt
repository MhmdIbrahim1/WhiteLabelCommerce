package com.whitelabel.commerce.core.designsystem.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import com.whitelabel.commerce.core.designsystem.localized

@Composable
internal fun SearchAction(onClick: () -> Unit) {
    IconButton(onClick = onClick) {
        Icon(Icons.Rounded.Search, localized("بحث", "Search"))
    }
}
