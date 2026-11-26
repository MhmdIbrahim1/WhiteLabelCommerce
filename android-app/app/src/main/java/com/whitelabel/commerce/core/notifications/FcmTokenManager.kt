package com.whitelabel.commerce.core.notifications

import android.content.Context
import android.provider.Settings
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.suspendCancellableCoroutine
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

@Singleton
class FcmTokenManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val notificationRepository: NotificationRepository,
) {
    private val registration by lazy { context.getSharedPreferences("fcm_registration", Context.MODE_PRIVATE) }

    private fun deviceSessionId(): String = runCatching {
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
    }.getOrNull().orEmpty().ifBlank { "android-device" }

    suspend fun fetchTokenOrNull(): String? = withContext(Dispatchers.IO) {
        val cached = registration.getString("token", null)
        if (FirebaseApp.getApps(context).isEmpty()) return@withContext cached
        suspendCancellableCoroutine { cont ->
            runCatching {
                FirebaseMessaging.getInstance().register().addOnCompleteListener {
                    if (cont.isActive) cont.resume(Unit)
                }
            }.onFailure {
                if (cont.isActive) cont.resume(Unit)
            }
        }
        registration.getString("token", cached)
    }

    suspend fun syncCurrentToken(locale: String, phone: String? = null) = withContext(Dispatchers.IO) {
        val token = fetchTokenOrNull() ?: return@withContext
        notificationRepository.registerPushToken(
            token = token,
            locale = locale,
            guestSessionId = deviceSessionId(),
            phone = phone,
        )
    }

    suspend fun syncExplicitToken(token: String, locale: String) = withContext(Dispatchers.IO) {
        registration.edit().putString("token", token).apply()
        notificationRepository.registerPushToken(
            token = token,
            locale = locale,
            guestSessionId = deviceSessionId(),
        )
    }
}
