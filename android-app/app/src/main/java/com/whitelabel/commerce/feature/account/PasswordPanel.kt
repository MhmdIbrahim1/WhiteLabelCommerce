package com.whitelabel.commerce.feature.account

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.designsystem.components.*
import kotlinx.coroutines.launch

enum class PasswordMode { Change, Request, Recover }

@Composable
fun PasswordPanel(mode: PasswordMode, token: String = "", viewModel: AccountViewModel = hiltViewModel()) {
    val request = mode == PasswordMode.Request
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var done by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val show = LocalBanner.current
    val title = if (request) localized("استعادة كلمة المرور","Reset password") else localized("تغيير كلمة المرور","Change password")
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(title, style = MaterialTheme.typography.titleLarge)
        if (mode != PasswordMode.Change && !BuildConfig.EMAIL_PASSWORD_RESET_ENABLED) {
            Text(localized("استعادة كلمة المرور بالبريد غير متاحة حالياً.","Email recovery is currently unavailable."))
        } else if (mode == PasswordMode.Recover && token.isBlank()) {
            Text(localized("رابط الاستعادة غير صالح.","This recovery link is invalid."))
        } else if (done) {
            Text(if (request) localized("تحقق من بريدك إذا كان الحساب مسجلاً.","If your account is registered, check your inbox.")
                else localized("تم تغيير كلمة المرور.","Your password has been changed."))
        } else {
            if (request) OutlinedTextField(email, { email = it }, label = { Text(localized("البريد الإلكتروني","Email address")) }, singleLine = true)
            else {
                OutlinedTextField(password, { password = it }, label = { Text(localized("كلمة المرور الجديدة","New password")) },
                    visualTransformation = PasswordVisualTransformation(), singleLine = true)
                OutlinedTextField(confirm, { confirm = it }, label = { Text(localized("تأكيد كلمة المرور","Confirm password")) },
                    visualTransformation = PasswordVisualTransformation(), singleLine = true)
            }
            if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error)
            Button(enabled = !busy, onClick = {
                if (request && !android.util.Patterns.EMAIL_ADDRESS.matcher(email.trim()).matches() ||
                    !request && (password.length !in 8..128 || password != confirm)) {
                    error = if (request) localized("أدخل بريداً صالحاً.","Enter a valid email address.")
                        else localized("استخدم ٨–١٢٨ حرفاً وأكد كلمة المرور بالتطابق.","Use 8–128 characters and enter matching passwords.")
                    show(BannerMessage(error, BannerKind.Error))
                } else {
                    busy = true; error = ""
                    scope.launch {
                        val result = when (mode) {
                            PasswordMode.Change -> viewModel.changePassword(password)
                            PasswordMode.Request -> viewModel.requestRecovery(email)
                            PasswordMode.Recover -> viewModel.finishRecovery(token, password)
                        }
                        busy = false
                        if (result.isSuccess) {
                            password = ""; confirm = ""; done = true
                            show(BannerMessage(localized("تم بنجاح","Request completed"), BannerKind.Success))
                        } else {
                            error = localized("تعذّر إتمام الطلب. أعد المحاولة أو اطلب رابطاً جديداً.","Could not complete the request. Try again or request a new link.")
                            show(BannerMessage(error, BannerKind.Error))
                        }
                    }
                }
            }) { Text(if (request) localized("إرسال رابط الاستعادة","Send reset link") else title) }
        }
    }
}
