package com.whitelabel.commerce.core.data.di

import androidx.datastore.core.okio.OkioStorage
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.PreferencesSerializer
import com.whitelabel.commerce.core.data.repository.prepareGoogleOAuthUrl
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.test.runTest
import okhttp3.HttpUrl.Companion.toHttpUrl
import okio.ByteString.Companion.encodeUtf8
import okio.FileSystem
import okio.Path.Companion.toOkioPath
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class DataStoreCodeVerifierCacheTest {
    @get:Rule val folder = TemporaryFolder()
    private fun cache(job: Job) = DataStoreCodeVerifierCache(PreferenceDataStoreFactory.create(
        scope = CoroutineScope(Dispatchers.IO + job),
        // Use Okio's atomic replacement on Windows as well as POSIX hosts.
        storage = OkioStorage(FileSystem.SYSTEM, PreferencesSerializer) {
            File(folder.root, "auth.preferences_pb").toOkioPath()
        },
    ))

    @Test fun savesAcrossStoreReopenAndDeletes() = runTest {
        val first = Job()
        try {
            val original = cache(first)
            assertNull(original.loadCodeVerifier())
            original.saveCodeVerifier("first")
            original.saveCodeVerifier("second")
        } finally {
            first.cancelAndJoin()
        }
        val next = Job()
        try {
            val restored = cache(next)
            assertEquals("second", restored.loadCodeVerifier())
            restored.deleteCodeVerifier()
            assertNull(restored.loadCodeVerifier())
        } finally {
            next.cancelAndJoin()
        }
    }

    @Test fun browserUrlContainsOnlyTheChallengeForThePersistedVerifier() = runTest {
        val job = Job()
        try {
            val cache = cache(job)
            val redirect = "shopstage://omar-a7a/auth-callback"
            val url = prepareGoogleOAuthUrl("https://project.supabase.co", redirect, cache).toHttpUrl()
            val verifier = requireNotNull(cache.loadCodeVerifier())
            assertTrue(verifier.matches(Regex("[A-Za-z0-9_-]{43}")))
            assertEquals("/auth/v1/authorize", url.encodedPath)
            assertEquals("google", url.queryParameter("provider"))
            assertEquals(redirect, url.queryParameter("redirect_to"))
            assertEquals("S256", url.queryParameter("code_challenge_method"))
            assertEquals(verifier.encodeUtf8().sha256().base64Url().trimEnd('='), url.queryParameter("code_challenge"))
            assertFalse(url.toString().contains(verifier))
        } finally {
            job.cancelAndJoin()
        }
    }
}
