package com.whitelabel.commerce.core.designsystem

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.whitelabel.commerce.core.domain.repository.SearchCorrection

@Composable
fun SearchCorrectionBanner(correction: SearchCorrection, onSearchInstead: () -> Unit) {
    val effective = "\u2068${correction.effective}\u2069"
    val original = "\u2068${correction.original}\u2069"
    Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceVariant) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)
            .semantics { liveRegion = LiveRegionMode.Polite }) {
            Text(localized("عرض نتائج لـ «$effective»", "Showing results for \"$effective\""))
            TextButton(onClick = onSearchInstead) {
                Text(localized("ابحث بدلاً من ذلك عن: $original", "Search instead for: $original"))
            }
        }
    }
}
