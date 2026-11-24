package com.whitelabel.commerce.core.domain.repository

import com.whitelabel.commerce.core.domain.model.StoreSettings
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

interface StoreRepository {
    /**
     * Emits immediate offline `assets/brand-config.json` settings on startup,
     * then updates automatically when remote `store_settings` sync completes.
     */
    val storeSettings: StateFlow<StoreSettings>

    /**
     * User-selected theme override (`null` = follow system, `true` = dark, `false` = light).
     */
    val darkThemePreference: Flow<Boolean?>

    suspend fun refreshStoreSettings(): Result<StoreSettings>

    suspend fun setDarkThemePreference(isDark: Boolean?)
}
