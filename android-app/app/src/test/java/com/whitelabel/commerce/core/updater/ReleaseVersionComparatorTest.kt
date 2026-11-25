package com.whitelabel.commerce.core.updater

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
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
        assertTrue(
            ReleaseVersionComparator.isNewerRelease(
                remoteTag = "v1.0.4",
                currentVersionCode = 13,
                currentVersionName = "1.0.3",
                remoteVersionCode = 14,
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
                remoteTag = "v1.0.4",
                currentVersionCode = 14,
                currentVersionName = "1.0.4",
                remoteVersionCode = 14,
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

    @Test
    fun `sanitizes raw markdown release notes cleanly`() {
        val raw = """
            ## What's Changed
            * **Improved** `PackageInstaller` updater by [@dev](https://github.com/dev) in https://github.com/org/repo/pull/4
            **Full Changelog**: https://github.com/org/repo/compare/v1.0.2...v1.0.3
        """.trimIndent()
        val sanitized = ReleaseNotesSanitizer.sanitize(raw)
        assertFalse(sanitized.contains("**"))
        assertFalse(sanitized.contains("##"))
        assertFalse(sanitized.contains("https://"))
        assertFalse(sanitized.contains("Full Changelog"))
        assertTrue(sanitized.contains("Improved PackageInstaller updater"))
    }

    @Test
    fun `normalizes SHA-256 digests cleanly`() {
        val sample = "a".repeat(64)
        assertEquals(sample, ApkVerifier.normalizeSha256("sha256:${sample.uppercase()}"))
        assertNull(ApkVerifier.normalizeSha256("not-a-valid-hash"))
    }

    @Test
    fun `prioritizes numeric remote versionCode cleanly across upgrades and prevents downgrades`() {
        // Explicit numeric comparisons: 25 > 24, 25 > 21, 21 <= 23
        assertTrue(
            ReleaseVersionComparator.isNewerRelease(
                remoteTag = "v1.3.1",
                currentVersionCode = 24,
                currentVersionName = "1.3.0",
                remoteVersionCode = 25,
            ),
        )
        assertTrue(
            ReleaseVersionComparator.isNewerRelease(
                remoteTag = "v1.3.1",
                currentVersionCode = 21,
                currentVersionName = "1.1.1",
                remoteVersionCode = 25,
            ),
        )
        assertFalse(
            ReleaseVersionComparator.isNewerRelease(
                remoteTag = "v1.0.21",
                currentVersionCode = 23,
                currentVersionName = "1.2.0",
                remoteVersionCode = 21,
            ),
        )

        // Real-world CI release history: v1.3.1 (43) upgrades v1.3.0 (42), v1.2.0 (40), and v1.0.21 (31)
        assertTrue(
            ReleaseVersionComparator.isNewerRelease(
                remoteTag = "v1.3.1",
                currentVersionCode = 42,
                currentVersionName = "1.3.0",
                remoteVersionCode = 43,
            ),
        )
        assertTrue(
            ReleaseVersionComparator.isNewerRelease(
                remoteTag = "v1.3.1",
                currentVersionCode = 40,
                currentVersionName = "1.2.0",
                remoteVersionCode = 43,
            ),
        )
        assertFalse(
            ReleaseVersionComparator.isNewerRelease(
                remoteTag = "v1.0.21",
                currentVersionCode = 40,
                currentVersionName = "1.2.0",
                remoteVersionCode = 31,
            ),
        )
    }

    @Test
    fun `parses valid and malformed release-meta json safely`() {
        val valid = GitHubReleaseUpdater.parseReleaseMetaJson(
            """
            {
              "versionCode": 43,
              "versionName": "1.3.1",
              "apkName": "WhiteLabelCommerce-v1.3.1-release.apk",
              "sha256": "${"b".repeat(64)}",
              "notes": "Fix release versioning",
              "unknownFutureField": true
            }
            """.trimIndent(),
        )
        assertEquals(43, valid?.versionCode)
        assertEquals("1.3.1", valid?.versionName)
        assertEquals("WhiteLabelCommerce-v1.3.1-release.apk", valid?.apkName)

        assertNull(GitHubReleaseUpdater.parseReleaseMetaJson("{not valid json"))
        assertNull(GitHubReleaseUpdater.parseReleaseMetaJson(""))
    }
}
