package com.whitelabel.commerce.core.notifications

import android.Manifest
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.whitelabel.commerce.MainActivity
import com.whitelabel.commerce.R
import dagger.Lazy
import com.whitelabel.commerce.core.domain.repository.StoreRepository
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class CommerceFirebaseMessagingService : FirebaseMessagingService() {

    @Inject
    lateinit var tokenManager: Lazy<FcmTokenManager>

    @Inject
    lateinit var stores: Lazy<StoreRepository>

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onRegistered(token: String) {
        super.onRegistered(token)
        serviceScope.launch {
            tokenManager.get().syncExplicitToken(token = token, locale = stores.get().storeSettings.value.locale)
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        NotificationChannels.ensureCreated(this)

        val title = message.notification?.title
            ?: message.data["title"]
            ?: getString(R.string.app_name)
        val body = message.notification?.body
            ?: message.data["body"]
            ?: return

        val category = message.data["category"].orEmpty()
        val channelId = when (message.data["channel_id"]) {
            NotificationChannels.PROMOTIONS_CHANNEL_ID -> NotificationChannels.PROMOTIONS_CHANNEL_ID
            NotificationChannels.ORDERS_CHANNEL_ID -> NotificationChannels.ORDERS_CHANNEL_ID
            else -> if (category == "promo_campaign" || category == "abandoned_cart") {
                NotificationChannels.PROMOTIONS_CHANNEL_ID
            } else {
                NotificationChannels.ORDERS_CHANNEL_ID
            }
        }

        val deepLink = message.data["deep_link"]?.takeIf { it.isNotBlank() } ?: "/"
        val notificationId = message.data["notification_id"]

        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(NotificationChannels.EXTRA_DEEP_LINK, deepLink)
            if (!notificationId.isNullOrBlank()) {
                putExtra(NotificationChannels.EXTRA_NOTIFICATION_ID, notificationId)
            }
        }

        val requestCode = (notificationId ?: deepLink).hashCode()
        val pendingIntent = PendingIntent.getActivity(
            this,
            requestCode,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val builder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(
                if (channelId == NotificationChannels.ORDERS_CHANNEL_ID) {
                    NotificationCompat.PRIORITY_HIGH
                } else {
                    NotificationCompat.PRIORITY_DEFAULT
                },
            )
            .setContentIntent(pendingIntent)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) return
        }

        runCatching {
            NotificationManagerCompat.from(this).notify(requestCode, builder.build())
        }
    }
}
