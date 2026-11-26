package com.whitelabel.commerce.feature.addresses

import com.whitelabel.commerce.core.domain.model.CustomerAddress
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class LocationPipelineTest {
    private class Device(val results: Map<String, String?> = emptyMap()) {
        val calls = mutableListOf<String>()
        var permission = true
        var enabled = true
        var play = true

        private suspend fun read(provider: String): String? {
            calls += provider
            return when (val result = results[provider]) {
                "hung" -> awaitCancellation()
                "exception" -> error("provider unavailable")
                else -> result
            }
        }

        suspend fun fix() = acquireFix({ permission }, { enabled }, play, { read("balanced") },
            { read("high") }, { read("last") }, { read("network") }, { read("gps") })
    }

    @Test fun balancedIndoorFixSkipsGps() = runTest {
        val device = Device(mapOf("balanced" to "wifi"))
        assertEquals("wifi", device.fix())
        assertEquals(listOf("balanced"), device.calls)
    }
    @Test fun timedOutBalancedFallsBackToHigh() = runTest {
        val device = Device(mapOf("balanced" to "hung", "high" to "fix"))
        assertEquals("fix", device.fix())
        assertEquals(listOf("balanced", "high"), device.calls)
    }
    @Test fun lastFusedComesAfterBothActiveRequests() = runTest {
        val device = Device(mapOf("balanced" to "exception", "last" to "fresh"))
        assertEquals("fresh", device.fix())
        assertEquals(listOf("balanced", "high", "last"), device.calls)
    }
    @Test fun oldAndFutureFixesAreRejected() {
        assertTrue(freshFix(0)); assertTrue(freshFix(FRESH_FIX_MS))
        assertFalse(freshFix(-1)); assertFalse(freshFix(FRESH_FIX_MS + 1))
    }
    @Test fun deviceWithoutPlayServicesUsesIndoorNetworkProvider() = runTest {
        val device = Device(mapOf("network" to "wifi")).apply { play = false }
        assertEquals("wifi", device.fix())
        assertEquals(listOf("network"), device.calls)
    }
    @Test fun frameworkGpsWorksWhenNetworkIsUnavailable() = runTest {
        val device = Device(mapOf("network" to "exception", "gps" to "fix")).apply { play = false }
        assertEquals("fix", device.fix())
        assertEquals(listOf("network", "gps"), device.calls)
    }
    @Test fun deniedPermissionAndDisabledServicesSkipAllProviders() = runTest {
        val device = Device().apply { permission = false }
        assertEquals(LocationIssue.Permission, (runCatching { device.fix() }.exceptionOrNull() as LocationFailure).issue)
        device.permission = true
        device.enabled = false
        assertEquals(LocationIssue.Disabled, (runCatching { device.fix() }.exceptionOrNull() as LocationFailure).issue)
        assertTrue(device.calls.isEmpty())
    }
    @Test fun noFixReturnsSpecificTimeout() = runTest {
        val device = Device(mapOf("network" to "hung", "gps" to "hung"))
        assertEquals(LocationIssue.Timeout, (runCatching { device.fix() }.exceptionOrNull() as LocationFailure).issue)
    }
    @Test fun completeNativeAddressSkipsFallback() = runTest {
        var remote = false
        val result = resolvePin(CustomerAddress(), 30.0, 31.0, { AddressParts("cairo", "City", "Street") },
            { remote = true; null })
        assertTrue(result.complete); assertFalse(remote)
    }
    @Test fun nativeTimeoutFallsBackAndKeepsExactPin() = runTest {
        val result = resolvePin(CustomerAddress(building = "7"), 30.1234567, 31.7654321, { awaitCancellation() },
            { AddressParts("cairo", "City", "Street") })
        assertTrue(result.complete); assertEquals("7", result.address.building)
        assertEquals(30.1234567, result.address.lat!!, 0.0); assertEquals(31.7654321, result.address.lng!!, 0.0)
    }
    @Test fun incompleteNativeAddressKeepsNativeFieldsAndFillsMissingStreet() = runTest {
        val result = resolvePin(CustomerAddress(), 30.0, 31.0, { AddressParts("cairo", "Native") },
            { AddressParts(city = "Other", street = "Road") })
        assertTrue(result.complete); assertEquals("Native", result.address.city); assertEquals("Road", result.address.street)
    }
    @Test fun failedGeocodersPreservePinAndManualAddress() = runTest {
        val result = resolvePin(CustomerAddress(street = "Typed street"), 30.01, 31.02,
            { error("binder") }, { error("offline") })
        assertFalse(result.complete); assertEquals("Typed street", result.address.street)
        assertEquals(30.01, result.address.lat!!, 0.0); assertEquals(31.02, result.address.lng!!, 0.0)
    }
    @Test fun cacheRoundsNearbyPinsSeparatesLanguagesAndExpires() {
        var now = 0L
        val cache = AddressCache { now }
        val key = spatialKey(30.044411, 31.235711, "en")
        val parts = AddressParts("cairo", "City", "Street")
        cache.put(key, parts)
        assertEquals(parts, cache.get(spatialKey(30.044412, 31.235712, "en")))
        assertNull(cache.get(spatialKey(30.044412, 31.235712, "ar")))
        cache.backOff(2000)
        assertFalse(cache.canRequest())
        now = 86_400_000
        assertNull(cache.get(key)); assertTrue(cache.canRequest())
    }
    @Test fun cancelledLookupStopsFallback() = runTest {
        var remote = false
        val result = runCatching { resolvePin(CustomerAddress(), 30.0, 31.0, { throw CancellationException() }, { remote = true; null }) }
        assertTrue(result.exceptionOrNull() is CancellationException); assertFalse(remote)
    }
}
