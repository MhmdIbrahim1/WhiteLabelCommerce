package com.whitelabel.commerce.core.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

object NotificationChannels {
    const val ORDERS_CHANNEL_ID = "orders_channel"
    const val PROMOTIONS_CHANNEL_ID = "promotions_channel"
    const val EXTRA_DEEP_LINK = "deep_link"
    const val EXTRA_NOTIFICATION_ID = "notification_id"

    fun ensureCreated(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            ?: return

        val ordersChannel = NotificationChannel(
            ORDERS_CHANNEL_ID,
            "Orders & Restock Alerts / تحديثات الطلبات والمخزون",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Order confirmation, shipping updates, payment alerts, and restock notifications."
            enableVibration(true)
        }

        val promoChannel = NotificationChannel(
            PROMOTIONS_CHANNEL_ID,
            "Promotions & Offers / العروض والحملات",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "Flash sales, seasonal offers, and abandoned cart reminders."
        }

        manager.createNotificationChannels(listOf(ordersChannel, promoChannel))
    }
}
