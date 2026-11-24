package com.whitelabel.commerce.core.data.di

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

private val Context.commerceDataStore: DataStore<Preferences> by preferencesDataStore(
    name = if (com.whitelabel.commerce.BuildConfig.STORE_ID == "00000000-0000-0000-0000-000000000001") "whitelabel_commerce_prefs" else "commerce_" + com.whitelabel.commerce.BuildConfig.STORE_ID,
)

@Module
@InstallIn(SingletonComponent::class)
object StorageModule {

    @Provides
    @Singleton
    fun providePreferencesDataStore(
        @ApplicationContext context: Context,
    ): DataStore<Preferences> = context.commerceDataStore
}
