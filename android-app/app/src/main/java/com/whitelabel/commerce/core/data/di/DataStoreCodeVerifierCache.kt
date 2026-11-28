package com.whitelabel.commerce.core.data.di

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.whitelabel.commerce.BuildConfig
import io.github.jan.supabase.auth.CodeVerifierCache
import kotlinx.coroutines.flow.first

internal class DataStoreCodeVerifierCache(private val dataStore: DataStore<Preferences>) : CodeVerifierCache {
    private val key = stringPreferencesKey("${BuildConfig.STORE_ID}_pkce_verifier")

    override suspend fun saveCodeVerifier(codeVerifier: String) {
        dataStore.edit { it[key] = codeVerifier }
    }

    override suspend fun loadCodeVerifier(): String? = dataStore.data.first()[key]

    override suspend fun deleteCodeVerifier() {
        dataStore.edit { it.remove(key) }
    }
}
