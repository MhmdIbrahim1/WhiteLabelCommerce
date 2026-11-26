package com.whitelabel.commerce.core.data.di

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.datastore.core.DataMigration
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.stringPreferencesKey
import com.whitelabel.commerce.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal object PrivatePreferences : DataMigration<Preferences> {
    private const val prefix = "gcm1:"
    private val alias = "commerce." + BuildConfig.STORE_ID
    private val keys = listOf("supabase_auth_session_json", "saved_local_orders_json")
        .map { stringPreferencesKey(BuildConfig.STORE_ID + "_" + it) }

    private val key: SecretKey by lazy {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        store.getKey(alias, null) as? SecretKey ?: KeyGenerator.getInstance("AES", "AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
            generateKey()
        }
    }

    suspend fun encrypt(name: String, value: String): String = withContext(Dispatchers.IO) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)
        cipher.updateAAD(name.toByteArray())
        prefix + Base64.encodeToString(cipher.iv + cipher.doFinal(value.toByteArray()), Base64.NO_WRAP)
    }

    suspend fun decrypt(name: String, value: String): String = withContext(Dispatchers.IO) {
        require(value.startsWith(prefix))
        val bytes = Base64.decode(value.removePrefix(prefix), Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, bytes, 0, 12))
        cipher.updateAAD(name.toByteArray())
        cipher.doFinal(bytes, 12, bytes.size - 12).decodeToString()
    }

    override suspend fun shouldMigrate(currentData: Preferences): Boolean =
        keys.any { currentData[it]?.startsWith(prefix) == false }

    override suspend fun migrate(currentData: Preferences): Preferences =
        currentData.toMutablePreferences().apply {
            for (key in keys) {
                val old = currentData[key] ?: continue
                if (!old.startsWith(prefix)) this[key] = encrypt(key.name, old)
            }
        }

    override suspend fun cleanUp() = Unit
}
