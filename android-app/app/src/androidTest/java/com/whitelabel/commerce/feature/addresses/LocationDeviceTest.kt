package com.whitelabel.commerce.feature.addresses

import android.annotation.SuppressLint
import android.content.Context
import android.location.Criteria
import android.location.Location
import android.location.LocationManager
import android.os.SystemClock
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.whitelabel.commerce.MainActivity
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import androidx.test.platform.app.InstrumentationRegistry
import com.whitelabel.commerce.core.domain.model.CustomerAddress
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LocationDeviceTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private fun cairo(provider: String) = Location(provider).apply {
        latitude = 30.044412
        longitude = 31.235719
        accuracy = 20f
        time = System.currentTimeMillis()
        elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
    }

    @SuppressLint("MissingPermission")
    @Suppress("DEPRECATION")
    @Test fun frameworkNetworkFixWithoutPlayServices() = runBlocking {
        assumeTrue(InstrumentationRegistry.getArguments().getString("locationQa") == "true")
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val provider = LocationManager.NETWORK_PROVIDER
        ActivityScenario.launch(MainActivity::class.java).use {
            manager.addTestProvider(provider, true, false, true, false, false, false, false, Criteria.POWER_LOW, Criteria.ACCURACY_FINE)
            try {
                manager.setTestProviderEnabled(provider, true)
                val pending = async { deviceLocation(context, hasPlay = false) }
                repeat(4) {
                    delay(250)
                    manager.setTestProviderLocation(provider, cairo(provider))
                }
                val fix = pending.await()
                assertEquals(provider, fix.provider)
                assertEquals(30.044412, fix.latitude, 0.00001)
                assertEquals(31.235719, fix.longitude, 0.00001)
            } finally {
                manager.removeTestProvider(provider)
            }
        }
    }

    @Test fun missingNativeGeocoderUsesHostedLookupAndPreservesPrecision() = runBlocking {
        assumeTrue(InstrumentationRegistry.getArguments().getString("locationQa") == "true")
        val fix = cairo(LocationManager.NETWORK_PROVIDER)
        val result = resolvePin(CustomerAddress(), fix.latitude, fix.longitude, { null }, { lookupAddress(fix, "en") })
        assertEquals("cairo", result.address.governorate)
        assertTrue(result.address.city.isNotBlank())
        assertEquals(fix.longitude, result.address.lng!!, 0.0)
    }
}
