package com.whitelabel.commerce.core.data.repository

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.whitelabel.commerce.core.data.local.BrandConfigAssetLoader
import com.whitelabel.commerce.core.data.remote.dto.StoreSettingsDto
import com.whitelabel.commerce.core.data.remote.runSuspendCatching
import com.whitelabel.commerce.core.domain.model.StoreSettings
import com.whitelabel.commerce.core.domain.repository.StoreRepository
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.from
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class StoreRepositoryImpl @Inject constructor(
    private val supabase: SupabaseClient,
    @dagger.hilt.android.qualifiers.ApplicationContext context: android.content.Context,
    private val assetLoader: BrandConfigAssetLoader,
    private val dataStore: DataStore<Preferences>,
) : StoreRepository {

    private val languagePrefs = context.getSharedPreferences("language_" + com.whitelabel.commerce.BuildConfig.STORE_ID, android.content.Context.MODE_PRIVATE)
    private fun StoreSettings.withLanguage() = copy(locale = languagePrefs.getString("language", null) ?: locale)
    private val offlineFallback: StoreSettings = assetLoader.loadOfflineFallback()
    private val _storeSettings = MutableStateFlow(offlineFallback.withLanguage())
    override val storeSettings: StateFlow<StoreSettings> = _storeSettings.asStateFlow()

    override val darkThemePreference: Flow<Boolean?> = dataStore.data.map { prefs ->
        when (prefs[KEY_THEME_MODE]) {
            THEME_DARK -> true
            THEME_LIGHT -> false
            else -> null
        }
    }

    override suspend fun refreshStoreSettings(): Result<StoreSettings> = runSuspendCatching {
        val remoteDto = supabase
            .from("store_settings")
            .select(Columns.raw(SETTINGS_COLUMNS)) {
                filter {
                    eq("store_id", com.whitelabel.commerce.BuildConfig.STORE_ID)
                }
                limit(1)
            }
            .decodeList<StoreSettingsDto>()
            .firstOrNull()

        if (remoteDto != null) {
            val merged = remoteDto.toDomain(presetsFallback = offlineFallback.presets)
            _storeSettings.value = merged.withLanguage()
            _storeSettings.value
        } else {
            _storeSettings.value
        }
    }

    override fun setLanguage(locale: String) {
        languagePrefs.edit().putString("language", locale).apply()
        _storeSettings.value = _storeSettings.value.copy(locale = locale)
    }

    override suspend fun setDarkThemePreference(isDark: Boolean?) {
        dataStore.edit { prefs ->
            when (isDark) {
                true -> prefs[KEY_THEME_MODE] = THEME_DARK
                false -> prefs[KEY_THEME_MODE] = THEME_LIGHT
                null -> prefs.remove(KEY_THEME_MODE)
            }
        }
    }

    private companion object {
        val KEY_THEME_MODE = stringPreferencesKey("${com.whitelabel.commerce.BuildConfig.STORE_ID}_theme_mode")
        const val THEME_DARK = "dark"
        const val THEME_LIGHT = "light"
    }
}
