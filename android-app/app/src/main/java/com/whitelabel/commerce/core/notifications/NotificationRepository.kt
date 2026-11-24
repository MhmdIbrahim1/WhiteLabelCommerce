package com.whitelabel.commerce.core.notifications

import kotlinx.coroutines.flow.StateFlow

interface NotificationRepository {
    val notifications: StateFlow<List<AppNotification>>
    val unreadCount: StateFlow<Int>

    suspend fun refresh(): Result<List<AppNotification>>
    suspend fun registerPushToken(
        token: String,
        locale: String,
        guestSessionId: String? = null,
        phone: String? = null,
    ): Result<Unit>

    suspend fun markAsRead(notificationId: String)
    suspend fun markAllAsRead()

    suspend fun subscribeBackInStock(
        productId: String,
        variantKey: String = "",
        phone: String? = null,
        pushToken: String? = null,
    ): Result<Unit>
}
