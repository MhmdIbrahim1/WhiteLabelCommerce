package com.whitelabel.commerce.core.data.remote.dto

import com.whitelabel.commerce.core.domain.model.CustomerProfile
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
internal data class StoreMembershipDto(
    val enrolled: Boolean,
    @SerialName("full_name") val fullName: String? = null,
    val phone: String? = null,
) {
    fun profile(email: String): CustomerProfile = CustomerProfile(
        fullName = if (enrolled) fullName.orEmpty().trim() else "",
        phone = if (enrolled) phone.orEmpty().trim() else "",
        email = email,
    )
}

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
