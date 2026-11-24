package com.whitelabel.commerce.core.data.remote

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneNormalizerTest {

    @Test
    fun `normalizes Arabic-Indic digits and strips formatting`() {
        val normalized = PhoneNormalizer.normalize("+٢٠ ١٠٠-١٢٣ ٤٥٦٧")
        assertEquals("201001234567", normalized)
        assertTrue(PhoneNormalizer.isValid(normalized))
    }

    @Test
    fun `validates and normalizes Egyptian mobile numbers`() {
        assertTrue(PhoneNormalizer.isValidEgyptianPhone("01012345678"))
        assertTrue(PhoneNormalizer.isValidEgyptianPhone("+20 111-234-5678"))
        assertTrue(PhoneNormalizer.isValidEgyptianPhone("00201212345678"))
        assertTrue(PhoneNormalizer.isValidEgyptianPhone("٠١٥١٢٣٤٥٦٧٨"))

        assertEquals("01012345678", PhoneNormalizer.normalizeForEgyptCheckout("+20 101 234 5678"))
        assertEquals("01212345678", PhoneNormalizer.normalizeForEgyptCheckout("00201212345678"))
        assertEquals("201012345678", PhoneNormalizer.formatWhatsAppDigits("01012345678"))

        assertFalse(PhoneNormalizer.isValidEgyptianPhone("01912345678"))
        assertFalse(PhoneNormalizer.isValidEgyptianPhone("0101234"))
    }

    @Test
    fun `rejects phones shorter than 8 or longer than 15 digits`() {
        assertFalse(PhoneNormalizer.isValid(PhoneNormalizer.normalize("1234567")))
        assertFalse(PhoneNormalizer.isValid(PhoneNormalizer.normalize("1234567890123456")))
        assertTrue(PhoneNormalizer.isValid(PhoneNormalizer.normalize("01012345678")))
    }
}
