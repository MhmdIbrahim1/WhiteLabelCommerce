package com.whitelabel.commerce.core.domain.model

object StorefrontAuthInput {
    private const val OTP_LENGTH = 6
    private val phoneSeparators = Regex("""[\s()-]""")
    private val egyptPrefix = Regex("""^(?:\+20|0020|20)0?""")
    private val egyptMobile = Regex("01[0125][0-9]{8}")

    fun otpDigits(raw: String): String = buildString {
        raw.forEach { asciiDigit(it)?.let(::append) }
    }

    fun normalizeOtp(raw: String): String = otpDigits(raw).take(OTP_LENGTH)

    fun isOtpReady(raw: String): Boolean = otpDigits(raw).length == OTP_LENGTH

    fun validName(raw: String): Boolean = raw.trim().let { it.codePointCount(0, it.length) in 2..100 }

    fun normalizePhone(raw: String): String {
        val ascii = buildString { raw.trim().forEach { append(asciiDigit(it) ?: it) } }
        return ascii.replace(phoneSeparators, "").replaceFirst(egyptPrefix, "0")
    }

    fun validPhone(raw: String): Boolean = raw.isBlank() || egyptMobile.matches(normalizePhone(raw))

    private fun asciiDigit(char: Char): Char? = when (char) {
        in '0'..'9' -> char
        in '٠'..'٩' -> '0' + (char - '٠')
        in '۰'..'۹' -> '0' + (char - '۰')
        else -> null
    }
}
