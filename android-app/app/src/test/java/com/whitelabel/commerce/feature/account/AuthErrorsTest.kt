package com.whitelabel.commerce.feature.account

import com.whitelabel.commerce.core.designsystem.arabicLanguage
import io.github.jan.supabase.auth.exception.AuthRestException
import io.github.jan.supabase.exceptions.RestException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

class AuthErrorsTest {
    @Test fun serverErrorsReachTheAppropriateLocalizedMessage() {
        val messages = mapOf(
            "invalid_name" to ("100 characters" to "١٠٠"),
            "invalid_phone" to ("Egyptian mobile" to "مصريًا"),
            "phone_already_in_use" to ("another number" to "رقمًا آخر"),
            "unconfirmed" to ("confirm your email" to "تأكيد بريدك"),
            "store_unavailable" to ("store is currently unavailable" to "المتجر غير متاح"),
            "over_request_rate_limit" to ("Too many attempts" to "محاولات كثيرة"),
            "otp_expired" to ("expired" to "انتهت"),
            "otp_disabled_or_invalid" to ("6-digit verification code" to "الأرقام الستة"),
            "email_delivery" to ("send the code" to "إرسال الرمز"),
            "email_address_not_authorized" to ("send the code" to "إرسال الرمز"),
            "google_unavailable" to ("6-digit email code" to "٦ أرقام"),
            "network" to ("connection" to "اتصالك"),
        )
        val previous = arabicLanguage.value
        try {
            for ((code, expected) in messages) {
                arabicLanguage.value = false
                assertTrue(code, expected.first in mapAuthError(code))
                arabicLanguage.value = true
                assertTrue(code, expected.second in mapAuthError(code))
            }
        } finally {
            arabicLanguage.value = previous
        }
    }

    @Test fun extractsAuthPostgrestAndWrappedTransportErrors() {
        assertEquals("email_delivery", authErrorDetail(AuthRestException("unexpected_failure", "Error sending confirmation email", 500)))
        assertEquals("google_unavailable", authErrorDetail(AuthRestException("invalid request", "Unacceptable audience in id_token", 400)))
        assertEquals("phone_already_in_use", authErrorDetail(RestException("phone_already_in_use", null, 400, "request details")))
        assertEquals("network", authErrorDetail(IllegalStateException("failed", IOException("offline"))))
    }
}
