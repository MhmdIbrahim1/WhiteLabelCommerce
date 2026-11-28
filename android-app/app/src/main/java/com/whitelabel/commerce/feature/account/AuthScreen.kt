package com.whitelabel.commerce.feature.account

import android.app.Activity
import android.content.ContextWrapper
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.R
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.StorefrontAuthInput
import kotlinx.coroutines.launch

@Composable
internal fun AuthScreen(
    storeName: String,
    form: AuthFormState,
    showBackButton: Boolean,
    onBack: () -> Unit,
    onOpenSupport: () -> Unit,
    darkThemeOverride: Boolean?,
    onSetDarkThemePreference: (Boolean?) -> Unit,
    isRtl: Boolean,
    onSelectLanguage: (String) -> Unit,
    onOtpEmailChange: (String) -> Unit,
    onOtpCodeChange: (String) -> Unit,
    onResetOtpEmail: () -> Unit,
    onSendOtp: () -> Unit,
    onVerifyOtp: () -> Unit,
    onGoogleSignIn: suspend (suspend () -> GoogleIdTokenResult, (String) -> Unit) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val busy = form.action != null

    Column(
        modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (showBackButton) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, localized("رجوع", "Back"))
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                localized("مرحباً بك في $storeName", "Welcome to $storeName"),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            Text(
                localized(
                    "سجّل الدخول لحفظ عنوان الشحن ومتابعة طلبات هذا المتجر على الموقع والتطبيق.",
                    "Sign in to save your shipping details and track this store’s orders on the web and in the app.",
                ),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (BuildConfig.SUPABASE_URL != "https://unconfigured.invalid") {
            OutlinedButton(
                onClick = {
                    val activity = generateSequence(context) { (it as? ContextWrapper)?.baseContext }
                        .filterIsInstance<Activity>().firstOrNull()
                    scope.launch {
                        onGoogleSignIn(
                            { activity?.let { GoogleSignInBridge.signIn(it, BuildConfig.GOOGLE_WEB_CLIENT_ID) }
                                ?: GoogleIdTokenResult.Unavailable },
                            { url -> GoogleSignInBridge.openBrowser(activity ?: error("google_unavailable"), url) },
                        )
                    }
                },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                shape = MaterialTheme.shapes.small,
                colors = ButtonDefaults.outlinedButtonColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    contentColor = MaterialTheme.colorScheme.onSurface,
                ),
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (form.action in setOf(AuthAction.Google, AuthAction.GoogleBrowser, AuthAction.GoogleCallback)) InlineSpinner()
                    else Image(painterResource(R.drawable.ic_google_g), null, Modifier.size(20.dp))
                    Text(localized("المتابعة باستخدام Google", "Continue with Google"))
                }
            }
            if (form.googleError != null) {
                AuthFeedback(form.googleError, neutral = form.googleError == "google_unavailable")
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                HorizontalDivider(Modifier.weight(1f), color = LocalBrandColors.current.hairline)
                Text(localized("أو عبر البريد الإلكتروني", "or continue with email"), style = MaterialTheme.typography.labelMedium)
                HorizontalDivider(Modifier.weight(1f), color = LocalBrandColors.current.hairline)
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
            shape = MaterialTheme.shapes.large,
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                val wait = form.resendCooldownSeconds
                if (form.otpSent) {
                    Text(localized("أدخل الرمز المرسل إلى", "Enter the code sent to"), style = MaterialTheme.typography.titleMedium)
                    Text(form.otpEmail, style = MaterialTheme.typography.bodyMedium.copy(textDirection = TextDirection.Ltr))
                    TextButton(onClick = onResetOtpEmail, enabled = !busy) {
                        Text(localized("تغيير البريد", "Change email"))
                    }
                    OtpInput(form.otpCode, onOtpCodeChange, !busy, onVerifyOtp)
                    Button(
                        onClick = onVerifyOtp,
                        enabled = !busy && StorefrontAuthInput.isOtpReady(form.otpCode),
                        modifier = Modifier.fillMaxWidth(),
                        shape = MaterialTheme.shapes.small,
                    ) {
                        if (form.action == AuthAction.Verify) InlineSpinner()
                        else Text(localized("تأكيد وتسجيل الدخول", "Verify & Sign In"))
                    }
                    OutlinedButton(
                        onClick = onSendOtp,
                        enabled = !busy && wait == 0,
                        modifier = Modifier.fillMaxWidth(),
                        shape = MaterialTheme.shapes.small,
                    ) {
                        if (form.action == AuthAction.Send) InlineSpinner()
                        else Text(
                            if (wait > 0) localized("إعادة إرسال الرمز خلال $wait ث", "Resend code in ${wait}s")
                            else localized("إعادة إرسال الرمز", "Resend code"),
                            style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = "tnum"),
                        )
                    }
                } else {
                    OutlinedTextField(
                        value = form.otpEmail,
                        onValueChange = onOtpEmailChange,
                        enabled = !busy,
                        label = { Text(localized("البريد الإلكتروني", "Email address")) },
                        singleLine = true,
                        textStyle = MaterialTheme.typography.bodyLarge.copy(textDirection = TextDirection.Ltr),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Send),
                        keyboardActions = KeyboardActions(onSend = { onSendOtp() }),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Button(
                        onClick = onSendOtp,
                        enabled = !busy && wait == 0 && form.otpEmail.isNotBlank(),
                        modifier = Modifier.fillMaxWidth(),
                        shape = MaterialTheme.shapes.small,
                    ) {
                        if (form.action == AuthAction.Send) InlineSpinner()
                        else Text(
                            if (wait > 0) localized("إرسال رمز التحقق خلال $wait ث", "Send code in ${wait}s")
                            else localized("إرسال رمز التحقق", "Send 6-digit code"),
                            style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = "tnum"),
                        )
                    }
                }
                form.emailError?.let { AuthFeedback(it) }
            }
        }

        PreferencesAndSupportCard(darkThemeOverride, onSetDarkThemePreference, isRtl, onSelectLanguage, onOpenSupport)
        Surface(color = MaterialTheme.colorScheme.surfaceContainer, shape = MaterialTheme.shapes.small) {
            Row(
                Modifier.fillMaxWidth().padding(12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Rounded.Shield, null, modifier = Modifier.size(20.dp))
                Text(
                    localized("يمكنك دائماً إتمام الشراء كزائر بدون حساب.", "You can always check out as a guest."),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
private fun OtpInput(code: String, onChange: (String) -> Unit, enabled: Boolean, onVerify: () -> Unit) {
    val label = localized("رمز التحقق المكوّن من ستة أرقام", "6-digit verification code")
    var selection by remember { mutableStateOf(TextRange(code.length)) }
    var focused by remember { mutableStateOf(false) }
    val text = TextFieldValue(code, selection)
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        BasicTextField(
            value = text,
            onValueChange = { edit ->
                val normalized = StorefrontAuthInput.normalizeOtp(edit.text)
                fun digitOffset(offset: Int) = StorefrontAuthInput.normalizeOtp(edit.text.take(offset)).length
                selection = TextRange(digitOffset(edit.selection.start), digitOffset(edit.selection.end))
                onChange(normalized)
            },
            enabled = enabled,
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { if (StorefrontAuthInput.isOtpReady(code)) onVerify() }),
            modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused }
                .semantics { contentDescription = label },
            decorationBox = { innerTextField ->
                Box(contentAlignment = Alignment.CenterStart) {
                    Row(
                        Modifier.fillMaxWidth().clearAndSetSemantics {},
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        repeat(6) { index ->
                            val active = focused && index == text.selection.end.coerceIn(0, 5)
                            Surface(
                                modifier = Modifier.weight(1f).heightIn(min = 52.dp),
                                color = MaterialTheme.colorScheme.surface,
                                shape = MaterialTheme.shapes.small,
                                border = BorderStroke(
                                    if (active) 2.dp else 1.dp,
                                    if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                                ),
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text(
                                        code.getOrNull(index)?.toString().orEmpty(),
                                        style = MaterialTheme.typography.titleLarge.copy(fontFeatureSettings = "tnum"),
                                    )
                                }
                            }
                        }
                    }
                    // A single editable field retains native IME, paste, selection and accessibility actions.
                    Box(Modifier.fillMaxWidth().alpha(0f)) { innerTextField() }
                }
            },
        )
    }
}

@Composable
internal fun InlineSpinner() {
    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = androidx.compose.material3.LocalContentColor.current)
}

@Composable
internal fun AuthFeedback(code: String, neutral: Boolean = false) {
    Surface(
        modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
        color = if (neutral) MaterialTheme.colorScheme.surfaceContainerHigh else MaterialTheme.colorScheme.errorContainer,
        contentColor = if (neutral) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onErrorContainer,
        shape = MaterialTheme.shapes.small,
    ) {
        Text(mapAuthError(code), Modifier.padding(12.dp), style = MaterialTheme.typography.bodyMedium)
    }
}
