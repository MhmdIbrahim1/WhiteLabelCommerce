package com.whitelabel.commerce

import android.app.Application
import com.whitelabel.commerce.core.notifications.NotificationChannels
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class WhiteLabelCommerceApp : Application() {
    override fun onCreate() {
        super.onCreate()
        NotificationChannels.ensureCreated(this)
    }
}
