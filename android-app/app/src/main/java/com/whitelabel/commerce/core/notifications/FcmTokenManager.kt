package com.whitelabel.commerce.core.notifications

import android.content.Context
import android.provider.Settings
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.suspendCancellableCoroutine
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

@Singleton
class FcmTokenManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val notificationRepository: NotificationRepository,
) {
    @Volatile
    var lastKnownToken: String? = null
        private set

    private fun deviceSessionId(): String = runCatching {
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
    }.getOrNull().orEmpty().ifBlank { "android-device" }

    suspend fun fetchTokenOrNull(): String? {
        if (FirebaseApp.getApps(context).isEmpty()) return null
        return suspendCancellableCoroutine { cont ->
            runCatching {
                FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                    val token = if (task.isSuccessful) task.result else null
                    if (!token.isNullOrBlank()) {
                        lastKnownToken = token
                    }
                    if (cont.isActive) cont.resume(token)
                }
            }.onFailure {
                if (cont.isActive) cont.resume(null)
            }
        }
    }

    suspend fun syncCurrentToken(locale: String, phone: String? = null) {
        val token = fetchTokenOrNull() ?: lastKnownToken ?: return
        notificationRepository.registerPushToken(
            token = token,
            locale = locale,
            guestSessionId = deviceSessionId(),
            phone = phone,
        )
    }

    suspend fun syncExplicitToken(token: String, locale: String) {
        lastKnownToken = token
        notificationRepository.registerPushToken(
            token = token,
            locale = locale,
            guestSessionId = deviceSessionId(),
        )
    }
}
