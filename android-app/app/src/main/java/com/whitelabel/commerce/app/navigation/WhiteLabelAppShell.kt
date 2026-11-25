package com.whitelabel.commerce.app.navigation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.LightMode
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.SupportAgent
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
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
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
import com.whitelabel.commerce.feature.orders.OrdersScreen
import com.whitelabel.commerce.feature.support.SupportScreen
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WhiteLabelAppShell(
    storeSettings: StoreSettings,
    cartItemCount: Int,
    unreadNotificationCount: Int = 0,
    pendingDeepLink: String? = null,
    onConsumeDeepLink: () -> Unit = {},
    isDarkTheme: Boolean,
    isSignedIn: Boolean,
    onToggleTheme: () -> Unit,
    onLanguage: () -> Unit,
    onRefreshStore: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination
    val isTopLevelRoute = currentDestination?.route in AppRoutes.topLevelRoutes ||
        currentDestination == null

    val brandColors = LocalBrandColors.current
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    // Cross-tab handoff states
    var pendingCategoryId by remember { mutableStateOf<String?>(null) }
    var pendingTrackOrder by remember { mutableStateOf<Triple<String, String, PaymentFlowOutcome?>?>(null) }

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
        val categoryPathMatch = Regex("^/category/([^/?#]+).*$").matchEntire(clean)
        when {
            clean == "/" -> navigateToTab(AppRoutes.HOME)
            productIdMatch != null ->
                navController.navigate(AppRoutes.productDetail(productIdMatch.groupValues[1]))
            categoryPathMatch != null -> {
                pendingCategoryId = categoryPathMatch.groupValues[1]
                navigateToTab(AppRoutes.CATEGORIES)
            }
            clean.startsWith("/cart") -> navigateToTab(AppRoutes.CART)
            clean.startsWith("/orders") -> navigateToTab(AppRoutes.ORDERS)
            clean.startsWith("/account") || clean.startsWith("/login") ->
                navController.navigate(AppRoutes.ACCOUNT)
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

    fun showSnackbar(message: String, showCartAction: Boolean = false) {
        scope.launch {
            snackbarHostState.currentSnackbarData?.dismiss()
            val result = snackbarHostState.showSnackbar(
                message = message,
                actionLabel = if (showCartAction) localized("عرض السلة", "View cart") else null,
                duration = SnackbarDuration.Short,
            )
            if (result == SnackbarResult.ActionPerformed && showCartAction) {
                navigateToTab(AppRoutes.CART)
            }
        }
    }

    fun showActionSnackbar(message: String, actionLabel: String, onAction: () -> Unit) {
        scope.launch {
            snackbarHostState.currentSnackbarData?.dismiss()
            val result = snackbarHostState.showSnackbar(
                message = message,
                actionLabel = actionLabel,
                duration = SnackbarDuration.Long,
            )
            if (result == SnackbarResult.ActionPerformed) {
                onAction()
            }
        }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
        topBar = {
            if (isTopLevelRoute) {
                TopAppBar(
                    title = {
                        Text(
                            text = storeSettings.storeName,
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    },
                    actions = {
                        TextButton(onClick = onLanguage) {
                            Text(
                                text = if (storeSettings.isRtl) "EN" else "عربي",
                                fontWeight = FontWeight.Bold,
                            )
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
                        IconButton(onClick = { navController.navigate(AppRoutes.ACCOUNT) }) {
                            Icon(
                                imageVector = if (isSignedIn) {
                                    Icons.Rounded.AccountCircle
                                } else {
                                    Icons.Outlined.AccountCircle
                                },
                                contentDescription = localized("حسابي", "Account"),
                            )
                        }
                        IconButton(onClick = { navController.navigate(AppRoutes.support()) }) {
                            Icon(
                                imageVector = Icons.Rounded.SupportAgent,
                                contentDescription = localized("الدعم الفني", "Support"),
                            )
                        }
                        IconButton(onClick = onToggleTheme) {
                            Icon(
                                imageVector = if (isDarkTheme) Icons.Rounded.LightMode else Icons.Rounded.DarkMode,
                                contentDescription = if (isDarkTheme) {
                                    localized("الوضع النهاري", "Light mode")
                                } else {
                                    localized("الوضع الليلي", "Dark mode")
                                },
                            )
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        titleContentColor = MaterialTheme.colorScheme.onSurface,
                        actionIconContentColor = MaterialTheme.colorScheme.primary,
                    ),
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
                        navigateToTab(AppRoutes.CATEGORIES)
                    },
                    onHeroRoute = ::handleHeroRoute,
                    onShowMessage = { msg -> showSnackbar(msg, showCartAction = true) },
                )
            }

            composable(AppRoutes.CATEGORIES) {
                CatalogScreen(
                    initialCategoryId = pendingCategoryId,
                    onConsumeInitialCategory = { pendingCategoryId = null },
                    onProductClick = { productId ->
                        navController.navigate(AppRoutes.productDetail(productId))
                    },
                    onShowMessage = { msg -> showSnackbar(msg, showCartAction = true) },
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
                    onOpenSupport = { orderId ->
                        navController.navigate(AppRoutes.support(orderId))
                    },
                    onOpenAccount = {
                        navController.navigate(AppRoutes.ACCOUNT)
                    },
                    onShowMessage = { msg -> showSnackbar(msg) },
                    onShowActionMessage = { msg, actionLabel, onAction ->
                        showActionSnackbar(msg, actionLabel, onAction)
                    },
                )
            }

            composable(
                route = AppRoutes.PRODUCT_DETAIL,
                arguments = listOf(navArgument("productId") { type = NavType.StringType }),
            ) {
                ProductDetailScreen(
                    onBack = { navController.popBackStack() },
                    onAddedToCart = { msg -> showSnackbar(msg, showCartAction = true) },
                )
            }

            composable(AppRoutes.CHECKOUT) {
                CheckoutScreen(
                    onBack = { navController.popBackStack() },
                    onOpenAccount = { navController.navigate(AppRoutes.ACCOUNT) },
                    onTrackOrder = { orderNumber, phone, paymentOutcome ->
                        pendingTrackOrder = Triple(orderNumber, phone, paymentOutcome)
                        navController.popBackStack()
                        navigateToTab(AppRoutes.ORDERS)
                    },
                    onContinueShopping = {
                        navController.popBackStack()
                        navigateToTab(AppRoutes.HOME)
                    },
                    onShowMessage = { msg -> showSnackbar(msg) },
                )
            }

            composable(AppRoutes.ACCOUNT) {
                AccountScreen(
                    onBack = { navController.popBackStack() },
                    onOpenOrders = {
                        navController.popBackStack()
                        navigateToTab(AppRoutes.ORDERS)
                    },
                    onShowMessage = { msg -> showSnackbar(msg) },
                )
            }

            composable(AppRoutes.NOTIFICATIONS) {
                NotificationsScreen(
                    onBack = { navController.popBackStack() },
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
                    onBack = { navController.popBackStack() },
                    onShowMessage = { msg -> showSnackbar(msg) },
                )
            }
        }
    }
}
