package com.whitelabel.commerce.feature.account

import com.whitelabel.commerce.core.domain.model.AuthSessionState
import com.whitelabel.commerce.core.domain.model.CustomerProfile
import org.junit.Assert.assertEquals
import org.junit.Test

class StorefrontSessionFormTest {
    private fun signedIn(id: String, enrolled: Boolean) = AuthSessionState.SignedIn(
        userId = id,
        email = "private-local-part@example.test",
        profile = CustomerProfile(fullName = "Foreign store name", phone = "01012345678"),
        enrolled = enrolled,
        membershipResolved = true,
    )

    @Test fun unenrolledFormIgnoresAllProfileAndEmailValues() {
        val next = AccountUiState().withSession(signedIn("shopper", enrolled = false))
        assertEquals("", next.onboarding.fullName)
        assertEquals("", next.onboarding.phone)
        assertEquals(ProfileFormState(), next.profileForm)
    }

    @Test fun switchingAccountsClearsOnboardingDraftAndHubProfile() {
        val first = AccountUiState().withSession(signedIn("first", enrolled = true))
            .copy(onboarding = OnboardingFormState(fullName = "Private draft", phone = "01512345678"))
        val next = first.withSession(signedIn("second", enrolled = false))
        assertEquals(OnboardingFormState(), next.onboarding)
        assertEquals(ProfileFormState(), next.profileForm)
    }

    @Test fun signingOutThenReturningWithSameAccountStartsWithAnEmptyDraft() {
        val member = signedIn("shopper", enrolled = false)
        val draft = AccountUiState().withSession(member)
            .copy(onboarding = OnboardingFormState(fullName = "Private draft", phone = "01512345678"))
        val next = draft.withSession(AuthSessionState.SignedOut).withSession(member)
        assertEquals(OnboardingFormState(), next.onboarding)
    }
}
