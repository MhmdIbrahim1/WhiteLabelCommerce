package com.whitelabel.commerce.core.notifications

import android.content.Context
import android.provider.Settings
import android.util.Log
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailabilityLight
import com.google.android.gms.tasks.Task
import com.google.firebase.FirebaseApp
import com.google.firebase.installations.FirebaseInstallations
import com.google.firebase.messaging.FirebaseMessaging
import com.whitelabel.commerce.core.data.remote.runSuspendCatching
import com.whitelabel.commerce.core.domain.model.AuthSessionState
import com.whitelabel.commerce.core.domain.repository.AuthRepository
import com.whitelabel.commerce.core.domain.repository.StoreRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

enum class PushIssue { APP_CONFIGURATION, PLAY_SERVICES, REGISTRATION }

internal data class PushBinding(val token: String, val owner: String?, val locale: String)

internal class PushRegistration {
    private var synced: PushBinding? = null

    suspend fun sync(
        current: String, callback: String?, owner: String?, locale: String,
        register: suspend () -> String, bind: suspend (PushBinding) -> Unit,
    ): String? {
        if (callback != null && callback != current) return null
        if (synced == PushBinding(current, owner, locale)) return current
        val alreadyRegistered = synced?.token == current
        synced = null
        val id = if (callback != null || alreadyRegistered) current else register()
        val next = PushBinding(id, owner, locale)
        bind(next)
        synced = next
        return id
    }
}

@Singleton
class FcmTokenManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val notificationRepository: NotificationRepository,
    private val auth: AuthRepository,
    private val stores: StoreRepository,
) {
    private val lastIssue = MutableStateFlow<PushIssue?>(null)
    val issue = lastIssue.asStateFlow()
    private val lock = Mutex()
    private val registration = PushRegistration()
    private val deviceSessionId by lazy {
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)?.takeIf { it.isNotBlank() }
            ?: context.getSharedPreferences("fcm_registration", Context.MODE_PRIVATE).let { prefs ->
                prefs.getString("device_session", null) ?: UUID.randomUUID().toString().also {
                    prefs.edit().putString("device_session", it).apply()
                }
            }
    }

    suspend fun syncCurrentToken(registeredId: String? = null): String? = withContext(Dispatchers.IO) {
        if (FirebaseApp.getApps(context).isEmpty()) {
            lastIssue.value = PushIssue.APP_CONFIGURATION
            return@withContext null
        }
        for (attempt in 0..2) {
            val result = runSuspendCatching {
                lock.withLock {
                    val session = auth.sessionState.first { it !is AuthSessionState.Loading }
                    val owner = (session as? AuthSessionState.SignedIn)?.userId
                    val locale = if (stores.storeSettings.value.locale.startsWith("en", true)) "en" else "ar"
                    val installations = FirebaseInstallations.getInstance()
                    val current = withTimeoutOrNull(20_000) { installations.id.awaitResult() } ?: error("Installation unavailable")
                    registration.sync(current, registeredId, owner, locale, register = {
                        withTimeoutOrNull(20_000) {
                            FirebaseMessaging.getInstance().register().awaitResult()
                            installations.id.awaitResult()
                        } ?: error("Registration timed out")
                    }, bind = { binding ->
                        notificationRepository.registerPushToken(binding.token, binding.locale, deviceSessionId).getOrThrow()
                    })
                }
            }
            if (result.isSuccess) {
                if (result.getOrNull() != null) lastIssue.value = null
                return@withContext result.getOrNull()
            }
            Log.w("CommercePush", "Registration attempt ${attempt + 1} failed (${result.exceptionOrNull()?.javaClass?.simpleName})")
            if (attempt < 2) delay(2_000L shl attempt)
        }
        val gms = GoogleApiAvailabilityLight.getInstance().isGooglePlayServicesAvailable(context)
        lastIssue.value = if (gms == ConnectionResult.SUCCESS) PushIssue.REGISTRATION else PushIssue.PLAY_SERVICES
        null
    }
}

private suspend fun <T> Task<T>.awaitResult(): T = suspendCancellableCoroutine { continuation ->
    addOnCompleteListener { task ->
        if (task.isSuccessful) continuation.resume(task.result)
        else continuation.resumeWithException(task.exception ?: IllegalStateException("Firebase task cancelled"))
    }
}
