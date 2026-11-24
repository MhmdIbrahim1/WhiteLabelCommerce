package com.whitelabel.commerce.core.updater

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import androidx.core.content.IntentCompat
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

sealed interface InstallSessionEvent {
    data object AwaitingUserConfirmation : InstallSessionEvent
    data object Succeeded : InstallSessionEvent
    data class Failed(
        val messageAr: String,
        val messageEn: String,
    ) : InstallSessionEvent
}

object InstallStatusBus {
    private val _events = MutableSharedFlow<InstallSessionEvent>(extraBufferCapacity = 8)
    val events: SharedFlow<InstallSessionEvent> = _events.asSharedFlow()

    fun emit(event: InstallSessionEvent) {
        _events.tryEmit(event)
    }
}

/**
 * Receives callbacks from [PackageInstaller.Session.commit] and handles:
 * - [PackageInstaller.STATUS_PENDING_USER_ACTION]: opens the Android system install confirmation UI.
 * - [PackageInstaller.STATUS_SUCCESS]: signals completion (auto-relaunch is handled by [PackageReplacedReceiver]).
 * - All failure statuses: maps exact installer status codes to clear localized Arabic/English messages.
 */
class PackageInstallStatusReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent?) {
        if (intent == null) return
        val status = intent.getIntExtra(
            PackageInstaller.EXTRA_STATUS,
            PackageInstaller.STATUS_FAILURE,
        )
        val rawMessage = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE).orEmpty()

        when (status) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                InstallStatusBus.emit(InstallSessionEvent.AwaitingUserConfirmation)
                val confirmIntent = IntentCompat.getParcelableExtra(
                    intent,
                    Intent.EXTRA_INTENT,
                    Intent::class.java,
                )
                if (confirmIntent != null) {
                    confirmIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    runCatching { context.startActivity(confirmIntent) }.onFailure {
                        InstallStatusBus.emit(
                            InstallSessionEvent.Failed(
                                messageAr = "تعذر فتح شاشة تأكيد التثبيت على هذا الجهاز.",
                                messageEn = "Unable to open the system installation confirmation screen.",
                            ),
                        )
                    }
                }
            }

            PackageInstaller.STATUS_SUCCESS -> {
                InstallStatusBus.emit(InstallSessionEvent.Succeeded)
            }

            PackageInstaller.STATUS_FAILURE_ABORTED -> {
                InstallStatusBus.emit(
                    InstallSessionEvent.Failed(
                        messageAr = "تم إلغاء تثبيت التحديث.",
                        messageEn = "Update installation was cancelled.",
                    ),
                )
            }

            PackageInstaller.STATUS_FAILURE_CONFLICT -> {
                InstallStatusBus.emit(
                    InstallSessionEvent.Failed(
                        messageAr = "تعذر التثبيت بسبب تعارض في توقيع التطبيق أو رقم الإصدار.",
                        messageEn = "Installation failed due to a signing certificate or package conflict.",
                    ),
                )
            }

            PackageInstaller.STATUS_FAILURE_STORAGE -> {
                InstallStatusBus.emit(
                    InstallSessionEvent.Failed(
                        messageAr = "لا توجد مساحة تخزين كافية على الجهاز لتثبيت التحديث.",
                        messageEn = "Not enough storage space on the device to install the update.",
                    ),
                )
            }

            PackageInstaller.STATUS_FAILURE_INCOMPATIBLE -> {
                InstallStatusBus.emit(
                    InstallSessionEvent.Failed(
                        messageAr = "هذا الإصدار غير متوافق مع نسخة أندرويد على جهازك.",
                        messageEn = "This release is incompatible with your device's Android version.",
                    ),
                )
            }

            PackageInstaller.STATUS_FAILURE_INVALID -> {
                InstallStatusBus.emit(
                    InstallSessionEvent.Failed(
                        messageAr = "ملف التحديث غير صالح أو تالف. يرجى المحاولة مجدداً.",
                        messageEn = "The downloaded APK is invalid or corrupt. Please retry.",
                    ),
                )
            }

            PackageInstaller.STATUS_FAILURE_BLOCKED -> {
                InstallStatusBus.emit(
                    InstallSessionEvent.Failed(
                        messageAr = "تم حظر التثبيت بواسطة إعدادات الحماية أو Play Protect على جهازك.",
                        messageEn = "Installation was blocked by device security policies or Play Protect.",
                    ),
                )
            }

            else -> {
                val suffix = rawMessage.takeIf { it.isNotBlank() }?.let { " ($it)" }.orEmpty()
                InstallStatusBus.emit(
                    InstallSessionEvent.Failed(
                        messageAr = "تعذر إكمال تثبيت التحديث$suffix.",
                        messageEn = "Update installation failed$suffix.",
                    ),
                )
            }
        }
    }

    companion object {
        const val ACTION_INSTALL_STATUS = "com.whitelabel.commerce.ACTION_PACKAGE_INSTALL_STATUS"
    }
}
