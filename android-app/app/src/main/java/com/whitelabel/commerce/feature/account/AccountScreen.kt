package com.whitelabel.commerce.feature.account

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.AccountBalanceWallet
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.LightMode
import androidx.compose.material.icons.rounded.NorthEast
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Phone
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Save
import androidx.compose.material.icons.rounded.SettingsBrightness
import androidx.compose.material.icons.rounded.SouthWest
import androidx.compose.material.icons.rounded.SupportAgent
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.components.EgyptCascadingAddressFields
import com.whitelabel.commerce.core.designsystem.components.OrderStatusBadge
import com.whitelabel.commerce.core.designsystem.components.WishlistRoseColor
import com.whitelabel.commerce.core.designsystem.formatPrice
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.AuthSessionState
import com.whitelabel.commerce.core.domain.model.Order
import com.whitelabel.commerce.feature.orders.formatOrderDate

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountScreen(
    onBack: () -> Unit,
    onOpenOrders: () -> Unit,
    onOpenWishlist: () -> Unit = {},
    onOpenSupport: () -> Unit = {},
    darkThemeOverride: Boolean? = null,
    onSetDarkThemePreference: (Boolean?) -> Unit = {},
    isRtl: Boolean = true,
    onSelectLanguage: (String) -> Unit = {},
    showBackButton: Boolean = true,
    onShowMessage: (String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: AccountViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val brandColors = LocalBrandColors.current

    when (val session = state.session) {
        AuthSessionState.Loading -> {
            Box(
                modifier = modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            }
            return
        }

        AuthSessionState.SignedOut -> {
            AuthScreen(
                form = state.authForm,
                showBackButton = showBackButton,
                onBack = onBack,
                onOpenSupport = onOpenSupport,
                darkThemeOverride = darkThemeOverride,
                onSetDarkThemePreference = onSetDarkThemePreference,
                isRtl = isRtl,
                onSelectLanguage = onSelectLanguage,
                onSelectTab = viewModel::selectAuthTab,
                onSelectPasswordMode = viewModel::selectPasswordMode,
                onOtpEmailChange = viewModel::onOtpEmailChange,
                onOtpCodeChange = viewModel::onOtpCodeChange,
                onResetOtpEmail = viewModel::resetOtpEmailStep,
                onSendOtp = viewModel::sendEmailOtp,
                onVerifyOtp = {
                    viewModel.verifyEmailOtp {
                        onShowMessage(localized("تم تسجيل الدخول ومزامنة حسابك بنجاح", "Signed in & account synced"))
                    }
                },
                onFullNameChange = viewModel::onAuthFullNameChange,
                onPhoneChange = viewModel::onAuthPhoneChange,
                onPasswordEmailChange = viewModel::onPasswordEmailChange,
                onPasswordChange = viewModel::onPasswordChange,
                onSubmitPasswordAuth = {
                    viewModel.submitPasswordAuth {
                        onShowMessage(localized("تم تسجيل الدخول ومزامنة حسابك بنجاح", "Signed in & account synced"))
                    }
                },
                modifier = modifier,
            )
            return
        }

        is AuthSessionState.SignedIn -> {
            val profileForm = state.profileForm

            Scaffold(
                modifier = modifier.fillMaxSize(),
                containerColor = MaterialTheme.colorScheme.background,
                topBar = {
                    if (showBackButton) {
                        TopAppBar(
                            title = {
                                Text(
                                    text = localized("حسابي", "My Account"),
                                    style = MaterialTheme.typography.titleLarge,
                                    fontWeight = FontWeight.Bold,
                                )
                            },
                            navigationIcon = {
                                IconButton(onClick = onBack) {
                                    Icon(
                                        imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                                        contentDescription = localized("رجوع", "Back"),
                                    )
                                }
                            },
                            actions = {
                                IconButton(
                                    onClick = {
                                        viewModel.signOut {
                                            onShowMessage(localized("تم تسجيل الخروج", "Signed out"))
                                        }
                                    },
                                ) {
                                    Icon(
                                        imageVector = Icons.AutoMirrored.Rounded.Logout,
                                        contentDescription = localized("تسجيل الخروج", "Sign Out"),
                                        tint = MaterialTheme.colorScheme.error,
                                    )
                                }
                            },
                            colors = TopAppBarDefaults.topAppBarColors(
                                containerColor = MaterialTheme.colorScheme.surface,
                                titleContentColor = MaterialTheme.colorScheme.onSurface,
                            ),
                        )
                    }
                },
            ) { innerPadding ->
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    // 1. Account Identity Header Card
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, brandColors.hairline),
                        shape = MaterialTheme.shapes.medium,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            val displayName = profileForm.fullName.ifBlank {
                                session.email.substringBefore("@")
                            }
                            Surface(
                                shape = CircleShape,
                                color = MaterialTheme.colorScheme.primaryContainer,
                                modifier = Modifier.size(48.dp),
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text(
                                        text = displayName.take(1).uppercase(),
                                        style = MaterialTheme.typography.titleLarge,
                                        color = MaterialTheme.colorScheme.primary,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                            }

                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = displayName,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(
                                    text = session.email,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }

                            OutlinedButton(
                                onClick = {
                                    viewModel.signOut {
                                        onShowMessage(localized("تم تسجيل الخروج", "Signed out"))
                                    }
                                },
                                shape = MaterialTheme.shapes.small,
                            ) {
                                Text(localized("خروج", "Sign Out"))
                            }
                        }
                    }

                    // 1a. Preferences & Support Card (Appearance, Language, Customer Support)
                    PreferencesAndSupportCard(
                        darkThemeOverride = darkThemeOverride,
                        onSetDarkThemePreference = onSetDarkThemePreference,
                        isRtl = isRtl,
                        onSelectLanguage = onSelectLanguage,
                        onOpenSupport = onOpenSupport,
                    )

                    // 1b. Cloud Wishlist Shortcut Card
                    Card(
                        onClick = onOpenWishlist,
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, brandColors.hairline),
                        shape = MaterialTheme.shapes.medium,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = WishlistRoseColor.copy(alpha = 0.12f),
                                modifier = Modifier.size(40.dp),
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        imageVector = Icons.Rounded.Favorite,
                                        contentDescription = null,
                                        tint = WishlistRoseColor,
                                        modifier = Modifier.size(20.dp),
                                    )
                                }
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = localized("قائمة المفضلة", "My Wishlist"),
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(
                                    text = localized(
                                        "منتجاتك المحفوظة وتنبيهات انخفاض السعر",
                                        "Your saved items & price-drop alerts",
                                    ),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Icon(
                                imageVector = Icons.Rounded.ChevronRight,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }

                    // 1b. Store Credit & Cashback Wallet Card
                    WalletAccountCard(
                        balance = state.walletSummary.balance,
                        currency = state.walletSummary.currency.ifBlank { state.storeSettings.currency },
                        locale = state.storeSettings.locale,
                        cashbackEnabled = state.storeSettings.cashbackEnabled,
                        cashbackPercentage = state.storeSettings.cashbackPercentage,
                        transactions = state.walletSummary.transactions,
                        isLoading = state.isLoadingWallet,
                        onRefresh = viewModel::loadWallet,
                    )

                    // 2. Editable Default Shipping Profile Card
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, brandColors.hairline),
                        shape = MaterialTheme.shapes.medium,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Text(
                                text = localized("بيانات الشحن الافتراضية", "Default Shipping Profile"),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = localized(
                                    "تُستخدم هذه البيانات لملء صفحة الدفع تلقائياً وربط أي طلبات سابقة مطابقة لرقم موبايلك.",
                                    "Used to auto-fill Checkout and automatically claim any past guest orders matching your mobile number.",
                                ),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )

                            if (profileForm.saveSuccess) {
                                Surface(
                                    color = brandColors.success.copy(alpha = 0.14f),
                                    contentColor = brandColors.success,
                                    shape = MaterialTheme.shapes.small,
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Row(
                                        modifier = Modifier.padding(10.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        Icon(
                                            imageVector = Icons.Rounded.CheckCircle,
                                            contentDescription = null,
                                            modifier = Modifier.size(18.dp),
                                        )
                                        Text(
                                            text = localized(
                                                "تم حفظ بياناتك ومزامنة طلباتك بنجاح.",
                                                "Profile saved and matching guest orders synced.",
                                            ),
                                            style = MaterialTheme.typography.bodySmall,
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                    }
                                }
                            }

                            profileForm.saveError?.let { err ->
                                Surface(
                                    color = MaterialTheme.colorScheme.errorContainer,
                                    contentColor = MaterialTheme.colorScheme.onErrorContainer,
                                    shape = MaterialTheme.shapes.small,
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Text(
                                        text = err,
                                        style = MaterialTheme.typography.bodySmall,
                                        modifier = Modifier.padding(10.dp),
                                    )
                                }
                            }

                            OutlinedTextField(
                                value = profileForm.fullName,
                                onValueChange = viewModel::onProfileNameChange,
                                label = { Text(localized("الاسم بالكامل", "Full Name")) },
                                leadingIcon = { Icon(Icons.Rounded.Person, contentDescription = null) },
                                singleLine = true,
                                shape = MaterialTheme.shapes.small,
                                modifier = Modifier.fillMaxWidth(),
                            )

                            OutlinedTextField(
                                value = profileForm.phone,
                                onValueChange = viewModel::onProfilePhoneChange,
                                label = { Text(localized("رقم الموبايل المصري", "Egyptian Mobile Number")) },
                                placeholder = { Text("01012345678") },
                                leadingIcon = { Icon(Icons.Rounded.Phone, contentDescription = null) },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                                isError = profileForm.phoneError != null,
                                supportingText = profileForm.phoneError?.let { { Text(it) } },
                                singleLine = true,
                                shape = MaterialTheme.shapes.small,
                                modifier = Modifier.fillMaxWidth(),
                            )

                            EgyptCascadingAddressFields(
                                governorate = profileForm.governorate,
                                city = profileForm.city,
                                streetAddress = profileForm.address,
                                onGovernorateSelected = viewModel::onProfileGovernorateChange,
                                onCitySelected = viewModel::onProfileCityChange,
                                onStreetAddressChange = viewModel::onProfileAddressChange,
                            )

                            Button(
                                onClick = viewModel::saveProfile,
                                enabled = !profileForm.isSaving,
                                shape = MaterialTheme.shapes.small,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(48.dp),
                            ) {
                                if (profileForm.isSaving) {
                                    CircularProgressIndicator(
                                        strokeWidth = 2.dp,
                                        color = MaterialTheme.colorScheme.onPrimary,
                                        modifier = Modifier.size(20.dp),
                                    )
                                } else {
                                    Icon(
                                        imageVector = Icons.Rounded.Save,
                                        contentDescription = null,
                                        modifier = Modifier.size(18.dp),
                                    )
                                    Spacer(modifier = Modifier.size(8.dp))
                                    Text(localized("حفظ البيانات وربط الطلبات", "Save Profile & Sync Orders"))
                                }
                            }
                        }
                    }

                    // 3. Synced Order History Card
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, brandColors.hairline),
                        shape = MaterialTheme.shapes.medium,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Icon(
                                        imageVector = Icons.AutoMirrored.Rounded.ReceiptLong,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.primary,
                                    )
                                    Text(
                                        text = localized("طلباتي المتزامنة", "Synced Order History"),
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    IconButton(onClick = viewModel::loadAccountOrders) {
                                        Icon(
                                            imageVector = Icons.Rounded.Refresh,
                                            contentDescription = localized("تحديث", "Refresh"),
                                        )
                                    }
                                    TextButton(onClick = onOpenOrders) {
                                        Text(localized("عرض الكل", "View all"))
                                    }
                                }
                            }

                            when {
                                state.isLoadingOrders -> {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(vertical = 16.dp),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        CircularProgressIndicator(modifier = Modifier.size(24.dp))
                                    }
                                }

                                state.orders.isEmpty() -> {
                                    Text(
                                        text = localized(
                                            "لا توجد طلبات مسجلة على حسابك بعد. أضف رقم موبايلك أعلاه لربط أي طلبات سابقة.",
                                            "No synced orders on your account yet. Save your mobile number above to link any past guest orders.",
                                        ),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }

                                else -> {
                                    state.orders.take(10).forEachIndexed { idx, order ->
                                        if (idx > 0) HorizontalDivider(color = brandColors.hairline)
                                        SyncedAccountOrderRow(
                                            order = order,
                                            locale = state.storeSettings.locale,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun PreferencesAndSupportCard(
    darkThemeOverride: Boolean?,
    onSetDarkThemePreference: (Boolean?) -> Unit,
    isRtl: Boolean,
    onSelectLanguage: (String) -> Unit,
    onOpenSupport: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val brandColors = LocalBrandColors.current
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, brandColors.hairline),
        shape = MaterialTheme.shapes.medium,
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                text = localized("التفضيلات والدعم", "Preferences & Support"),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )

            // Appearance (Light / Dark / System)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = localized("المظهر", "Appearance"),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    FilterChip(
                        selected = darkThemeOverride == false,
                        onClick = { onSetDarkThemePreference(false) },
                        label = { Text(localized("فاتح", "Light"), maxLines = 1) },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Rounded.LightMode,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                            selectedLabelColor = MaterialTheme.colorScheme.primary,
                            selectedLeadingIconColor = MaterialTheme.colorScheme.primary,
                        ),
                        modifier = Modifier.weight(1f),
                    )
                    FilterChip(
                        selected = darkThemeOverride == true,
                        onClick = { onSetDarkThemePreference(true) },
                        label = { Text(localized("داكن", "Dark"), maxLines = 1) },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Rounded.DarkMode,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                            selectedLabelColor = MaterialTheme.colorScheme.primary,
                            selectedLeadingIconColor = MaterialTheme.colorScheme.primary,
                        ),
                        modifier = Modifier.weight(1f),
                    )
                    FilterChip(
                        selected = darkThemeOverride == null,
                        onClick = { onSetDarkThemePreference(null) },
                        label = { Text(localized("تلقائي", "System"), maxLines = 1) },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Rounded.SettingsBrightness,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                            selectedLabelColor = MaterialTheme.colorScheme.primary,
                            selectedLeadingIconColor = MaterialTheme.colorScheme.primary,
                        ),
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            // Language (Arabic / English)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = localized("اللغة", "Language"),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    FilterChip(
                        selected = isRtl,
                        onClick = { onSelectLanguage("ar") },
                        label = { Text("العربية", maxLines = 1) },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Rounded.Language,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                            selectedLabelColor = MaterialTheme.colorScheme.primary,
                            selectedLeadingIconColor = MaterialTheme.colorScheme.primary,
                        ),
                        modifier = Modifier.weight(1f),
                    )
                    FilterChip(
                        selected = !isRtl,
                        onClick = { onSelectLanguage("en") },
                        label = { Text("English", maxLines = 1) },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Rounded.Language,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                            selectedLabelColor = MaterialTheme.colorScheme.primary,
                            selectedLeadingIconColor = MaterialTheme.colorScheme.primary,
                        ),
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            HorizontalDivider(color = brandColors.hairline)

            // Customer Support Row
            Surface(
                onClick = onOpenSupport,
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Surface(
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.primaryContainer,
                        modifier = Modifier.size(38.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Rounded.SupportAgent,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = localized("خدمة العملاء والدعم", "Customer Support"),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = localized(
                                "تواصل معنا لمتابعة طلباتك أو أي استفسار",
                                "Reach us for order help or inquiries",
                            ),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Icon(
                        imageVector = Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun WalletAccountCard(
    balance: Double,
    currency: String,
    locale: String,
    cashbackEnabled: Boolean,
    cashbackPercentage: Double,
    transactions: List<com.whitelabel.commerce.core.domain.model.WalletTransaction>,
    isLoading: Boolean,
    onRefresh: () -> Unit,
) {
    val brandColors = LocalBrandColors.current
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, brandColors.hairline),
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Surface(
                color = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
                shape = MaterialTheme.shapes.medium,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.AccountBalanceWallet,
                                contentDescription = null,
                                modifier = Modifier.size(24.dp),
                            )
                            Column {
                                Text(
                                    text = localized("رصيد المحفظة المتاح", "Available Wallet Balance"),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.85f),
                                )
                                Text(
                                    text = formatPrice(balance, currency, locale),
                                    style = MaterialTheme.typography.headlineSmall,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                        IconButton(onClick = onRefresh) {
                            Icon(
                                imageVector = Icons.Rounded.Refresh,
                                contentDescription = localized("تحديث المحفظة", "Refresh wallet"),
                                tint = MaterialTheme.colorScheme.onPrimary,
                            )
                        }
                    }

                    if (cashbackEnabled && cashbackPercentage > 0.0) {
                        val pctStr = if (cashbackPercentage % 1.0 == 0.0) {
                            cashbackPercentage.toInt().toString()
                        } else {
                            cashbackPercentage.toString()
                        }
                        Surface(
                            color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.16f),
                            shape = CircleShape,
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.AutoAwesome,
                                    contentDescription = null,
                                    modifier = Modifier.size(14.dp),
                                )
                                Text(
                                    text = localized(
                                        "اكسب $pctStr% كاش باك عند اكتمال كل طلب",
                                        "Earn $pctStr% cashback on every delivered order",
                                    ),
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                        }
                    }
                }
            }

            Text(
                text = localized("سجل حركات المحفظة", "Wallet Transaction History"),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
            )

            when {
                isLoading && transactions.isEmpty() -> {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 10.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(22.dp))
                    }
                }

                transactions.isEmpty() -> {
                    Text(
                        text = localized(
                            "لا توجد حركات على المحفظة بعد. أكمل طلباتك لتربح كاش باك تلقائياً!",
                            "No wallet transactions yet. Complete orders to earn automatic cashback!",
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                else -> {
                    transactions.take(12).forEachIndexed { idx, tx ->
                        if (idx > 0) HorizontalDivider(color = brandColors.hairline)
                        val isCredit = tx.amount > 0.0
                        val shortOrder = tx.orderId?.take(8)?.let { "#$it" }.orEmpty()
                        val title = localized(
                            arabic = tx.noteAr.ifBlank {
                                when (tx.type) {
                                    "cashback_earned" -> "كاش باك طلب $shortOrder".trim()
                                    "order_redemption" -> "خصم على طلب $shortOrder".trim()
                                    "order_refund" -> "استرداد طلب ملغي $shortOrder".trim()
                                    "admin_credit" -> "رصيد إداري"
                                    "admin_debit" -> "خصم إداري"
                                    else -> "حركة محفظة"
                                }
                            },
                            english = tx.noteEn.ifBlank {
                                when (tx.type) {
                                    "cashback_earned" -> "Cashback earned $shortOrder".trim()
                                    "order_redemption" -> "Redeemed on order $shortOrder".trim()
                                    "order_refund" -> "Refunded from order $shortOrder".trim()
                                    "admin_credit" -> "Store credit added"
                                    "admin_debit" -> "Store credit deducted"
                                    else -> "Wallet adjustment"
                                }
                            },
                        )
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = if (isCredit) {
                                    brandColors.success.copy(alpha = 0.14f)
                                } else {
                                    MaterialTheme.colorScheme.errorContainer
                                },
                                contentColor = if (isCredit) {
                                    brandColors.success
                                } else {
                                    MaterialTheme.colorScheme.error
                                },
                                modifier = Modifier.size(32.dp),
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        imageVector = if (isCredit) Icons.Rounded.SouthWest else Icons.Rounded.NorthEast,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp),
                                    )
                                }
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = title,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Text(
                                    text = formatOrderDate(tx.createdAt),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                val sign = if (isCredit) "+" else "-"
                                Text(
                                    text = "$sign${formatPrice(kotlin.math.abs(tx.amount), currency, locale)}",
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = if (isCredit) brandColors.success else MaterialTheme.colorScheme.error,
                                )
                                Text(
                                    text = localized(
                                        "الرصيد: ${formatPrice(tx.balanceAfter, currency, locale)}",
                                        "Bal: ${formatPrice(tx.balanceAfter, currency, locale)}",
                                    ),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SyncedAccountOrderRow(
    order: Order,
    locale: String,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = localized("طلب #${order.id.take(8)}", "Order #${order.id.take(8)}"),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
            )
            OrderStatusBadge(status = order.status)
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = formatOrderDate(order.createdAt),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            order.total?.let { amount ->
                Text(
                    text = formatPrice(amount, order.currency, locale),
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}
