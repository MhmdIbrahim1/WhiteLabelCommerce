package com.whitelabel.commerce.core.data.local

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.domain.model.Product
import com.whitelabel.commerce.core.domain.repository.CatalogRepository
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

@Singleton
class RecentlyViewedStore internal constructor(
    private val preferences: DataStore<Preferences>,
    storeId: String,
) {
    @Inject constructor(preferences: DataStore<Preferences>) : this(preferences, BuildConfig.STORE_ID)

    private val key = stringPreferencesKey("recent_products_$storeId")
    private fun read(prefs: Preferences) = prefs[key].orEmpty().split(',').filter { it.isNotBlank() }

    val ids: Flow<List<String>> = preferences.data.map(::read).distinctUntilChanged().catch { error ->
        if (error is IOException) emit(emptyList()) else throw error
    }

    suspend fun record(productId: String) {
        if (productId.isBlank()) return
        try {
            preferences.edit { prefs ->
                val recent = listOf(productId) + read(prefs).filterNot { it == productId }
                prefs[key] = recent.take(12).joinToString(",")
            }
        } catch (_: IOException) {
            // Browsing still works when the device cannot persist history.
        }
    }

    fun products(catalog: CatalogRepository): Flow<List<Product>> =
        ids.map { catalog.getProductsByIds(it).getOrDefault(emptyList()) }
}
