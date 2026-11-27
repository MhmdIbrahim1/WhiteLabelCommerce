package com.whitelabel.commerce.core.data.repository

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.preferencesOf
import androidx.datastore.preferences.core.stringPreferencesKey
import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.data.di.DataStoreSessionManager
import com.whitelabel.commerce.core.data.di.enrolledUserKey
import com.whitelabel.commerce.core.data.remote.dto.StoreMembershipDto
import com.whitelabel.commerce.core.domain.model.AuthSessionState
import com.whitelabel.commerce.core.domain.model.CustomerProfile
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class StoreMembershipTest {
    private val email = "shopper@example.test"

    @Test fun enrolledResponseUsesStoreContactDetails() {
        val membership = Json.decodeFromString<StoreMembershipDto>(
            """{"enrolled":true,"full_name":" Ali ","phone":"01012345678"}""",
        )
        assertTrue(membership.enrolled)
        assertEquals(CustomerProfile("Ali", "01012345678", email), membership.profile(email))
    }

    @Test fun unenrolledResponseStartsWithEmptyOnboardingFieldsEvenIfContactDataIsPresent() {
        val membership = Json.decodeFromString<StoreMembershipDto>(
            """{"enrolled":false,"full_name":"Old name","phone":"01012345678"}""",
        )
        assertFalse(membership.enrolled)
        assertEquals(CustomerProfile(email = email), membership.profile(email))
    }

    @Test fun nullBlankAndMissingContactValuesStayEmpty() {
        for (json in listOf("""{"enrolled":true,"full_name":" ","phone":null}""", """{"enrolled":true}""")) {
            assertEquals(CustomerProfile(email = email), Json.decodeFromString<StoreMembershipDto>(json).profile(email))
        }
    }

    @Test fun missingOrNullEnrollmentFlagCannotResolveMembership() {
        listOf("{}", """{"enrolled":null}""").forEach { value ->
            assertThrows(SerializationException::class.java) { Json.decodeFromString<StoreMembershipDto>(value) }
        }
    }

    @Test fun offlineEnrollmentRequiresMatchingOwnerAndOnlyReusesThatOwnersProfile() {
        val pending = AuthSessionState.SignedIn("a", email)
        val profile = CustomerProfile("Ali", "01012345678", email)
        val existing = pending.copy(profile = profile, enrolled = true, membershipResolved = true)
        assertEquals(existing, pending.offlineMembership("a", existing))
        val cold = pending.offlineMembership("a", null)
        assertTrue(cold.enrolled && cold.membershipResolved)
        assertEquals(CustomerProfile(email = email), cold.profile)
        val differentOwner = AuthSessionState.SignedIn("b", "different@example.test")
        val unknown = differentOwner.offlineMembership("a", existing)
        assertFalse(unknown.enrolled || unknown.membershipResolved)
        assertEquals("network", unknown.membershipError)
        assertEquals(CustomerProfile(email = differentOwner.email), unknown.profile)
        assertEquals(unknown.profile, differentOwner.offlineMembership("b", existing).profile)
        assertFalse(pending.offlineMembership(null, existing).enrolled)
    }

    @Test fun deletingSdkSessionClearsOnlyThisStoresEnrollmentAndSession() = runTest {
        val session = stringPreferencesKey("${BuildConfig.STORE_ID}_supabase_auth_session_json")
        val otherStore = stringPreferencesKey("other-store_enrolled_user")
        val store = object : DataStore<Preferences> {
            override val data = MutableStateFlow(preferencesOf(session to "saved session", enrolledUserKey to "a", otherStore to "b"))
            override suspend fun updateData(transform: suspend (Preferences) -> Preferences): Preferences {
                val updated = transform(data.value)
                data.value = updated
                return updated
            }
        }
        assertEquals("${BuildConfig.STORE_ID}_enrolled_user", enrolledUserKey.name)
        DataStoreSessionManager(store, Json).deleteSession()
        val remaining = store.data.value
        assertNull(remaining[session])
        assertNull(remaining[enrolledUserKey])
        assertEquals("b", remaining[otherStore])
    }
}
