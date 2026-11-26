package com.whitelabel.commerce.core.domain.model

import com.whitelabel.commerce.core.designsystem.localized
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class CustomerAddress(
    val id: String = "",
    val label: String = "home",
    @SerialName("recipient_name") val recipientName: String = "",
    val phone: String = "",
    val governorate: String = "",
    val city: String = "",
    val street: String = "",
    val building: String = "",
    val floor: String = "",
    val apartment: String = "",
    val landmark: String = "",
    val lat: Double? = null,
    val lng: Double? = null,
    @SerialName("is_default") val isDefault: Boolean = false,
) : java.io.Serializable {
    fun addressLine(): String {
        val gov = EgyptLocations.findGovernorate(governorate)
        return listOf(
            gov?.let { localized(it.nameAr, it.nameEn) } ?: governorate, city, street,
            building.takeIf { it.isNotBlank() }?.let { localized("عمارة ", "Building ") + it },
            floor.takeIf { it.isNotBlank() }?.let { localized("دور ", "Floor ") + it },
            apartment.takeIf { it.isNotBlank() }?.let { localized("شقة ", "Apt ") + it }, landmark,
        ).filterNot { it.isNullOrBlank() }.joinToString(" · ")
    }
}

@Serializable
data class DeliveryPin(val governorate: String, val lat: Double?, val lng: Double?)
