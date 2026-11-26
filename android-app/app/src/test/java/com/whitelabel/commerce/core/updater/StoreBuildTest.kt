package com.whitelabel.commerce.core.updater

import org.junit.Assert.*
import org.junit.Test

class StoreBuildTest {
    private val build = StoreBuild("tenant", "com.store.merchant", 105, "1.0.6",
        "https://github.com/org/store/releases/download/store-b105/store.apk", "1".repeat(64))

    @Test fun higherBuildOffersVerifiedArtifact() {
        assertEquals(build.sha256, build.updateFor("tenant", build.packageName, 104)?.expectedSha256)
        assertNull(build.updateFor("tenant", build.packageName, 105))
        assertNull(build.copy(sha256 = null).updateFor("tenant", build.packageName, 104))
    }
    @Test fun rejectsOtherPackageOrStore() {
        assertNull(build.updateFor("tenant", "com.other.store", 104))
        assertNull(build.updateFor("another", build.packageName, 104))
    }
    @Test fun onlyOfficialNovaCanFallBackToLatest() {
        val nova = "00000000-0000-0000-0000-000000000001"
        assertTrue(allowOfficialFallback(nova, "com.whitelabel.commerce"))
        assertFalse(allowOfficialFallback(nova, build.packageName))
        assertFalse(allowOfficialFallback("tenant", "com.whitelabel.commerce"))
    }
}
