package com.whitelabel.commerce.core.updater

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Automatically relaunches [com.whitelabel.commerce.MainActivity] right after
 * the app finishes updating itself via the in-app GitHub Releases updater.
 */
class PackageReplacedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: return
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        runCatching {
            context.startActivity(launchIntent)
        }
    }
}
