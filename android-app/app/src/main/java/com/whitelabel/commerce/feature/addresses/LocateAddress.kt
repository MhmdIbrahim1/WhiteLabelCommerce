package com.whitelabel.commerce.feature.addresses

import android.annotation.SuppressLint
import android.content.Context
import android.location.Address
import android.location.Geocoder
import android.location.Location
import android.location.LocationManager
import android.os.Build
import androidx.core.location.LocationManagerCompat
import androidx.core.content.ContextCompat
import android.os.CancellationSignal
import java.util.concurrent.Executors
import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.domain.model.CustomerAddress
import com.whitelabel.commerce.core.domain.model.EgyptLocations
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import kotlin.coroutines.resume

@SuppressLint("MissingPermission")
private suspend fun deviceLocation(context: Context): Location = withTimeout(12000) {
    val manager = context.getSystemService(LocationManager::class.java)
    val providers = listOf("fused", LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
        .filter { it in manager.getProviders(true) }
    require(providers.isNotEmpty())
    suspendCancellableCoroutine { continuation ->
        val signals = mutableListOf<CancellationSignal>()
        var pending = providers.size
        fun finish(location: Location?) {
            pending--
            if (continuation.isActive && (location != null || pending == 0)) {
                signals.forEach { it.cancel() }
                if (location != null) continuation.resume(location)
                else continuation.resumeWith(Result.failure(IllegalStateException("location_unavailable")))
            }
        }
        for (provider in providers) {
            val signal = CancellationSignal()
            signals.add(signal)
            try {
                LocationManagerCompat.getCurrentLocation(manager, provider, signal,
                    ContextCompat.getMainExecutor(context), ::finish)
            } catch (_: SecurityException) { finish(null) }
        }
        continuation.invokeOnCancellation { signals.forEach { it.cancel() } }
    }
}

// The pre-33 Geocoder can block a binder thread. Bound its concurrency and let the UI time out.
private val legacyGeocoder = Executors.newSingleThreadExecutor()

@Suppress("DEPRECATION")
private suspend fun nativeAddress(context: Context, location: Location, lang: String): Address? {
    if (!Geocoder.isPresent()) return null
    val geocoder = Geocoder(context, Locale.forLanguageTag(lang))
    return if (Build.VERSION.SDK_INT >= 33) {
        suspendCancellableCoroutine { cont ->
            geocoder.getFromLocation(location.latitude, location.longitude, 1, object : Geocoder.GeocodeListener {
                override fun onGeocode(addresses: MutableList<Address>) {
                    if (cont.isActive) cont.resume(addresses.firstOrNull())
                }
                override fun onError(errorMessage: String?) { if (cont.isActive) cont.resume(null) }
            })
        }
    } else suspendCancellableCoroutine { cont ->
        val task = legacyGeocoder.submit {
            val address = runCatching { geocoder.getFromLocation(location.latitude, location.longitude, 1)?.firstOrNull() }.getOrNull()
            if (cont.isActive) cont.resume(address)
        }
        cont.invokeOnCancellation { task.cancel(true) }
    }
}

suspend fun locateAddress(context: Context, lang: String, draft: CustomerAddress): CustomerAddress {
    val location = deviceLocation(context)
    val lat = location.latitude
    val lng = location.longitude
    val native = try {
        withTimeoutOrNull(3500) { nativeAddress(context, location, lang) }
    } catch (_: java.io.IOException) { null }
    if (native?.countryCode.equals("EG", true)) {
        val gov = EgyptLocations.findGovernorate(native?.adminArea)
        val city = native?.subLocality ?: native?.locality ?: native?.subAdminArea
        val street = native?.thoroughfare
        if (gov != null && !city.isNullOrBlank() && !street.isNullOrBlank()) {
            return draft.copy(governorate = gov.id, city = city, street = street, lat = lat, lng = lng)
        }
    }
    return withContext(Dispatchers.IO) {
        val url = URL(BuildConfig.WEB_STORE_BASE_URL.trimEnd('/') + "/api/reverse-geocode")
        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.connectTimeout = 4500
            conn.readTimeout = 9000
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(JSONObject().put("lat",lat).put("lng",lng).put("lang",lang).toString().toByteArray()) }
            check(conn.responseCode == 200)
            val result = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
            draft.copy(governorate = result.optString("governorate"), city = result.optString("city"),
                street = result.optString("street"), lat = lat, lng = lng)
        } finally { conn.disconnect() }
    }
}
