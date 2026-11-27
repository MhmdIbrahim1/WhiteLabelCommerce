package com.whitelabel.commerce.core.domain.model

data class CustomerProfile(
    val fullName: String = "",
    val phone: String = "",
    val email: String = "",
    val governorate: String = "",
    val city: String = "",
    val address: String = "",
) {
    /**
     * Combines governorate, city, and street address into a single formatted shipping string
     * for checkout pre-fill without duplicating segments already present in [address].
     */
    fun combinedShippingAddress(): String {
        val street = address.trim()
        val cleanCity = city.trim()
        val cleanGov = governorate.trim()
        val parts = buildList {
            if (cleanGov.isNotEmpty() && !street.contains(cleanGov, ignoreCase = true)) {
                add(cleanGov)
            }
            if (cleanCity.isNotEmpty() && !street.contains(cleanCity, ignoreCase = true)) {
                add(cleanCity)
            }
            if (street.isNotEmpty()) {
                add(street)
            }
        }
        return parts.joinToString(" - ")
    }
}

sealed interface AuthSessionState {
    data object Loading : AuthSessionState
    data object SignedOut : AuthSessionState
    data class SignedIn(
        val userId: String,
        val email: String,
        val profile: CustomerProfile = CustomerProfile(email = email),
        val enrolled: Boolean = false,
        val membershipResolved: Boolean = false,
        val membershipError: String? = null,
    ) : AuthSessionState
}
