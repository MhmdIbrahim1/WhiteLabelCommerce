package com.whitelabel.commerce

import android.app.Application
import com.whitelabel.commerce.core.domain.repository.StoreRepository
import com.whitelabel.commerce.core.notifications.NotificationChannels
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import javax.inject.Inject
import javax.inject.Provider

@HiltAndroidApp
class WhiteLabelCommerceApp : Application() {
    @Inject lateinit var store: Provider<StoreRepository>
    lateinit var localStartup: Deferred<Unit>
        private set

    override fun onCreate() {
        super.onCreate()
        localStartup = CoroutineScope(SupervisorJob() + Dispatchers.IO).async {
            // First construction reads the bundled brand, saved locale and initializes the HTTP client.
            store.get()
            NotificationChannels.ensureCreated(this@WhiteLabelCommerceApp)
        }
    }
}
