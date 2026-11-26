package com.whitelabel.commerce.core.data.repository

import com.whitelabel.commerce.core.designsystem.localized

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.whitelabel.commerce.core.data.local.LocalSupportTicketEntity
import com.whitelabel.commerce.core.data.remote.dto.SupportTicketDto
import com.whitelabel.commerce.core.data.remote.dto.SupportTicketInsertDto
import com.whitelabel.commerce.core.data.remote.runSuspendCatching
import com.whitelabel.commerce.core.domain.model.SupportTicket
import com.whitelabel.commerce.core.domain.repository.SupportRepository
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Order as SortOrder
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SupportRepositoryImpl @Inject constructor(
    private val supabase: SupabaseClient,
    private val dataStore: DataStore<Preferences>,
    private val json: Json,
) : SupportRepository {

    override val localSubmittedTickets: Flow<List<SupportTicket>> = dataStore.data.map { prefs ->
        decodeLocalTickets(prefs[KEY_LOCAL_TICKETS]).map { it.toDomain() }
    }

    override suspend fun submitTicket(
        subject: String,
        message: String,
        linkedOrderId: String?,
    ): Result<Unit> = runSuspendCatching {
        val cleanSubject = subject.trim()
        val cleanMessage = message.trim()
        val cleanOrderRef = linkedOrderId?.trim()?.takeIf { it.isNotEmpty() }

        require(cleanSubject.isNotEmpty()) { localized("يرجى إدخال عنوان الرسالة.", "Enter a subject.") }
        require(cleanMessage.isNotEmpty()) { localized("يرجى إدخال نص الرسالة.", "Enter a message.") }

        val payloadMessage = if (cleanOrderRef != null) {
            localized("رقم الطلب: $cleanOrderRef\n\n$cleanMessage", "Order: $cleanOrderRef\n\n$cleanMessage")
        } else {
            cleanMessage
        }

        val accountOrder = cleanOrderRef?.takeIf {
            supabase.auth.currentUserOrNull() != null && runCatching { UUID.fromString(it) }.isSuccess
        }
        supabase.postgrest.rpc("mobile_support", buildJsonObject {
            put("p_store", com.whitelabel.commerce.BuildConfig.STORE_ID)
            put("p_subject", cleanSubject)
            put("p_message", if (accountOrder == null) payloadMessage else cleanMessage)
            if (accountOrder != null) put("p_order", accountOrder)
        })

        if (supabase.auth.currentUserOrNull() != null) return@runSuspendCatching
        saveLocalTicket(
            LocalSupportTicketEntity(
                id = UUID.randomUUID().toString(),
                subject = cleanSubject,
                message = cleanMessage,
                orderId = cleanOrderRef,
                createdAt = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).format(Date()),
            ),
        )
    }

    override suspend fun getMyTickets(): Result<List<SupportTicket>> = runSuspendCatching {
        val userId = supabase.auth.currentUserOrNull()?.id ?: return@runSuspendCatching emptyList()

        supabase
            .from("support_tickets")
            .select {
                filter { eq("store_id", com.whitelabel.commerce.BuildConfig.STORE_ID); eq("customer_id", userId) }
                order(column = "created_at", order = SortOrder.DESCENDING)
            }
            .decodeList<SupportTicketDto>()
            .map { it.toDomain() }
    }

    private suspend fun saveLocalTicket(entity: LocalSupportTicketEntity) {
        dataStore.edit { prefs ->
            val current = decodeLocalTickets(prefs[KEY_LOCAL_TICKETS]).toMutableList()
            current.add(0, entity)
            prefs[KEY_LOCAL_TICKETS] = json.encodeToString(current.take(25))
        }
    }

    private fun decodeLocalTickets(raw: String?): List<LocalSupportTicketEntity> {
        if (raw.isNullOrBlank()) return emptyList()
        return runCatching {
            json.decodeFromString<List<LocalSupportTicketEntity>>(raw)
        }.getOrDefault(emptyList())
    }

    private companion object {
        val KEY_LOCAL_TICKETS = stringPreferencesKey("${com.whitelabel.commerce.BuildConfig.STORE_ID}_local_support_tickets_json")
    }
}
