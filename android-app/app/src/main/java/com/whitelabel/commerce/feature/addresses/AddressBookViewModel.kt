package com.whitelabel.commerce.feature.addresses

import androidx.lifecycle.ViewModel
import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.domain.model.CustomerAddress
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put
import javax.inject.Inject

@HiltViewModel
class AddressBookViewModel @Inject constructor(
    private val db: SupabaseClient,
    private val json: Json,
) : ViewModel() {
    private val addressJson = Json(json) { encodeDefaults = true }

    suspend fun addresses() = db.postgrest.rpc("my_addresses", buildJsonObject {
        put("p_store_id", BuildConfig.STORE_ID)
    }).decodeList<CustomerAddress>()

    suspend fun change(action: String, address: CustomerAddress) =
        db.postgrest.rpc("change_address", buildJsonObject {
            put("p_store_id", BuildConfig.STORE_ID)
            put("p_id", address.id)
            put("p_action", action)
            put("p_address", addressJson.encodeToJsonElement(address))
        }).decodeList<CustomerAddress>()
}
