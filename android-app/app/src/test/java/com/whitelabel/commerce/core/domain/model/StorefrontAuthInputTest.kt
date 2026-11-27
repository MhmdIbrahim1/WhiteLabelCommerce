package com.whitelabel.commerce.core.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StorefrontAuthInputTest {
    @Test fun pastedDigitsKeepLeadingZeroesInAllThreeScripts() {
        listOf("012345", "٠١٢٣٤٥", "۰۱۲۳۴۵", " 0-١ ۲a3\n٤۵ ").forEach {
            assertEquals("012345", StorefrontAuthInput.normalizeOtp(it))
            assertTrue(StorefrontAuthInput.isOtpReady(it))
        }
    }

    @Test fun displayIsCappedButVerificationRequiresExactlySixDigits() {
        assertEquals("012345", StorefrontAuthInput.normalizeOtp("0123456"))
        for (value in listOf("", "------", "１２３４５６", "12345", "0123456")) {
            assertFalse(StorefrontAuthInput.isOtpReady(value))
        }
    }

    @Test fun nameLengthUsesTrimmedUnicodeCodePointsLikePostgres() {
        for (value in listOf("", "  ", " a ", "😀", "a".repeat(101))) {
            assertFalse(StorefrontAuthInput.validName(value))
        }
        listOf(" نو ", "Li", "𐐀".repeat(100)).forEach { assertTrue(StorefrontAuthInput.validName(it)) }
    }

    @Test fun optionalEgyptianPhonesAcceptLocalAndInternationalForms() {
        for (value in listOf("", "   ", "01012345678", "٠١١١٢٣٤٥٦٧٨", "+۲۰ (۱۲) ۱۲۳۴-۵۶۷۸", "0020 15 12345678")) {
            assertTrue(value, StorefrontAuthInput.validPhone(value))
        }
        for (value in listOf("-", "010", "01412345678", "010123456789", "x01012345678", "+10 1012345678")) {
            assertFalse(value, StorefrontAuthInput.validPhone(value))
        }
    }
}
