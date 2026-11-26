package com.whitelabel.commerce.feature.account

import com.whitelabel.commerce.core.designsystem.components.BannerFeedback
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Email
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Phone
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.LocalStoreSettings
import com.whitelabel.commerce.core.designsystem.localized

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuthScreen(
    form: AuthFormState,
    showBackButton: Boolean = true,
    onBack: () -> Unit,
    onOpenSupport: () -> Unit = {},
    darkThemeOverride: Boolean? = null,
    onSetDarkThemePreference: (Boolean?) -> Unit = {},
    isRtl: Boolean = true,
    onSelectLanguage: (String) -> Unit = {},
    onSelectTab: (AuthTab) -> Unit,
    onSelectPasswordMode: (PasswordAuthMode) -> Unit,
    onOtpEmailChange: (String) -> Unit,
    onOtpCodeChange: (String) -> Unit,
    onResetOtpEmail: () -> Unit,
    onSendOtp: () -> Unit,
    onVerifyOtp: () -> Unit,
    onFullNameChange: (String) -> Unit,
    onPhoneChange: (String) -> Unit,
    onPasswordEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onSubmitPasswordAuth: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val storeSettings = LocalStoreSettings.current
    val brandColors = LocalBrandColors.current
    var showPassword by remember { mutableStateOf(false) }

    var showRecovery by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    if (showRecovery && com.whitelabel.commerce.BuildConfig.EMAIL_PASSWORD_RESET_ENABLED) {
        androidx.compose.material3.AlertDialog(onDismissRequest = { showRecovery = false },
            text = { PasswordPanel(PasswordMode.Request) },
            confirmButton = { TextButton(onClick = { showRecovery = false }) { Text(localized("إغلاق","Close")) } })
    }
    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            if (showBackButton) {
                TopAppBar(
                    title = {
                        Text(
                            text = localized("تسجيل الدخول / حسابي", "Sign In / Account"),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                        )
                    },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                                contentDescription = localized("رجوع", "Back"),
                            )
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        titleContentColor = MaterialTheme.colorScheme.onSurface,
                    ),
                )
            }
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Welcome Header
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = localized("مرحباً بك في ${storeSettings.storeName}", "Welcome to ${storeSettings.storeName}"),
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = localized(
                        "سجّل الدخول لحفظ عنوان الشحن ومتابعة طلبات هذا المتجر بين الموقع والتطبيق.",
                        "Sign in to save your shipping profile and track this store’s orders across web and app.",
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // Auth Method Switcher (Email OTP vs Password)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(
                    selected = form.activeTab == AuthTab.EMAIL_OTP,
                    onClick = { onSelectTab(AuthTab.EMAIL_OTP) },
                    label = {
                        Text(
                            text = localized("رمز التحقق", "Email OTP"),
                            maxLines = 1,
                        )
                    },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Rounded.Email,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                    },
                    modifier = Modifier.weight(1f),
                )
                FilterChip(
                    selected = form.activeTab == AuthTab.PASSWORD,
                    onClick = { onSelectTab(AuthTab.PASSWORD) },
                    label = {
                        Text(
                            text = localized("كلمة المرور", "Email & Password"),
                            maxLines = 1,
                        )
                    },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Rounded.Key,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                    },
                    modifier = Modifier.weight(1f),
                )
            }

            // Feedback Banners
            form.infoMessage?.let { msg ->
                Surface(
                    color = brandColors.success.copy(alpha = 0.14f),
                    contentColor = brandColors.success,
                    shape = MaterialTheme.shapes.small,
                    border = BorderStroke(1.dp, brandColors.success.copy(alpha = 0.35f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = msg,
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(12.dp),
                    )
                }
            }

            form.errorMessage?.let { BannerFeedback(it) }

            // Main Form Card
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, brandColors.hairline),
                shape = MaterialTheme.shapes.medium,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (form.activeTab == AuthTab.EMAIL_OTP) {
                        if (!form.otpSent) {
                            OutlinedTextField(
                                value = form.otpEmail,
                                onValueChange = onOtpEmailChange,
                                label = { Text(localized("البريد الإلكتروني", "Email address")) },
                                placeholder = { Text("name@example.com") },
                                leadingIcon = { Icon(Icons.Rounded.Email, contentDescription = null) },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                                singleLine = true,
                                shape = MaterialTheme.shapes.small,
                                modifier = Modifier.fillMaxWidth(),
                            )

                            Button(
                                onClick = onSendOtp,
                                enabled = !form.isSubmitting && form.otpEmail.isNotBlank() && form.resendCooldownSeconds == 0,
                                shape = MaterialTheme.shapes.small,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(48.dp),
                            ) {
                                if (form.isSubmitting) {
                                    CircularProgressIndicator(
                                        strokeWidth = 2.dp,
                                        color = MaterialTheme.colorScheme.onPrimary,
                                        modifier = Modifier.size(20.dp),
                                    )
                                } else {
                                    Text(
                                        text = if (form.resendCooldownSeconds > 0) {
                                            localized(
                                                "انتظر ${form.resendCooldownSeconds} ثانية",
                                                "Wait ${form.resendCooldownSeconds}s",
                                            )
                                        } else {
                                            localized("إرسال رمز التحقق", "Send Code")
                                        },
                                    )
                                }
                            }
                        } else {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = form.otpEmail.trim(),
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                TextButton(onClick = onResetOtpEmail) {
                                    Text(localized("تغيير البريد", "Change email"))
                                }
                            }

                            OutlinedTextField(
                                value = form.otpCode,
                                onValueChange = onOtpCodeChange,
                                label = { Text(localized("رمز التحقق", "verification code")) },
                                placeholder = { Text("00000000") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                                singleLine = true,
                                textStyle = MaterialTheme.typography.titleLarge.copy(
                                    textAlign = TextAlign.Center,
                                    letterSpacing = 6.sp,
                                    fontWeight = FontWeight.Bold,
                                ),
                                shape = MaterialTheme.shapes.small,
                                modifier = Modifier.fillMaxWidth(),
                            )

                            Button(
                                onClick = onVerifyOtp,
                                enabled = !form.isSubmitting && form.otpCode.length in 6..10,
                                shape = MaterialTheme.shapes.small,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(48.dp),
                            ) {
                                if (form.isSubmitting) {
                                    CircularProgressIndicator(
                                        strokeWidth = 2.dp,
                                        color = MaterialTheme.colorScheme.onPrimary,
                                        modifier = Modifier.size(20.dp),
                                    )
                                } else {
                                    Text(localized("تأكيد وتسجيل الدخول", "Verify & Sign In"))
                                }
                            }

                            OutlinedButton(
                                onClick = onSendOtp,
                                enabled = !form.isSubmitting && form.resendCooldownSeconds == 0,
                                shape = MaterialTheme.shapes.small,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Refresh,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp),
                                )
                                Spacer(modifier = Modifier.size(6.dp))
                                Text(
                                    text = if (form.resendCooldownSeconds > 0) {
                                        localized(
                                            "إعادة الإرسال خلال ${form.resendCooldownSeconds} ثانية",
                                            "Resend code in ${form.resendCooldownSeconds}s",
                                        )
                                    } else {
                                        localized("إعادة إرسال الرمز", "Resend code")
                                    },
                                )
                            }
                        }
                    } else {
                        // Password Tab: Sign In vs Create Account sub-toggle
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            FilterChip(
                                selected = form.passwordMode == PasswordAuthMode.SIGN_IN,
                                onClick = { onSelectPasswordMode(PasswordAuthMode.SIGN_IN) },
                                label = { Text(localized("تسجيل الدخول", "Sign In")) },
                                modifier = Modifier.weight(1f),
                            )
                            FilterChip(
                                selected = form.passwordMode == PasswordAuthMode.REGISTER,
                                onClick = { onSelectPasswordMode(PasswordAuthMode.REGISTER) },
                                label = { Text(localized("حساب جديد", "Create Account")) },
                                modifier = Modifier.weight(1f),
                            )
                        }

                        if (form.passwordMode == PasswordAuthMode.REGISTER) {
                            OutlinedTextField(
                                value = form.fullName,
                                onValueChange = onFullNameChange,
                                label = { Text(localized("الاسم بالكامل", "Full name")) },
                                leadingIcon = { Icon(Icons.Rounded.Person, contentDescription = null) },
                                singleLine = true,
                                shape = MaterialTheme.shapes.small,
                                modifier = Modifier.fillMaxWidth(),
                            )

                            OutlinedTextField(
                                value = form.phone,
                                onValueChange = onPhoneChange,
                                label = { Text(localized("رقم الموبايل", "Egyptian mobile")) },
                                placeholder = { Text("01012345678") },
                                leadingIcon = { Icon(Icons.Rounded.Phone, contentDescription = null) },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                                singleLine = true,
                                shape = MaterialTheme.shapes.small,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }

                        OutlinedTextField(
                            value = form.passwordEmail,
                            onValueChange = onPasswordEmailChange,
                            label = { Text(localized("البريد الإلكتروني", "Email address")) },
                            placeholder = { Text("name@example.com") },
                            leadingIcon = { Icon(Icons.Rounded.Email, contentDescription = null) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                            singleLine = true,
                            shape = MaterialTheme.shapes.small,
                            modifier = Modifier.fillMaxWidth(),
                        )

                        OutlinedTextField(
                            value = form.password,
                            onValueChange = onPasswordChange,
                            label = { Text(localized("كلمة المرور", "Password")) },
                            placeholder = { Text(localized("6 أحرف على الأقل", "At least 6 characters")) },
                            leadingIcon = { Icon(Icons.Rounded.Lock, contentDescription = null) },
                            trailingIcon = {
                                IconButton(onClick = { showPassword = !showPassword }) {
                                    Icon(
                                        imageVector = if (showPassword) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                                        contentDescription = localized("إظهار كلمة المرور", "Toggle password visibility"),
                                    )
                                }
                            },
                            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                            singleLine = true,
                            shape = MaterialTheme.shapes.small,
                            modifier = Modifier.fillMaxWidth(),
                        )

                        if (com.whitelabel.commerce.BuildConfig.EMAIL_PASSWORD_RESET_ENABLED && form.passwordMode == PasswordAuthMode.SIGN_IN) {
                            TextButton(onClick = { showRecovery = true }) { Text(localized("نسيت كلمة المرور؟","Forgot password?")) }
                        }
                        Button(
                            onClick = onSubmitPasswordAuth,
                            enabled = !form.isSubmitting && form.passwordEmail.isNotBlank() && form.password.isNotBlank(),
                            shape = MaterialTheme.shapes.small,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp),
                        ) {
                            if (form.isSubmitting) {
                                CircularProgressIndicator(
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.onPrimary,
                                    modifier = Modifier.size(20.dp),
                                )
                            } else {
                                Text(
                                    text = if (form.passwordMode == PasswordAuthMode.REGISTER) {
                                        localized("إنشاء الحساب", "Create Account")
                                    } else {
                                        localized("تسجيل الدخول", "Sign In")
                                    },
                                )
                            }
                        }
                    }
                }
            }

            // Preferences & Support available to guests without signing in
            PreferencesAndSupportCard(
                darkThemeOverride = darkThemeOverride,
                onSetDarkThemePreference = onSetDarkThemePreference,
                isRtl = isRtl,
                onSelectLanguage = onSelectLanguage,
                onOpenSupport = onOpenSupport,
            )

            // Reassurance note keeping Guest Checkout 100% open
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Shield,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp),
                    )
                    Text(
                        text = localized(
                            "التسجيل اختياري بالكامل — يمكنك دائماً إتمام الشراء كزائر بدون حساب.",
                            "Signing in is completely optional — Guest Checkout is always available.",
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
