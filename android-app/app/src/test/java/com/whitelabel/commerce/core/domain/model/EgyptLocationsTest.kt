package com.whitelabel.commerce.core.domain.model

import com.whitelabel.commerce.feature.checkout.isAllowedWebStoreBase
import com.whitelabel.commerce.feature.checkout.isLocalOrLanHost
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.URL

class EgyptLocationsTest {

    @Test
    fun `contains all 27 Egyptian governorates with non-empty bilingual cities`() {
        assertEquals(27, EgyptLocations.governorates.size)
        assertTrue(EgyptLocations.governorates.all { it.cities.isNotEmpty() })
        assertNotNull(EgyptLocations.findGovernorate("القاهرة"))
        assertNotNull(EgyptLocations.findGovernorate("Alexandria"))
        assertNotNull(EgyptLocations.findGovernorate("أسوان"))
    }

    @Test
    fun `matches reverse geocoder governorate codes and localized spellings`() {
        assertEquals("cairo", EgyptLocations.findGovernorate("EG-C")?.id)
        assertEquals("assiut", EgyptLocations.findGovernorate("Asyut Governorate")?.id)
        assertEquals("alexandria", EgyptLocations.findGovernorate("محافظة الاسكندرية")?.id)
        assertEquals(null, EgyptLocations.findGovernorate("Unknown region"))
    }

    @Test
    fun `allows LAN HTTP only on github flavor and requires HTTPS on playstore flavor`() {
        assertTrue(isLocalOrLanHost("192.168.1.25"))
        assertTrue(isLocalOrLanHost("10.0.2.2"))
        assertTrue(isLocalOrLanHost("localhost"))
        assertFalse(isLocalOrLanHost("example.com"))

        assertTrue(isAllowedWebStoreBase(URL("http://192.168.1.25:3000"), allowLocalLanHttp = true))
        assertFalse(isAllowedWebStoreBase(URL("http://192.168.1.25:3000"), allowLocalLanHttp = false))
        assertFalse(isAllowedWebStoreBase(URL("http://evil.example.com"), allowLocalLanHttp = true))
        assertTrue(isAllowedWebStoreBase(URL("https://store.example.com"), allowLocalLanHttp = false))
    }
}
