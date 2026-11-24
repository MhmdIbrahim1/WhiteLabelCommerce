package com.whitelabel.commerce.core.notifications

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.data.remote.runSuspendCatching
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order as SortOrder
import io.github.jan.supabase.postgrest.query.filter.FilterOperator
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NotificationRepositoryImpl @Inject constructor(
    private val supabase: SupabaseClient,
    private val dataStore: DataStore<Preferences>,
    private val json: Json,
) : NotificationRepository {

    private val repoScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val realtimeStarted = AtomicBoolean(false)

    private val _notifications = MutableStateFlow<List<AppNotification>>(emptyList())
    override val notifications: StateFlow<List<AppNotification>> = _notifications.asStateFlow()

    override val unreadCount: StateFlow<Int> = _notifications
        .map { list -> list.count { !it.isRead } }
        .stateIn(repoScope, SharingStarted.Eagerly, 0)

    init {
        startRealtimeLoop()
    }

    private fun startRealtimeLoop() {
        if (!realtimeStarted.compareAndSet(false, true)) return
        repoScope.launch {
            runCatching {
                val ch = supabase.realtime.channel("notifications-${BuildConfig.STORE_ID}")
                val inserts = ch.postgresChangeFlow<PostgresAction.Insert>(schema = "public") {
                    table = "notifications"
                    filter("store_id", FilterOperator.EQ, BuildConfig.STORE_ID)
                }
                val updates = ch.postgresChangeFlow<PostgresAction.Update>(schema = "public") {
                    table = "notifications"
                    filter("store_id", FilterOperator.EQ, BuildConfig.STORE_ID)
                }
                val deletes = ch.postgresChangeFlow<PostgresAction.Delete>(schema = "public") {
                    table = "notifications"
                }
                ch.subscribe()

                launch {
                    inserts.collect { action ->
                        val dto = runCatching {
                            json.decodeFromJsonElement(NotificationDto.serializer(), action.record)
                        }.getOrNull() ?: return@collect

                        val uid = supabase.auth.currentUserOrNull()?.id
                        val isVisible = dto.targetRole == "customer" &&
                            (dto.userId == null || (uid != null && dto.userId == uid))
                        if (!isVisible) return@collect

                        val item = dto.toDomain()
                        val current = _notifications.value
                        if (current.none { it.id == item.id }) {
                            _notifications.value = (listOf(item) + current).take(50)
                        }
                    }
                }

                launch {
                    updates.collect { action ->
                        val dto = runCatching {
                            json.decodeFromJsonElement(NotificationDto.serializer(), action.record)
                        }.getOrNull() ?: return@collect
                        val updated = dto.toDomain()
                        _notifications.value = _notifications.value.map { existing ->
                            if (existing.id == updated.id) {
                                updated.copy(isRead = existing.isRead || updated.isRead)
                            } else {
                                existing
                            }
                        }
                    }
                }

                launch {
                    deletes.collect { action ->
                        val deletedId = action.oldRecord["id"]?.jsonPrimitive?.contentOrNull
                            ?: return@collect
                        _notifications.value = _notifications.value.filterNot { it.id == deletedId }
                    }
                }
            }
        }
    }

    override suspend fun refresh(): Result<List<AppNotification>> = runSuspendCatching {
        val prefs = dataStore.data.first()
        val localReadIds = prefs[KEY_LOCAL_READ_IDS].orEmpty()
        val localDismissedIds = prefs[KEY_LOCAL_DISMISSED_IDS].orEmpty()
        val rows = supabase.from("notifications")
            .select {
                filter {
                    eq("store_id", BuildConfig.STORE_ID)
                    eq("target_role", "customer")
                }
                order("created_at", SortOrder.DESCENDING)
                limit(40)
            }
            .decodeList<NotificationDto>()
            .filterNot { it.id in localDismissedIds }
            .map { dto ->
                val domain = dto.toDomain()
                if (domain.id in localReadIds) domain.copy(isRead = true) else domain
            }

        _notifications.value = rows
        rows
    }

    override suspend fun registerPushToken(
        token: String,
        locale: String,
        guestSessionId: String?,
        phone: String?,
    ): Result<Unit> = runSuspendCatching {
        if (token.trim().length < 16) return@runSuspendCatching
        supabase.postgrest.rpc(
            "register_push_subscription",
            buildJsonObject {
                put("p_store_id", BuildConfig.STORE_ID)
                put("p_platform", "android")
                put("p_token", token.trim())
                put("p_locale", if (locale.startsWith("en", ignoreCase = true)) "en" else "ar")
                if (!guestSessionId.isNullOrBlank()) put("p_guest_session_id", guestSessionId.trim())
                if (!phone.isNullOrBlank()) put("p_phone", phone.trim())
            },
        )
    }

    override suspend fun markAsRead(notificationId: String) {
        _notifications.value = _notifications.value.map {
            if (it.id == notificationId) it.copy(isRead = true) else it
        }
        dataStore.edit { prefs ->
            prefs[KEY_LOCAL_READ_IDS] = prefs[KEY_LOCAL_READ_IDS].orEmpty() + notificationId
        }
        runCatching {
            supabase.postgrest.rpc(
                "mark_notifications_read",
                buildJsonObject {
                    put("p_store_id", BuildConfig.STORE_ID)
                    put(
                        "p_notification_ids",
                        buildJsonArray { add(kotlinx.serialization.json.JsonPrimitive(notificationId)) },
                    )
                    put("p_mark_all", false)
                },
            )
        }
    }

    override suspend fun markAllAsRead() {
        val allIds = _notifications.value.map { it.id }.toSet()
        _notifications.value = _notifications.value.map { it.copy(isRead = true) }
        dataStore.edit { prefs ->
            prefs[KEY_LOCAL_READ_IDS] = prefs[KEY_LOCAL_READ_IDS].orEmpty() + allIds
        }
        runCatching {
            supabase.postgrest.rpc(
                "mark_notifications_read",
                buildJsonObject {
                    put("p_store_id", BuildConfig.STORE_ID)
                    put("p_mark_all", true)
                },
            )
        }
    }

    override suspend fun deleteNotification(notificationId: String) {
        _notifications.value = _notifications.value.filterNot { it.id == notificationId }
        dataStore.edit { prefs ->
            prefs[KEY_LOCAL_DISMISSED_IDS] = prefs[KEY_LOCAL_DISMISSED_IDS].orEmpty() + notificationId
        }
        val uid = supabase.auth.currentUserOrNull()?.id ?: return
        runCatching {
            supabase.from("notifications").delete {
                filter {
                    eq("id", notificationId)
                    eq("store_id", BuildConfig.STORE_ID)
                    eq("user_id", uid)
                }
            }
        }
    }

    override suspend fun clearAllNotifications() {
        val allIds = _notifications.value.map { it.id }.toSet()
        _notifications.value = emptyList()
        dataStore.edit { prefs ->
            prefs[KEY_LOCAL_DISMISSED_IDS] = prefs[KEY_LOCAL_DISMISSED_IDS].orEmpty() + allIds
        }
        val uid = supabase.auth.currentUserOrNull()?.id ?: return
        runCatching {
            supabase.from("notifications").delete {
                filter {
                    eq("store_id", BuildConfig.STORE_ID)
                    eq("user_id", uid)
                }
            }
        }
    }

    override suspend fun subscribeBackInStock(
        productId: String,
        variantKey: String,
        phone: String?,
        pushToken: String?,
    ): Result<Unit> = runSuspendCatching {
        supabase.postgrest.rpc(
            "subscribe_back_in_stock",
            buildJsonObject {
                put("p_store_id", BuildConfig.STORE_ID)
                put("p_product_id", productId)
                put("p_variant_key", variantKey)
                if (!phone.isNullOrBlank()) put("p_phone", phone.trim())
                if (!pushToken.isNullOrBlank()) put("p_push_token", pushToken.trim())
            },
        )
    }

    companion object {
        private val KEY_LOCAL_READ_IDS = stringSetPreferencesKey("notifications_local_read_ids")
        private val KEY_LOCAL_DISMISSED_IDS = stringSetPreferencesKey("notifications_local_dismissed_ids")
    }
}
