package com.whitelabel.commerce.feature.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.StorefrontAuthInput

@Composable
internal fun StoreOnboardingScreen(
    email: String,
    storeName: String,
    form: OnboardingFormState,
    accountError: String?,
    onNameChange: (String) -> Unit,
    onPhoneChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val nameError = form.attempted && !StorefrontAuthInput.validName(form.fullName)
    val phoneError = form.attempted && !StorefrontAuthInput.validPhone(form.phone)
    Column(
        modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.large,
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
        ) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    localized("مرحباً بك في $storeName", "Welcome to $storeName"),
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    localized("أضف بياناتك لهذا المتجر.", "Add your details for this store."),
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(email, style = MaterialTheme.typography.bodyMedium.copy(textDirection = TextDirection.Ltr))
                TextButton(onClick = onSignOut, enabled = !form.saving) {
                    Text(localized("تسجيل الخروج / تبديل الحساب", "Sign out / Switch account"))
                }
                OutlinedTextField(
                    value = form.fullName,
                    onValueChange = onNameChange,
                    enabled = !form.saving,
                    label = { Text(localized("الاسم بالكامل", "Full name")) },
                    singleLine = true,
                    isError = nameError || form.serverError?.contains("invalid_name") == true,
                    supportingText = if (nameError) ({ Text(mapAuthError("invalid_name")) }) else null,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Next),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = form.phone,
                    onValueChange = onPhoneChange,
                    enabled = !form.saving,
                    label = { Text(localized("رقم الموبايل المصري (اختياري)", "Egyptian mobile (optional)")) },
                    singleLine = true,
                    isError = phoneError || form.serverError?.contains("phone") == true,
                    supportingText = if (phoneError) ({ Text(mapAuthError("invalid_phone")) }) else null,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(textDirection = TextDirection.Ltr),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { onSubmit() }),
                    modifier = Modifier.fillMaxWidth(),
                )
                (form.serverError ?: accountError)?.let { AuthFeedback(it) }
                Button(
                    onClick = onSubmit,
                    enabled = !form.saving,
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (form.saving) InlineSpinner() else Text(localized("حفظ والمتابعة", "Save & Continue"))
                }
            }
        }
    }
}
