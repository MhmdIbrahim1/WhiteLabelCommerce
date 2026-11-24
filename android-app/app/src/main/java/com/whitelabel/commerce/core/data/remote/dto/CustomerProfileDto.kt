package com.whitelabel.commerce.core.data.remote.dto

import com.whitelabel.commerce.core.domain.model.CustomerProfile
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class CustomerProfileDto(
    @SerialName("full_name") val fullName: String = "",
    @SerialName("phone") val phone: String = "",
    @SerialName("email") val email: String = "",
    @SerialName("governorate") val governorate: String = "",
    @SerialName("city") val city: String = "",
    @SerialName("address") val address: String = "",
) {
    fun toDomain(fallbackEmail: String = ""): CustomerProfile = CustomerProfile(
        fullName = fullName,
        phone = phone,
        email = email.ifBlank { fallbackEmail },
        governorate = governorate,
        city = city,
        address = address,
    )
}
