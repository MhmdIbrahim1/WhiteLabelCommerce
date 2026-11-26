package com.whitelabel.commerce.app.navigation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.Notifications
import com.whitelabel.commerce.core.designsystem.components.SearchAction
import androidx.compose.material.icons.rounded.Storefront
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import com.whitelabel.commerce.core.designsystem.components.LocalBanner
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import com.whitelabel.commerce.core.designsystem.components.FloatingBanner
import com.whitelabel.commerce.core.designsystem.components.BannerKind
import com.whitelabel.commerce.core.designsystem.components.BannerMessage
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.components.WishlistRoseColor
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.StoreSettings
import com.whitelabel.commerce.feature.account.AccountScreen
import com.whitelabel.commerce.feature.cart.CartScreen
import com.whitelabel.commerce.feature.catalog.CatalogScreen
import com.whitelabel.commerce.feature.catalog.ProductDetailScreen
import com.whitelabel.commerce.feature.checkout.CheckoutScreen
import com.whitelabel.commerce.feature.checkout.PaymentFlowOutcome
import com.whitelabel.commerce.feature.home.HomeScreen
import com.whitelabel.commerce.feature.home.parseHeroCategoryParam
import com.whitelabel.commerce.feature.notifications.NotificationsScreen
import com.whitelabel.commerce.feature.orders.OrderDetailScreen
import com.whitelabel.commerce.feature.orders.OrdersScreen
import androidx.hilt.navigation.compose.hiltViewModel
import com.whitelabel.commerce.feature.support.TicketDetailsScreen
import com.whitelabel.commerce.feature.support.SupportScreen
import com.whitelabel.commerce.feature.wishlist.WishlistScreen
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WhiteLabelAppShell(
    storeSettings: StoreSettings,
    cartItemCount: Int,
    unreadNotificationCount: Int = 0,
    wishlistCount: Int = 0,
    pendingDeepLink: String? = null,
    onConsumeDeepLink: () -> Unit = {},
    isDarkTheme: Boolean,
    darkThemeOverride: Boolean? = null,
    isSignedIn: Boolean,
    onSetDarkThemePreference: (Boolean?) -> Unit,
    onSelectLanguage: (String) -> Unit,
    onRefreshStore: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination
    val isTopLevelRoute = currentDestination?.route in AppRoutes.topLevelRoutes ||
        currentDestination == null

    val brandColors = LocalBrandColors.current
    var banner by remember { mutableStateOf<BannerMessage?>(null) }

    // Cross-tab handoff states
    var pendingCategoryId by remember { mutableStateOf<String?>(null) }
    var pendingFlashDealsOnly by remember { mutableStateOf(false) }
    var pendingTrackOrder by remember { mutableStateOf<Triple<String, String, PaymentFlowOutcome?>?>(null) }

    fun openSearch() = navController.navigate(AppRoutes.SEARCH, AppRoutes.searchOptions)

    fun navigateToTab(route: String) {
        navController.navigate(route) {
            popUpTo(navController.graph.findStartDestination().id) {
                saveState = true
            }
            launchSingleTop = true
            restoreState = true
        }
    }

    fun handleHeroRoute(link: String) {
        val clean = link.trim()
        val productIdMatch = Regex("^/products?/([0-9a-fA-F-]{8,64}).*$").matchEntire(clean)
        val orderIdMatch = Regex("^/orders/([0-9a-fA-F-]{8,64}).*$").matchEntire(clean)
        val categoryPathMatch = Regex("^/category/([^/?#]+).*$").matchEntire(clean)
        when {
            clean == "/" -> navigateToTab(AppRoutes.HOME)
            productIdMatch != null ->
                navController.navigate(AppRoutes.productDetail(productIdMatch.groupValues[1]))
            orderIdMatch != null ->
                navController.navigate(AppRoutes.orderDetail(orderIdMatch.groupValues[1]))
            categoryPathMatch != null -> {
                pendingCategoryId = categoryPathMatch.groupValues[1]
                navigateToTab(AppRoutes.CATEGORIES)
            }
            clean.contains("flash=1", ignoreCase = true) || clean.contains("flash=true", ignoreCase = true) -> {
                pendingCategoryId = null
                pendingFlashDealsOnly = true
                navigateToTab(AppRoutes.CATEGORIES)
            }
            clean.startsWith("/wishlist") -> navController.navigate(AppRoutes.WISHLIST)
            clean.startsWith("/cart") -> navigateToTab(AppRoutes.CART)
            clean.startsWith("/orders") -> navigateToTab(AppRoutes.ORDERS)
            clean.startsWith("/account") || clean.startsWith("/login") ->
                navigateToTab(AppRoutes.ACCOUNT)
            clean.startsWith("/contact") || clean.startsWith("/support") ->
                navController.navigate(AppRoutes.support())
            else -> {
                pendingCategoryId = parseHeroCategoryParam(clean)
                navigateToTab(AppRoutes.CATEGORIES)
            }
        }
    }

    LaunchedEffect(pendingDeepLink) {
        val link = pendingDeepLink?.takeIf { it.isNotBlank() } ?: return@LaunchedEffect
        handleHeroRoute(link)
        onConsumeDeepLink()
    }

    fun showBanner(message: String, showCartAction: Boolean = false, image: String? = null) {
        banner = if (showCartAction) BannerMessage(message, BannerKind.Cart, image,
            localized("عرض السلة", "View Cart")) { navigateToTab(AppRoutes.CART) }
        else BannerMessage(message)
    }
    fun showActionBanner(message: String, actionLabel: String, onAction: () -> Unit) {
        banner = BannerMessage(message, actionLabel = actionLabel, action = onAction)
    }

    fun promptSignInForWishlist() {
        showActionBanner(
            message = localized(
                "سجّل الدخول لحفظ المنتجات في المفضلة",
                "Sign in to save items to your wishlist",
            ),
            actionLabel = localized("تسجيل الدخول", "Sign In"),
            onAction = { navigateToTab(AppRoutes.ACCOUNT) },
        )
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            if (isTopLevelRoute) {
                TopAppBar(
                    title = {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Surface(
                                color = MaterialTheme.colorScheme.primaryContainer,
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.size(28.dp),
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        imageVector = Icons.Rounded.Storefront,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(16.dp),
                                    )
                                }
                            }
                            Text(
                                text = storeSettings.storeName,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                softWrap = false,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    },
                    actions = {
                        SearchAction(::openSearch)
                        IconButton(onClick = { navController.navigate(AppRoutes.WISHLIST) }) {
                            if (isSignedIn && wishlistCount > 0) {
                                BadgedBox(
                                    badge = {
                                        Badge(
                                            containerColor = WishlistRoseColor,
                                            contentColor = MaterialTheme.colorScheme.onPrimary,
                                        ) {
                                            Text(
                                                text = if (wishlistCount > 99) "99+" else wishlistCount.toString(),
                                                style = MaterialTheme.typography.labelSmall,
                                            )
                                        }
                                    },
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Favorite,
                                        contentDescription = localized("المفضلة", "Wishlist"),
                                        tint = WishlistRoseColor,
                                    )
                                }
                            } else {
                                Icon(
                                    imageVector = Icons.Outlined.FavoriteBorder,
                                    contentDescription = localized("المفضلة", "Wishlist"),
                                )
                            }
                        }
                        IconButton(onClick = { navController.navigate(AppRoutes.NOTIFICATIONS) }) {
                            if (unreadNotificationCount > 0) {
                                BadgedBox(
                                    badge = {
                                        Badge(
                                            containerColor = MaterialTheme.colorScheme.error,
                                            contentColor = MaterialTheme.colorScheme.onError,
                                        ) {
                                            Text(
                                                text = if (unreadNotificationCount > 99) "99+" else unreadNotificationCount.toString(),
                                                style = MaterialTheme.typography.labelSmall,
                                            )
                                        }
                                    },
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Notifications,
                                        contentDescription = localized("الإشعارات", "Notifications"),
                                    )
                                }
                            } else {
                                Icon(
                                    imageVector = Icons.Outlined.Notifications,
                                    contentDescription = localized("الإشعارات", "Notifications"),
                                )
                            }
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        titleContentColor = MaterialTheme.colorScheme.onSurface,
                        actionIconContentColor = MaterialTheme.colorScheme.primary,
                    ),
                )
            } else if (currentDestination?.route == AppRoutes.SEARCH) {
                TopAppBar(
                    title = { Text(localized("بحث", "Search")) },
                    navigationIcon = {
                        IconButton(onClick = { navController.popBackStack() }) {
                            Icon(Icons.AutoMirrored.Rounded.ArrowBack, localized("رجوع", "Back"))
                        }
                    },
                )
            }
        },
        bottomBar = {
            if (isTopLevelRoute) {
                Column {
                    HorizontalDivider(thickness = 1.dp, color = brandColors.hairline)
                    NavigationBar(
                        containerColor = MaterialTheme.colorScheme.surface,
                        tonalElevation = 0.dp,
                    ) {
                        TopLevelDestination.entries.forEach { destination ->
                            val selected = currentDestination?.hierarchy?.any {
                                it.route == destination.route
                            } == true

                            NavigationBarItem(
                                selected = selected,
                                onClick = { navigateToTab(destination.route) },
                                icon = {
                                    if (destination == TopLevelDestination.CART && cartItemCount > 0) {
                                        BadgedBox(
                                            badge = {
                                                Badge(
                                                    containerColor = MaterialTheme.colorScheme.secondary,
                                                    contentColor = MaterialTheme.colorScheme.onSecondary,
                                                ) {
                                                    Text(
                                                        text = if (cartItemCount > 99) "99+" else cartItemCount.toString(),
                                                        style = MaterialTheme.typography.labelSmall,
                                                    )
                                                }
                                            },
                                        ) {
                                            Icon(
                                                imageVector = if (selected) destination.selectedIcon else destination.unselectedIcon,
                                                contentDescription = destination.labelAr,
                                            )
                                        }
                                    } else {
                                        Icon(
                                            imageVector = if (selected) destination.selectedIcon else destination.unselectedIcon,
                                            contentDescription = destination.labelAr,
                                        )
                                    }
                                },
                                label = {
                                    Text(
                                        text = destination.labelAr,
                                        style = MaterialTheme.typography.labelMedium,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = MaterialTheme.colorScheme.primary,
                                    selectedTextColor = MaterialTheme.colorScheme.primary,
                                    indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                                    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                ),
                            )
                        }
                    }
                }
            }
        },
    ) { innerPadding ->
        CompositionLocalProvider(LocalBanner provides { banner = it }) {
        NavHost(
            navController = navController,
            startDestination = AppRoutes.HOME,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            composable(AppRoutes.HOME) {
                HomeScreen(
                    onProductClick = { productId ->
                        navController.navigate(AppRoutes.productDetail(productId))
                    },
                    onCategoryClick = { categoryId ->
                        pendingCategoryId = categoryId
                        pendingFlashDealsOnly = false
                        navigateToTab(AppRoutes.CATEGORIES)
                    },
                    onViewAllFlashDeals = {
                        pendingCategoryId = null
                        pendingFlashDealsOnly = true
                        navigateToTab(AppRoutes.CATEGORIES)
                    },
                    onHeroRoute = ::handleHeroRoute,
                    onShowMessage = { msg, photo -> showBanner(msg, showCartAction = true, image = photo) },
                    onWishlistSignInPrompt = ::promptSignInForWishlist,
                )
            }

            composable(AppRoutes.CATEGORIES) {
                CatalogScreen(
                    initialCategoryId = pendingCategoryId,
                    onConsumeInitialCategory = { pendingCategoryId = null },
                    initialFlashDealsOnly = pendingFlashDealsOnly,
                    onConsumeInitialFlashDeals = { pendingFlashDealsOnly = false },
                    onProductClick = { productId ->
                        navController.navigate(AppRoutes.productDetail(productId))
                    },
                    onShowMessage = { msg, photo -> showBanner(msg, showCartAction = true, image = photo) },
                    onWishlistSignInPrompt = ::promptSignInForWishlist,
                )
            }

            composable(AppRoutes.SEARCH) {
                CatalogScreen(
                    autofocusSearch = true,
                    onProductClick = { navController.navigate(AppRoutes.productDetail(it)) },
                    onShowMessage = { msg, photo -> showBanner(msg, showCartAction = true, image = photo) },
                    onWishlistSignInPrompt = ::promptSignInForWishlist,
                )
            }

            composable(AppRoutes.CART) {
                CartScreen(
                    onProceedToCheckout = {
                        navController.navigate(AppRoutes.CHECKOUT)
                    },
                    onContinueShopping = {
                        navigateToTab(AppRoutes.HOME)
                    },
                    onProductClick = { productId ->
                        navController.navigate(AppRoutes.productDetail(productId))
                    },
                )
            }

            composable(AppRoutes.ORDERS) {
                OrdersScreen(
                    initialOrderNumber = pendingTrackOrder?.first,
                    initialPhone = pendingTrackOrder?.second,
                    initialPaymentOutcome = pendingTrackOrder?.third,
                    onConsumePrefill = { pendingTrackOrder = null },
                    onOpenOrderDetail = { orderId ->
                        navController.navigate(AppRoutes.orderDetail(orderId))
                    },
                    onOpenSupport = { orderId ->
                        navController.navigate(AppRoutes.support(orderId))
                    },
                    onOpenAccount = {
                        navigateToTab(AppRoutes.ACCOUNT)
                    },
                    onShowMessage = { msg -> showBanner(msg) },
                    onShowActionMessage = { msg, actionLabel, onAction ->
                        showActionBanner(msg, actionLabel, onAction)
                    },
                )
            }

            composable(
                route = AppRoutes.ORDER_DETAIL,
                arguments = listOf(navArgument("orderId") { type = NavType.StringType }),
            ) { backStackEntry ->
                val orderId = backStackEntry.arguments?.getString("orderId").orEmpty()
                OrderDetailScreen(
                    orderId = orderId,
                    onBack = { navController.popBackStack() },
                    onSearch = ::openSearch,
                    onOpenSupport = { id -> navController.navigate(AppRoutes.support(id)) },
                    onOpenAccount = {
                        navController.popBackStack()
                        navigateToTab(AppRoutes.ACCOUNT)
                    },
                    onShowMessage = { msg -> showBanner(msg) },
                )
            }

            composable(
                route = AppRoutes.PRODUCT_DETAIL,
                arguments = listOf(navArgument("productId") { type = NavType.StringType }),
            ) {
                ProductDetailScreen(
                    onBack = { navController.popBackStack() },
                    onSearch = ::openSearch,
                    onAddedToCart = { msg, photo -> showBanner(msg, showCartAction = true, image = photo) },
                    onProductClick = { nextId ->
                        navController.navigate(AppRoutes.productDetail(nextId))
                    },
                    onOpenAccount = { navigateToTab(AppRoutes.ACCOUNT) },
                    onShowMessage = { msg -> showBanner(msg) },
                    onWishlistSignInPrompt = ::promptSignInForWishlist,
                )
            }

            composable(AppRoutes.CHECKOUT) {
                CheckoutScreen(
                    onBack = { navController.popBackStack() },
                    onSearch = ::openSearch,
                    onOpenAccount = { navigateToTab(AppRoutes.ACCOUNT) },
                    onTrackOrder = { orderNumber, phone, paymentOutcome ->
                        pendingTrackOrder = Triple(orderNumber, phone, paymentOutcome)
                        navController.popBackStack()
                        navigateToTab(AppRoutes.ORDERS)
                    },
                    onContinueShopping = {
                        navController.popBackStack(AppRoutes.HOME, inclusive = false)
                    },
                    onShowMessage = { msg -> showBanner(msg) },
                )
            }

            composable(AppRoutes.ACCOUNT) {
                AccountScreen(
                    onBack = { navigateToTab(AppRoutes.HOME) },
                    showBackButton = false,
                    onOpenOrders = {
                        navigateToTab(AppRoutes.ORDERS)
                    },
                    onOpenWishlist = {
                        navController.navigate(AppRoutes.WISHLIST)
                    },
                    onOpenSupport = {
                        navController.navigate(AppRoutes.support())
                    },
                    darkThemeOverride = darkThemeOverride,
                    onSetDarkThemePreference = onSetDarkThemePreference,
                    isRtl = storeSettings.isRtl,
                    onSelectLanguage = onSelectLanguage,
                    onShowMessage = { msg -> showBanner(msg) },
                )
            }

            composable(AppRoutes.WISHLIST) {
                WishlistScreen(
                    onBack = { navController.popBackStack() },
                    onSearch = ::openSearch,
                    onProductClick = { productId ->
                        navController.navigate(AppRoutes.productDetail(productId))
                    },
                    onBrowseCatalog = {
                        navController.popBackStack()
                        navigateToTab(AppRoutes.CATEGORIES)
                    },
                    onOpenAccount = {
                        navController.popBackStack()
                        navigateToTab(AppRoutes.ACCOUNT)
                    },
                    onShowMessage = { msg, photo -> showBanner(msg, showCartAction = photo != null, image = photo) },
                )
            }

            composable(AppRoutes.NOTIFICATIONS) {
                NotificationsScreen(
                    onBack = { navController.popBackStack() },
                    onSearch = ::openSearch,
                    onOpenDeepLink = { deepLink ->
                        navController.popBackStack()
                        handleHeroRoute(deepLink)
                    },
                )
            }

            composable(
                route = AppRoutes.SUPPORT,
                arguments = listOf(
                    navArgument("orderId") {
                        type = NavType.StringType
                        nullable = true
                        defaultValue = null
                    },
                ),
            ) {
                SupportScreen(
                    onOpenTicket = { navController.navigate(AppRoutes.supportTicket(it)) { launchSingleTop = true } },
                    onBack = { navController.popBackStack() },
                    onSearch = ::openSearch,
                    onShowMessage = { msg -> showBanner(msg) },
                )
            }
            composable(
                AppRoutes.SUPPORT_TICKET,
                arguments = listOf(navArgument("ticketId") { type = NavType.StringType }),
            ) { entry ->
                val parent = remember(entry) { navController.getBackStackEntry(AppRoutes.SUPPORT) }
                TicketDetailsScreen(
                    ticketId = requireNotNull(entry.arguments?.getString("ticketId")),
                    onBack = { navController.popBackStack() },
                    onSearch = ::openSearch,
                    viewModel = hiltViewModel(parent),
                )
            }
        }
        }
    }
    FloatingBanner(banner) { if (banner === it) banner = null }
}
