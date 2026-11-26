package com.whitelabel.commerce.feature.addresses

import com.whitelabel.commerce.core.designsystem.components.BannerKind
import com.whitelabel.commerce.core.designsystem.components.BannerFeedback
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.whitelabel.commerce.core.data.remote.PhoneNormalizer
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.CustomerAddress
import com.whitelabel.commerce.core.domain.model.EgyptLocations
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.util.UUID

@Composable
fun AddressBook(
    account: String?,
    initial: CustomerAddress,
    onDelivery: ((CustomerAddress) -> Unit)? = null,
    onBusy: (Boolean) -> Unit = {},
    viewModel: AddressBookViewModel = hiltViewModel(),
) = key(account) {
    val checkout = onDelivery != null
    val scope = rememberCoroutineScope()
    var rows by remember { mutableStateOf(emptyList<CustomerAddress>()) }
    var draft by rememberSaveable { mutableStateOf(initial) }
    var touched by rememberSaveable { mutableStateOf(false) }
    var keepPin by rememberSaveable { mutableStateOf(false) }
    var editing by rememberSaveable { mutableStateOf(false) }
    var editor by rememberSaveable { mutableStateOf(checkout) }
    var busy by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf("") }
    var locationNotice by rememberSaveable { mutableStateOf("") }
    var reload by remember { mutableIntStateOf(0) }
    var failedLoad by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf<CustomerAddress?>(null) }
    var loading by remember { mutableStateOf(account != null) }
    LaunchedEffect(busy, loading) { onBusy(busy || loading) }
    val ctx = LocalContext.current
    val links = LocalUriHandler.current
    val en = localized("ar","en") == "en"

    fun applyDraft(next: CustomerAddress) {
        draft = next
        touched = true
        onDelivery?.invoke(next)
    }
    LaunchedEffect(initial) { if (!touched) draft = initial }
    LaunchedEffect(account, reload) {
        failedLoad = false
        if (account != null) {
            try {
                rows = viewModel.addresses()
                val first = rows.find { it.isDefault }
                if (checkout && !touched && first != null) {
                    applyDraft(first)
                    editor = false
                }
            } catch (e: CancellationException) { throw e }
            catch (_: Exception) { failedLoad = true }
            finally { loading = false }
        }
    }
    fun change(action: String, row: CustomerAddress) {
        if (busy) return
        busy = true
        scope.launch {
            try {
                rows = viewModel.change(action, row)
                editor = false
                if (checkout) rows.find { it.id == row.id }?.let(::applyDraft)
                notice = localized("تم تحديث العناوين.", "Address book updated.")
            } catch (e: CancellationException) { throw e }
            catch (_: Exception) { notice = localized("تعذر حفظ التغيير. أعد المحاولة.", "Could not save changes. Try again.") }
            finally { busy = false }
        }
    }
    fun locate() {
        if (busy) return
        busy = true
        scope.launch {
            locationNotice = localized("جارٍ تحديد عنوانك…", "Finding your address…")
            try {
                val result = locateAddress(ctx, if (en) "en" else "ar", draft)
                keepPin = true
                applyDraft(result.address)
                locationNotice = if (result.complete) localized("راجع العنوان وأضف تفاصيل المبنى.", "Check your address and add building details.")
                    else localized("تم حفظ موقعك. تعذر إكمال العنوان تلقائياً، فأدخل التفاصيل الناقصة.",
                        "Location pin saved. Address lookup was unavailable or incomplete. Fill in the missing details.")
            } catch (e: CancellationException) { throw e }
            catch (e: LocationFailure) {
                locationNotice = when (e.issue) {
                    LocationIssue.Permission -> localized("اسمح بالوصول إلى الموقع من إعدادات التطبيق.", "Allow location access in app settings.")
                    LocationIssue.Disabled -> localized("فعّل خدمة الموقع من إعدادات الهاتف ثم حاول مجدداً.", "Turn on Location in your device settings and try again.")
                    LocationIssue.Timeout -> localized("انتهت مهلة تحديد الموقع. جرّب قرب نافذة أو أدخل العنوان.", "Location timed out. Try near a window or enter your address.")
                }
            } catch (_: SecurityException) {
                locationNotice = localized("اسمح بالوصول إلى الموقع من إعدادات التطبيق.", "Allow location access in app settings.")
            } catch (_: Exception) {
                locationNotice = localized("تعذر قراءة الموقع. تحقق من إعدادات الموقع وحاول مجدداً.", "Could not read your location. Check your location settings and try again.")
            } finally { busy = false }
        }
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        if (grants.values.any { it }) locate()
        else locationNotice = localized("تم رفض إذن الموقع. اسمح بالوصول من إعدادات التطبيق.", "Location permission denied. Allow location access in app settings.")
    }
    fun start(row: CustomerAddress?) {
        keepPin = false
        locationNotice = ""
        editing = row != null
        applyDraft(row ?: CustomerAddress(id = UUID.randomUUID().toString(), recipientName = initial.recipientName, phone = initial.phone))
        editor = true
        notice = ""
    }
    fun label(key: String) = when (key) {
        "home" -> localized("المنزل","Home")
        "work" -> localized("العمل","Work")
        else -> localized("آخر","Other")
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        if (!checkout) Text(localized("عناويني","My Addresses"), style = MaterialTheme.typography.titleLarge)
        if (notice.isNotBlank()) BannerFeedback(notice, BannerKind.Info)
        if (failedLoad) TextButton({ reload++ }) { Text(localized("تعذر تحميل العناوين. إعادة المحاولة", "Could not load addresses. Retry")) }
        rows.forEach { row ->
            val title = label(row.label) + if (row.isDefault) localized(" · افتراضي", " · Default") else ""
            if (checkout) {
                FilterChip(selected = !editor && draft.id == row.id, enabled = !busy, onClick = { applyDraft(row); editor = false },
                    label = { Column { Text(title); Text(row.recipientName + " · " + row.phone); Text(row.addressLine(), style = MaterialTheme.typography.bodySmall) } })
            } else {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(row.recipientName + " · " + row.phone)
                Text(row.addressLine())
                Row {
                    TextButton({ start(row) }, enabled = !busy) { Text(localized("تعديل","Edit")) }
                    if (!row.isDefault) TextButton({ change("default",row) }, enabled = !busy) { Text(localized("تعيين كافتراضي","Set default")) }
                    TextButton({ confirm = row }, enabled = !busy) { Text(localized("حذف","Delete")) }
                }
            }
        }
        if (!editor) OutlinedButton({ start(null) }, enabled = !busy) { Text(localized("إضافة عنوان","Add address")) }
        if (editor) {
            OutlinedButton(onClick = {
                if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) locate()
                else permission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
            }, enabled = !busy) { Text(localized("حدد موقعي","Locate my location")) }
            if (locationNotice.isNotBlank()) {
                Text(locationNotice, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    style = MaterialTheme.typography.bodySmall)
            }
            if (keepPin && draft.lat != null) TextButton({
                keepPin = false
                locationNotice = ""
                applyDraft(draft.copy(lat = null, lng = null))
            }, enabled = !busy) { Text(localized("إزالة دبوس الموقع", "Remove location pin")) }
            TextButton({ links.openUri("https://www.openstreetmap.org/copyright") }) { Text("© OpenStreetMap") }
            if (account != null) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("home","work","other").forEach { key ->
                    FilterChip(draft.label == key, { applyDraft(draft.copy(label = key)) }, { Text(label(key)) }, enabled = !busy)
                }
            }
            AddressField(localized("اسم المستلم","Recipient name"), draft.recipientName, busy, 100) { applyDraft(draft.copy(recipientName = it)) }
            AddressField(localized("هاتف التوصيل","Delivery phone"), draft.phone, busy, 24, KeyboardType.Phone) { applyDraft(draft.copy(phone = it)) }
            var menu by remember { mutableStateOf(false) }
            Box {
                val g = EgyptLocations.findGovernorate(draft.governorate)
                OutlinedButton({ menu = true }, enabled = !busy) { Text(g?.displayName(!en) ?: localized("اختر المحافظة","Select governorate")) }
                DropdownMenu(menu, { menu = false }) {
                    EgyptLocations.governorates.forEach { governorate ->
                        DropdownMenuItem({ Text(governorate.displayName(!en)) }, {
                            applyDraft(draft.copy(governorate = governorate.id, city = "", lat = draft.lat.takeIf { keepPin }, lng = draft.lng.takeIf { keepPin })); menu = false
                        })
                    }
                }
            }
            AddressField(localized("المدينة / المنطقة","City / area"),draft.city,busy,100) { applyDraft(draft.copy(city=it,lat=draft.lat.takeIf { keepPin },lng=draft.lng.takeIf { keepPin })) }
            AddressField(localized("الشارع","Street"),draft.street,busy,240) { applyDraft(draft.copy(street=it,lat=draft.lat.takeIf { keepPin },lng=draft.lng.takeIf { keepPin })) }
            AddressField(localized("العمارة","Building"),draft.building,busy,40) { applyDraft(draft.copy(building=it)) }
            AddressField(localized("الدور","Floor"),draft.floor,busy,20) { applyDraft(draft.copy(floor=it)) }
            AddressField(localized("الشقة","Apartment"),draft.apartment,busy,20) { applyDraft(draft.copy(apartment=it)) }
            AddressField(localized("أقرب معلم","Nearby landmark"),draft.landmark,busy,100) { applyDraft(draft.copy(landmark=it)) }
            if (account != null) {
                FilterChip(draft.isDefault,{ applyDraft(draft.copy(isDefault = !draft.isDefault)) },{ Text(localized("استخدام كافتراضي","Use as default")) }, enabled = !busy)
                Button(onClick = {
                    val normalized = PhoneNormalizer.normalizeForEgyptCheckout(draft.phone)
                    if (draft.recipientName.trim().length < 2 || !PhoneNormalizer.isValid(normalized) ||
                        draft.governorate.isBlank() || draft.city.isBlank() || draft.street.isBlank() || draft.addressLine().length > 500) {
                        notice = localized("تحقق من الاسم والهاتف والمحافظة والمدينة والشارع.", "Check the recipient, phone, governorate, city and street.")
                    } else {
                        val row = draft.copy(id = draft.id.ifBlank { UUID.randomUUID().toString() }, phone = normalized)
                        applyDraft(row)
                        change(if (editing) "edit" else "add",row)
                    }
                }, enabled = !busy) { Text(localized("حفظ العنوان","Save address")) }
            }
            if (!checkout) TextButton({ editor = false }, enabled = !busy) { Text(localized("إلغاء","Cancel")) }
        }
    }
    confirm?.let { row ->
        AlertDialog(onDismissRequest = { confirm = null }, title = { Text(localized("حذف العنوان؟","Delete this address?")) },
            confirmButton = { TextButton({ confirm = null; change("delete",row) }) { Text(localized("حذف","Delete")) } },
            dismissButton = { TextButton({ confirm = null }) { Text(localized("إلغاء","Cancel")) } })
    }
}

@Composable
private fun AddressField(label: String, value: String, busy: Boolean, maxLength: Int, keyboard: KeyboardType = KeyboardType.Text, onChange: (String) -> Unit) {
    OutlinedTextField(value, { if (it.length <= maxLength) onChange(it) }, modifier = Modifier.fillMaxWidth(),
        label = { Text(label) }, singleLine = true, enabled = !busy, keyboardOptions = KeyboardOptions(keyboardType = keyboard))
}
