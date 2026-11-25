package com.whitelabel.commerce.app.navigation

import android.net.Uri
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.outlined.Category
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material.icons.rounded.Category
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.ShoppingBag
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * Top-level destinations rendered in the main Bottom Navigation Bar.
 */
enum class TopLevelDestination(
    val route: String,
    private val arabicText: String,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector,
) {
    HOME(
        route = AppRoutes.HOME,
        arabicText = "الرئيسية",
        selectedIcon = Icons.Rounded.Home,
        unselectedIcon = Icons.Outlined.Home,
    ),
    CATEGORIES(
        route = AppRoutes.CATEGORIES,
        arabicText = "الأقسام",
        selectedIcon = Icons.Rounded.Category,
        unselectedIcon = Icons.Outlined.Category,
    ),
    CART(
        route = AppRoutes.CART,
        arabicText = "السلة",
        selectedIcon = Icons.Rounded.ShoppingBag,
        unselectedIcon = Icons.Outlined.ShoppingBag,
    ),
    ORDERS(
        route = AppRoutes.ORDERS,
        arabicText = "طلباتي",
        selectedIcon = Icons.AutoMirrored.Rounded.ReceiptLong,
        unselectedIcon = Icons.AutoMirrored.Outlined.ReceiptLong,
    ),
    ACCOUNT(
        route = AppRoutes.ACCOUNT,
        arabicText = "حسابي",
        selectedIcon = Icons.Rounded.Person,
        unselectedIcon = Icons.Outlined.Person,
    );
    val labelAr: String get() = com.whitelabel.commerce.core.designsystem.localized(arabicText, when (this) {
        HOME -> "Home"
        CATEGORIES -> "Categories"
        CART -> "Cart"
        ORDERS -> "Orders"
        ACCOUNT -> "Account"
    })

}

/**
 * Central route contract covering top-level tabs and all Phase 4 detail/transactional screens.
 */
object AppRoutes {
    const val HOME = "home"
    const val CATEGORIES = "categories"
    const val CART = "cart"
    const val ORDERS = "orders"

    const val PRODUCT_DETAIL = "product/{productId}"
    const val CHECKOUT = "checkout"
    const val ACCOUNT = "account"
    const val WISHLIST = "wishlist"
    const val NOTIFICATIONS = "notifications"
    const val SUPPORT = "support?orderId={orderId}"

    val topLevelRoutes: Set<String> = setOf(HOME, CATEGORIES, CART, ORDERS, ACCOUNT)

    fun productDetail(productId: String): String = "product/${Uri.encode(productId)}"

    fun support(orderId: String? = null): String =
        if (orderId.isNullOrBlank()) {
            "support"
        } else {
            "support?orderId=${Uri.encode(orderId)}"
        }
}
