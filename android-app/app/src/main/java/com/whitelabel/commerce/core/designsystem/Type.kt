package com.whitelabel.commerce.core.designsystem

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.googlefonts.Font
import androidx.compose.ui.text.googlefonts.GoogleFont
import androidx.compose.ui.unit.sp
import com.whitelabel.commerce.R

private val googleFontProvider = GoogleFont.Provider(
    providerAuthority = "com.google.android.gms.fonts",
    providerPackage = "com.google.android.gms",
    certificates = R.array.com_google_android_gms_fonts_certs,
)

private val ibmPlexSansArabicGoogleFont = GoogleFont("IBM Plex Sans Arabic")

/**
 * Unified `IBM Plex Sans Arabic` font family loaded via Google Downloadable Fonts,
 * with seamless fallback to the system sans-serif font when offline or on devices without GMS.
 */
val IbmPlexSansArabicFontFamily: FontFamily = FontFamily(
    Font(
        googleFont = ibmPlexSansArabicGoogleFont,
        fontProvider = googleFontProvider,
        weight = FontWeight.Normal,
    ),
    Font(
        googleFont = ibmPlexSansArabicGoogleFont,
        fontProvider = googleFontProvider,
        weight = FontWeight.Medium,
    ),
    Font(
        googleFont = ibmPlexSansArabicGoogleFont,
        fontProvider = googleFontProvider,
        weight = FontWeight.SemiBold,
    ),
    Font(
        googleFont = ibmPlexSansArabicGoogleFont,
        fontProvider = googleFontProvider,
        weight = FontWeight.Bold,
    ),
)

/**
 * Typography scale tuned for Arabic RTL readability (`IBM Plex Sans Arabic`)
 * with generous line heights so diacritics and tall glyphs never clip.
 */
val WhiteLabelTypography = Typography(
    displaySmall = TextStyle(
        fontFamily = IbmPlexSansArabicFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 32.sp,
        lineHeight = 44.sp,
    ),
    headlineLarge = TextStyle(
        fontFamily = IbmPlexSansArabicFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 26.sp,
        lineHeight = 36.sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = IbmPlexSansArabicFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 22.sp,
        lineHeight = 32.sp,
    ),
    headlineSmall = TextStyle(
        fontFamily = IbmPlexSansArabicFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 19.sp,
        lineHeight = 28.sp,
    ),
    titleLarge = TextStyle(
        fontFamily = IbmPlexSansArabicFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 18.sp,
        lineHeight = 26.sp,
    ),
    titleMedium = TextStyle(
        fontFamily = IbmPlexSansArabicFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 24.sp,
    ),
    titleSmall = TextStyle(
        fontFamily = IbmPlexSansArabicFontFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = IbmPlexSansArabicFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = IbmPlexSansArabicFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 22.sp,
    ),
    bodySmall = TextStyle(
        fontFamily = IbmPlexSansArabicFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 18.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = IbmPlexSansArabicFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = IbmPlexSansArabicFontFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = IbmPlexSansArabicFontFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 16.sp,
    ),
)
