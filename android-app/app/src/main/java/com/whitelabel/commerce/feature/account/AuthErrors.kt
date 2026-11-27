package com.whitelabel.commerce.feature.account

import com.whitelabel.commerce.core.designsystem.localized
import io.github.jan.supabase.auth.exception.AuthRestException
import io.github.jan.supabase.exceptions.HttpRequestException
import io.github.jan.supabase.exceptions.RestException
import java.io.IOException

internal fun authErrorDetail(error: Throwable): String {
    if (generateSequence(error) { it.cause }.any { it is IOException || it is HttpRequestException }) return "network"
    if (error is RestException && error.statusCode == 429) return "rate_limit"
    if (error is AuthRestException) {
        val detail = error.message.orEmpty().lowercase()
        if ("unacceptable audience" in detail || error.error == "provider_disabled") return "google_unavailable"
        if (error.error == "unexpected_failure" && "sending" in detail) return "email_delivery"
    }
    return ((error as? RestException)?.error ?: error.message.orEmpty()).lowercase()
}

internal fun mapAuthError(raw: String): String = when {
    raw == "network" -> localized("تحقق من اتصالك بالإنترنت ثم أعد المحاولة.", "Check your connection and try again.")
    "invalid_name" in raw -> localized("أدخل اسمًا من حرفين إلى ١٠٠ حرف.", "Enter a name between 2 and 100 characters.")
    "phone_already_in_use" in raw -> localized(
        "هذا الرقم مستخدم بالفعل في هذا المتجر. جرّب رقمًا آخر أو اترك الحقل فارغًا.",
        "This number is already in use at this store. Try another number or leave it blank.",
    )
    "invalid_phone" in raw -> localized(
        "أدخل رقم موبايل مصريًا يبدأ بـ ٠١٠ أو ٠١١ أو ٠١٢ أو ٠١٥.",
        "Enter an Egyptian mobile number starting with 010, 011, 012 or 015.",
    )
    "unconfirmed" in raw || "email_not_confirmed" in raw -> localized(
        "يرجى تأكيد بريدك الإلكتروني باستخدام الرمز المرسل إليك.", "Please confirm your email using the code in your inbox.",
    )
    "store_unavailable" in raw -> localized("هذا المتجر غير متاح حاليًا. حاول لاحقًا.", "This store is currently unavailable. Please try again later.")
    raw == "email_address_invalid" -> localized("أدخل بريدًا إلكترونيًا صحيحًا.", "Enter a valid email address.")
    raw == "email_address_not_authorized" || raw == "email_delivery" -> localized(
        "تعذّر إرسال الرمز. تحقق من عنوان البريد ثم أعد المحاولة بعد قليل.",
        "We couldn’t send the code. Check your email address and try again shortly.",
    )
    raw == "google_unavailable" -> localized(
        "تسجيل الدخول باستخدام Google غير متاح حاليًا. تابع برمز البريد المكوّن من ٦ أرقام.",
        "Google sign-in is unavailable. Continue with the 6-digit email code.",
    )
    raw == "signup_disabled" || raw == "email_provider_disabled" -> localized("التسجيل غير متاح حاليًا.", "Registration is currently unavailable.")
    "rate_limit" in raw || "rate limit" in raw || "security purposes" in raw || "429" in raw -> localized(
        "تم إرسال محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.", "Too many attempts. Please wait a little and try again.",
    )
    "expired" in raw -> localized("انتهت صلاحية الرمز. اطلب رمزًا جديدًا.", "This verification code has expired. Request a new code.")
    "otp" in raw -> localized("رمز التحقق غير صحيح. راجع الأرقام الستة ثم أعد المحاولة.", "Check the 6-digit verification code and try again.")
    else -> localized("تعذّر إكمال العملية الآن. أعد المحاولة.", "We couldn’t complete this request. Please try again.")
}
