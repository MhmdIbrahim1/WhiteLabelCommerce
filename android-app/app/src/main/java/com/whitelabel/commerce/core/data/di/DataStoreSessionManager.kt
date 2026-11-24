package com.whitelabel.commerce.core.data.di

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.whitelabel.commerce.BuildConfig
import io.github.jan.supabase.auth.SessionManager
import io.github.jan.supabase.auth.user.UserSession
import kotlinx.coroutines.flow.first
import kotlinx.serialization.json.Json

/**
 * Tenant-scoped persistent [SessionManager] backed by Jetpack DataStore so Supabase Auth
 * sessions survive app restarts cleanly and remain isolated per [BuildConfig.STORE_ID].
 */
class DataStoreSessionManager(
    private val dataStore: DataStore<Preferences>,
    private val json: Json,
) : SessionManager {

    private val sessionKey = stringPreferencesKey("${BuildConfig.STORE_ID}_supabase_auth_session_json")

    override suspend fun saveSession(session: UserSession) {
        val encoded = json.encodeToString(UserSession.serializer(), session)
        dataStore.edit { prefs ->
            prefs[sessionKey] = encoded
        }
    }

    override suspend fun loadSession(): UserSession? {
        val raw = dataStore.data.first()[sessionKey] ?: return null
        return runCatching {
            json.decodeFromString(UserSession.serializer(), raw)
        }.getOrNull()
    }

    override suspend fun deleteSession() {
        dataStore.edit { prefs ->
            prefs.remove(sessionKey)
        }
    }
}
