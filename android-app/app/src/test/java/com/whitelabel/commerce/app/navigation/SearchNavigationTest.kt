package com.whitelabel.commerce.app.navigation

import org.junit.Assert.*
import org.junit.Test

class SearchNavigationTest {
    @Test fun searchOpensANewDestinationOutsideRestoredTabState() {
        assertNotEquals(AppRoutes.CATEGORIES, AppRoutes.SEARCH)
        assertFalse(AppRoutes.SEARCH in AppRoutes.topLevelRoutes)
        assertTrue(AppRoutes.searchOptions.shouldLaunchSingleTop())
        assertFalse(AppRoutes.searchOptions.shouldRestoreState())
        assertEquals(-1, AppRoutes.searchOptions.popUpToId)
    }
}
