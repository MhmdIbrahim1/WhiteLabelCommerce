package com.whitelabel.commerce

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.PreferencesSerializer
import androidx.datastore.core.okio.OkioStorage
import com.whitelabel.commerce.core.data.local.RecentlyViewedStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.job
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import okio.FileSystem
import okio.Path.Companion.toOkioPath

class RecentlyViewedStoreTest {
    @get:Rule val temp = TemporaryFolder()

    @Test fun persistsMruDeduplicatesCapsAtTwelveAndIsolatesTenants() = runBlocking {
        val file = temp.root.resolve("recent.preferences_pb").toOkioPath()
        // Android FileStorage uses File.renameTo, which cannot overwrite an existing file on Windows.
        fun open(scope: CoroutineScope) = PreferenceDataStoreFactory.create(
            storage = OkioStorage(FileSystem.SYSTEM, PreferencesSerializer) { file },
            scope = scope,
        )
        var scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        try {
            val prefs = open(scope)
            val nova = RecentlyViewedStore(prefs, "nova")
            val other = RecentlyViewedStore(prefs, "other")
            (1..14).forEach { nova.record("product-$it") }
            nova.record("product-7")
            nova.record("product-7")
            nova.record(" ")
            other.record("product-90")
            val expected = listOf(7, 14, 13, 12, 11, 10, 9, 8, 6, 5, 4, 3).map { "product-$it" }
            scope.coroutineContext.job.cancelAndJoin()
            scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
            val reopened = open(scope)
            assertEquals(expected, RecentlyViewedStore(reopened, "nova").ids.first())
            assertEquals(listOf("product-90"), RecentlyViewedStore(reopened, "other").ids.first())
        } finally {
            scope.coroutineContext.job.cancelAndJoin()
        }
    }
}
