package com.whitelabel.commerce.feature.catalog

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Straighten
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.LocalStoreSettings
import com.whitelabel.commerce.core.designsystem.localized

enum class SizeGuideTab(private val ar: String, private val en: String) {
    APPAREL("الملابس", "Apparel"),
    PANTS("البناطيل", "Pants"),
    SHOES("الأحذية", "Shoes");

    val displayLabel: String
        get() = localized(ar, en)
}

fun detectSizeGuideTab(sizes: List<String>): SizeGuideTab {
    val nums = sizes.mapNotNull { it.trim().toIntOrNull() }
    if (nums.any { it in 39..48 }) return SizeGuideTab.SHOES
    if (nums.any { it in 28..38 }) return SizeGuideTab.PANTS
    return SizeGuideTab.APPAREL
}

private data class SizeGuideRow(
    val col1: String,
    val col2: String,
    val col3: String,
    val col4: String,
)

private val apparelRows = listOf(
    SizeGuideRow("S", "92–96", "78–82", "69"),
    SizeGuideRow("M", "97–102", "83–88", "71"),
    SizeGuideRow("L", "103–108", "89–94", "73"),
    SizeGuideRow("XL", "109–115", "95–101", "75"),
    SizeGuideRow("XXL", "116–122", "102–108", "77"),
)

private val pantsRows = listOf(
    SizeGuideRow("30", "76–79", "94–97", "78"),
    SizeGuideRow("32", "81–84", "99–102", "79"),
    SizeGuideRow("34", "86–89", "104–107", "80"),
    SizeGuideRow("36", "91–94", "109–112", "81"),
    SizeGuideRow("38", "96–100", "114–118", "81"),
)

private val shoesRows = listOf(
    SizeGuideRow("40", "7", "6.5", "25.0"),
    SizeGuideRow("41", "8", "7.5", "25.8"),
    SizeGuideRow("42", "9", "8.5", "26.5"),
    SizeGuideRow("43", "10", "9.5", "27.3"),
    SizeGuideRow("44", "11", "10.5", "28.0"),
    SizeGuideRow("45", "12", "11.5", "28.8"),
)

/**
 * Interactive bilingual Size & Measurements Guide matching `web-store/src/components/shop/size-guide-modal.tsx`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SizeGuideSheet(
    sizes: List<String>,
    onDismiss: () -> Unit,
) {
    val settings = LocalStoreSettings.current
    val brandColors = LocalBrandColors.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var activeTab by remember(sizes) { mutableStateOf(detectSizeGuideTab(sizes)) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        CompositionLocalProvider(
            LocalLayoutDirection provides if (settings.isRtl) LayoutDirection.Rtl else LayoutDirection.Ltr,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Straighten,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(22.dp),
                        )
                        Text(
                            text = localized("دليل المقاسات والقياسات", "Size & Measurements Guide"),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(
                            imageVector = Icons.Rounded.Close,
                            contentDescription = localized("إغلاق", "Close"),
                        )
                    }
                }

                // Category Tabs (Apparel / Pants / Shoes)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    SizeGuideTab.entries.forEach { tab ->
                        FilterChip(
                            selected = activeTab == tab,
                            onClick = { activeTab = tab },
                            label = {
                                Text(
                                    text = tab.displayLabel,
                                    fontWeight = if (activeTab == tab) FontWeight.Bold else FontWeight.Medium,
                                )
                            },
                            shape = MaterialTheme.shapes.small,
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MaterialTheme.colorScheme.primary,
                                selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                            ),
                        )
                    }
                }

                val headers = when (activeTab) {
                    SizeGuideTab.APPAREL -> listOf(
                        localized("المقاس", "Size"),
                        localized("الصدر (سم)", "Chest (cm)"),
                        localized("الخصر (سم)", "Waist (cm)"),
                        localized("الطول (سم)", "Length (cm)"),
                    )
                    SizeGuideTab.PANTS -> listOf(
                        localized("الخصر", "Waist"),
                        localized("محيط الخصر (سم)", "Waist (cm)"),
                        localized("الأرداف (سم)", "Hip (cm)"),
                        localized("الطول الداخلي", "Inseam (cm)"),
                    )
                    SizeGuideTab.SHOES -> listOf(
                        "EU",
                        "US",
                        "UK",
                        localized("طول القدم (سم)", "Foot (cm)"),
                    )
                }

                val rows = when (activeTab) {
                    SizeGuideTab.APPAREL -> apparelRows
                    SizeGuideTab.PANTS -> pantsRows
                    SizeGuideTab.SHOES -> shoesRows
                }

                Surface(
                    shape = MaterialTheme.shapes.medium,
                    border = BorderStroke(1.dp, brandColors.hairline),
                    color = MaterialTheme.colorScheme.surface,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .padding(horizontal = 10.dp, vertical = 10.dp),
                        ) {
                            headers.forEach { title ->
                                Text(
                                    text = title,
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Bold,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }

                        rows.forEachIndexed { idx, row ->
                            val isProductSize = sizes.any { it.equals(row.col1, ignoreCase = true) }
                            HorizontalDivider(color = brandColors.hairline)
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(
                                        if (isProductSize) {
                                            MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f)
                                        } else {
                                            MaterialTheme.colorScheme.surface
                                        },
                                    )
                                    .padding(horizontal = 10.dp, vertical = 10.dp),
                            ) {
                                Text(
                                    text = row.col1,
                                    style = MaterialTheme.typography.bodySmall,
                                    fontWeight = FontWeight.Bold,
                                    color = if (isProductSize) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.weight(1f),
                                )
                                Text(
                                    text = row.col2,
                                    style = MaterialTheme.typography.bodySmall,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.weight(1f),
                                )
                                Text(
                                    text = row.col3,
                                    style = MaterialTheme.typography.bodySmall,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.weight(1f),
                                )
                                Text(
                                    text = row.col4,
                                    style = MaterialTheme.typography.bodySmall,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }
                    }
                }

                Text(
                    text = localized(
                        "نصيحة: إذا كان مقاسك بين مقاسين، ننصح باختيار المقاس الأكبر لمزيد من الراحة.",
                        "Tip: If you are between two sizes, we recommend sizing up for a relaxed fit.",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Spacer(modifier = Modifier.height(4.dp))
            }
        }
    }
}
