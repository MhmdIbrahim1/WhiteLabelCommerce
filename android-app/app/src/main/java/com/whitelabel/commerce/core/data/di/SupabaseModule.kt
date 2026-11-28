package com.whitelabel.commerce.core.data.di

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.domain.model.oauthRedirectUri
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.FlowType
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.serializer.KotlinXSerializer
import io.ktor.client.engine.okhttp.OkHttp
import kotlinx.serialization.json.Json
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object SupabaseModule {

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        encodeDefaults = false
        isLenient = true
    }

    @Provides
    @Singleton
    fun provideSupabaseClient(
        json: Json,
        dataStore: DataStore<Preferences>,
    ): SupabaseClient = createSupabaseClient(
        supabaseUrl = BuildConfig.SUPABASE_URL,
        supabaseKey = BuildConfig.SUPABASE_ANON_KEY,
    ) {
        defaultSerializer = KotlinXSerializer(json)
        httpEngine = OkHttp.create()
        install(Postgrest)
        install(Auth) {
            flowType = FlowType.PKCE
            codeVerifierCache = DataStoreCodeVerifierCache(dataStore)
            scheme = BuildConfig.OAUTH_CALLBACK_SCHEME
            host = BuildConfig.OAUTH_CALLBACK_HOST
            defaultRedirectUrl = oauthRedirectUri
            sessionManager = DataStoreSessionManager(dataStore, json)
            autoLoadFromStorage = true
            alwaysAutoRefresh = true
        }
        install(Realtime)
    }
}
