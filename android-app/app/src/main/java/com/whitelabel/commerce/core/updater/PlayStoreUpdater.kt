package com.whitelabel.commerce.core.updater

import android.content.Context
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.UpdateAvailability
import com.whitelabel.commerce.BuildConfig

/**
 * Handles Google Play In-App Updates for the `playstore` flavor
 * (`BuildConfig.ENABLE_GITHUB_UPDATER == false`).
 *
 * Safely no-ops on devices or emulators without Play Store install metadata.
 */
object PlayStoreUpdater {

    fun checkAndPromptIfAvailable(
        context: Context,
        launcher: ActivityResultLauncher<IntentSenderRequest>,
    ) {
        if (BuildConfig.ENABLE_GITHUB_UPDATER) return

        runCatching {
            val manager = AppUpdateManagerFactory.create(context)
            manager.appUpdateInfo.addOnSuccessListener { info ->
                val isUpdateAvailable = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
                val canStartFlexible = info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)
                val canStartImmediate = info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)

                val updateType = when {
                    canStartFlexible -> AppUpdateType.FLEXIBLE
                    canStartImmediate -> AppUpdateType.IMMEDIATE
                    else -> null
                }

                if (isUpdateAvailable && updateType != null) {
                    runCatching {
                        manager.startUpdateFlowForResult(
                            info,
                            launcher,
                            AppUpdateOptions.newBuilder(updateType).build(),
                        )
                    }
                }
            }
        }
    }
}
