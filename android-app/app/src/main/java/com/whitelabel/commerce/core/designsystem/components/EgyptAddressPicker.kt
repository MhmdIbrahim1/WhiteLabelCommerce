package com.whitelabel.commerce.core.designsystem.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowDropDown
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.LocationCity
import androidx.compose.material.icons.rounded.Map
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.LocalStoreSettings
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.EgyptLocations

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EgyptCascadingAddressFields(
    governorate: String,
    city: String,
    streetAddress: String,
    onGovernorateSelected: (String) -> Unit,
    onCitySelected: (String) -> Unit,
    onStreetAddressChange: (String) -> Unit,
    governorateError: String? = null,
    cityError: String? = null,
    streetError: String? = null,
    modifier: Modifier = Modifier,
) {
    val storeSettings = LocalStoreSettings.current
    val isRtl = storeSettings.isRtl
    var showGovSheet by remember { mutableStateOf(false) }
    var showCitySheet by remember { mutableStateOf(false) }

    val selectedGov = remember(governorate) { EgyptLocations.findGovernorate(governorate) }
    val displayGov = selectedGov?.displayName(isRtl) ?: governorate
    val selectedCity = remember(selectedGov, city) { EgyptLocations.findCity(selectedGov, city) }
    val displayCity = selectedCity?.displayName(isRtl) ?: city

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // 1. Governorate Selector (all 27 Egyptian governorates)
        Box(modifier = Modifier.fillMaxWidth()) {
            OutlinedTextField(
                value = displayGov,
                onValueChange = {},
                readOnly = true,
                label = { Text(localized("المحافظة", "Governorate")) },
                placeholder = { Text(localized("اختر المحافظة (27 محافظة)", "Select Governorate (27)")) },
                leadingIcon = { Icon(Icons.Rounded.Map, contentDescription = null) },
                trailingIcon = { Icon(Icons.Rounded.ArrowDropDown, contentDescription = null) },
                isError = governorateError != null,
                supportingText = governorateError?.let { { Text(it) } },
                singleLine = true,
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.fillMaxWidth(),
            )
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .clickable { showGovSheet = true },
            )
        }

        // 2. Cascading City / District Selector (dynamically populated from selected Governorate)
        Box(modifier = Modifier.fillMaxWidth()) {
            OutlinedTextField(
                value = displayCity,
                onValueChange = {},
                readOnly = true,
                enabled = selectedGov != null,
                label = { Text(localized("المدينة / المركز", "City / District")) },
                placeholder = {
                    Text(
                        if (selectedGov != null) {
                            localized("اختر المدينة أو المركز", "Select City or District")
                        } else {
                            localized("اختر المحافظة أولاً", "Select Governorate first")
                        },
                    )
                },
                leadingIcon = { Icon(Icons.Rounded.LocationCity, contentDescription = null) },
                trailingIcon = { Icon(Icons.Rounded.ArrowDropDown, contentDescription = null) },
                isError = cityError != null,
                supportingText = cityError?.let { { Text(it) } },
                singleLine = true,
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.fillMaxWidth(),
            )
            if (selectedGov != null) {
                Box(
                    modifier = Modifier
                        .matchParentSize()
                        .clickable { showCitySheet = true },
                )
            }
        }

        // 3. Detailed Street Address
        OutlinedTextField(
            value = streetAddress,
            onValueChange = onStreetAddressChange,
            label = { Text(localized("عنوان الشارع بالتفصيل", "Detailed Street Address")) },
            placeholder = {
                Text(
                    localized(
                        "اسم الشارع، رقم العمارة، الدور، الشقة، وأقرب معلم",
                        "Street name, building, floor, apartment, and landmark",
                    ),
                )
            },
            isError = streetError != null,
            supportingText = streetError?.let { { Text(it) } },
            minLines = 2,
            maxLines = 4,
            shape = MaterialTheme.shapes.small,
            modifier = Modifier.fillMaxWidth(),
        )
    }

    if (showGovSheet) {
        SearchableLocationSheet(
            title = localized("اختر المحافظة", "Select Governorate"),
            searchPlaceholder = localized("ابحث عن المحافظة...", "Search governorate…"),
            isRtl = isRtl,
            items = EgyptLocations.governorates.map { g ->
                PickerOption(
                    value = g.displayName(isRtl),
                    label = if (isRtl) g.nameAr else "${g.nameEn} (${g.nameAr})",
                    searchKey = "${g.nameAr} ${g.nameEn}".lowercase(),
                    selected = selectedGov?.id == g.id,
                )
            },
            onDismiss = { showGovSheet = false },
            onSelect = { option ->
                val changed = !option.value.equals(displayGov, ignoreCase = true)
                onGovernorateSelected(option.value)
                if (changed) onCitySelected("")
                showGovSheet = false
            },
        )
    }

    if (showCitySheet && selectedGov != null) {
        SearchableLocationSheet(
            title = localized(
                "اختر المدينة / المركز — ${selectedGov.nameAr}",
                "Select City — ${selectedGov.nameEn}",
            ),
            searchPlaceholder = localized("ابحث عن المدينة أو المركز...", "Search city or district…"),
            isRtl = isRtl,
            items = selectedGov.cities.map { c ->
                PickerOption(
                    value = c.displayName(isRtl),
                    label = if (isRtl) c.nameAr else "${c.nameEn} (${c.nameAr})",
                    searchKey = "${c.nameAr} ${c.nameEn}".lowercase(),
                    selected = selectedCity?.nameAr == c.nameAr,
                )
            },
            onDismiss = { showCitySheet = false },
            onSelect = { option ->
                onCitySelected(option.value)
                showCitySheet = false
            },
        )
    }
}

private data class PickerOption(
    val value: String,
    val label: String,
    val searchKey: String,
    val selected: Boolean,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SearchableLocationSheet(
    title: String,
    searchPlaceholder: String,
    isRtl: Boolean,
    items: List<PickerOption>,
    onDismiss: () -> Unit,
    onSelect: (PickerOption) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val brandColors = LocalBrandColors.current
    var query by remember { mutableStateOf("") }
    val filtered = remember(items, query) {
        val q = query.trim().lowercase()
        if (q.isEmpty()) items else items.filter { it.searchKey.contains(q) }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        CompositionLocalProvider(
            LocalLayoutDirection provides if (isRtl) LayoutDirection.Rtl else LayoutDirection.Ltr,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(
                            imageVector = Icons.Rounded.Close,
                            contentDescription = localized("إغلاق", "Close"),
                        )
                    }
                }

                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    singleLine = true,
                    placeholder = { Text(searchPlaceholder) },
                    leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
                    trailingIcon = {
                        if (query.isNotEmpty()) {
                            IconButton(onClick = { query = "" }) {
                                Icon(Icons.Rounded.Close, contentDescription = null)
                            }
                        }
                    },
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier.fillMaxWidth(),
                )

                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 380.dp),
                ) {
                    items(filtered, key = { it.label }) { option ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onSelect(option) }
                                .padding(horizontal = 8.dp, vertical = 14.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = option.label,
                                style = MaterialTheme.typography.bodyLarge,
                                fontWeight = if (option.selected) FontWeight.Bold else FontWeight.Normal,
                                color = if (option.selected) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.onSurface
                                },
                            )
                            if (option.selected) {
                                Icon(
                                    imageVector = Icons.Rounded.Check,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                )
                            }
                        }
                        HorizontalDivider(color = brandColors.hairline)
                    }
                }
            }
        }
    }
}
