package com.whitelabel.commerce.core.domain.model

import org.junit.Assert.assertEquals
import org.junit.Test

class CustomerProfileTest {

    @Test
    fun `combines governorate city and street without duplicating segments`() {
        val full = CustomerProfile(
            governorate = "القاهرة",
            city = "مدينة نصر",
            address = "15 شارع عباس العقاد",
        )
        assertEquals("القاهرة - مدينة نصر - 15 شارع عباس العقاد", full.combinedShippingAddress())

        val alreadyIncluded = CustomerProfile(
            governorate = "Cairo",
            city = "Maadi",
            address = "Cairo, Maadi, Road 9",
        )
        assertEquals("Cairo, Maadi, Road 9", alreadyIncluded.combinedShippingAddress())
    }
}
