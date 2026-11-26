package com.whitelabel.commerce.core.data.local

import android.content.Context
import com.whitelabel.commerce.core.domain.model.StoreSettings
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Loads the bundled `assets/brand-config.json` during background startup so the app
 * renders the merchant's brand palette, radius, and currency immediately while offline.
 */
@Singleton
class BrandConfigAssetLoader @Inject constructor(
    @ApplicationContext private val context: Context,
    private val json: Json,
) {
    fun loadOfflineFallback(): StoreSettings = runCatching {
        context.assets.open(ASSET_FILE_NAME).bufferedReader().use { reader ->
            json.decodeFromString<BrandConfigAssetDto>(reader.readText()).toDomain()
        }
    }.getOrDefault(StoreSettings())

    private companion object {
        const val ASSET_FILE_NAME = "brand-config.json"
    }
}
