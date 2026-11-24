package com.whitelabel.commerce.core.designsystem

import androidx.compose.runtime.mutableStateOf

internal val arabicLanguage = mutableStateOf(true)

fun localized(arabic: String, english: String): String = if (arabicLanguage.value) arabic else english
