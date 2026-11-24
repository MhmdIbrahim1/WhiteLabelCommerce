package com.whitelabel.commerce.core.updater

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReleaseVersionComparatorTest {

    @Test
    fun `detects newer CI releases across versionCode offset and multi-digit patches`() {
        assertTrue(
            ReleaseVersionComparator.isNewerRelease(
                remoteTag = "v1.0.1",
                currentVersionCode = 1,
                currentVersionName = "1.0.0",
            ),
        )
        assertTrue(
            ReleaseVersionComparator.isNewerRelease(
                remoteTag = "v1.0.2",
                currentVersionCode = 11,
                currentVersionName = "1.0.1",
            ),
        )
        assertTrue(
            ReleaseVersionComparator.isNewerRelease(
                remoteTag = "v1.0.10",
                currentVersionCode = 19,
                currentVersionName = "1.0.9",
            ),
        )
    }

    @Test
    fun `rejects equal or older releases to prevent update loops`() {
        assertFalse(
            ReleaseVersionComparator.isNewerRelease(
                remoteTag = "v1.0.1",
                currentVersionCode = 11,
                currentVersionName = "1.0.1",
            ),
        )
        assertFalse(
            ReleaseVersionComparator.isNewerRelease(
                remoteTag = "v1.0.4",
                currentVersionCode = 15,
                currentVersionName = "1.0.5",
            ),
        )
        assertFalse(
            ReleaseVersionComparator.isNewerRelease(
                remoteTag = "release-notes-only",
                currentVersionCode = 1,
                currentVersionName = "1.0.0",
            ),
        )
    }

    @Test
    fun `supports single-integer tags and normalizes tag prefixes`() {
        assertTrue(
            ReleaseVersionComparator.isNewerRelease(
                remoteTag = "v15",
                currentVersionCode = 11,
                currentVersionName = "1.0.1",
            ),
        )
        assertFalse(
            ReleaseVersionComparator.isNewerRelease(
                remoteTag = "v11",
                currentVersionCode = 11,
                currentVersionName = "1.0.1",
            ),
        )
        assertEquals("1.0.14", ReleaseVersionComparator.normalizeVersionName("v1.0.14"))
    }
}
