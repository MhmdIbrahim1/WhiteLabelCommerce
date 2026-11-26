package com.whitelabel.commerce.feature.account

import com.whitelabel.commerce.core.domain.model.formatOrderNumber
import androidx.compose.runtime.setValue
import com.whitelabel.commerce.core.designsystem.components.BannerFeedback
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
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.AccountBalanceWallet
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.DarkMode
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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import com.whitelabel.commerce.core.designsystem.formatPrice
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.AuthSessionState
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
            var section by androidx.compose.runtime.saveable.rememberSaveable(session.userId) { androidx.compose.runtime.mutableStateOf("hub") }
            val profileForm = state.profileForm
            val name = profileForm.fullName.ifBlank { session.email.substringBefore("@") }
            androidx.activity.compose.BackHandler(section != "hub") { section = "hub" }
            androidx.compose.runtime.LaunchedEffect(section, session.userId) {
                if (section == "hub") viewModel.loadCounts()
                if (section == "wallet") viewModel.loadWallet()
            }
            Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)) {
                if (section != "hub") TextButton(onClick = { section = "hub" }) { Text(localized("العودة إلى حسابي", "Back to account")) }
                when (section) {
                    "hub" -> {
                        Text(localized("حسابي", "My Account"), style = MaterialTheme.typography.headlineMedium)
                        Card(Modifier.fillMaxWidth()) {
                            Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primaryContainer) {
                                    Box(Modifier.size(46.dp), contentAlignment = Alignment.Center) { Text(name.take(1).uppercase()) }
                                }
                                Column(Modifier.weight(1f)) {
                                    Text(name, fontWeight = FontWeight.Bold); Text(session.email, style = MaterialTheme.typography.bodySmall)
                                    if (profileForm.phone.isNotBlank()) Text(profileForm.phone, style = MaterialTheme.typography.bodySmall)
                                }
                                TextButton(onClick = { section = "profile" }) { Text(localized("تعديل", "Edit")) }
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            HubTile(localized("طلباتي","My Orders"), state.counts.orders, Modifier.weight(1f), onOpenOrders)
                            HubTile(localized("عناويني","Saved Addresses"), state.counts.addresses, Modifier.weight(1f)) { section = "addresses" }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            HubTile(localized("تذاكر الدعم","Support Tickets"), state.counts.tickets, Modifier.weight(1f), onOpenSupport)
                            HubTile(localized("المفضلة","Wishlist"), state.counts.wishlist, Modifier.weight(1f), onOpenWishlist)
                        }
                        Card(Modifier.fillMaxWidth()) {
                            listOf("profile" to localized("بياناتي الشخصية","Personal information"), "security" to localized("الأمان وكلمة المرور","Security & password"),
                                "preferences" to localized("التفضيلات","Preferences"), "wallet" to localized("محفظة المتجر","Store wallet")).forEach { (key,label) ->
                                TextButton(onClick = { section = key }, modifier = Modifier.fillMaxWidth()) { Text(label, Modifier.weight(1f)) }
                            }
                            TextButton(onClick = { viewModel.signOut { onShowMessage(localized("تم تسجيل الخروج","Signed out")) } },
                                modifier = Modifier.fillMaxWidth()) { Text(localized("تسجيل الخروج","Sign out"), Modifier.weight(1f)) }
                        }
                    }
                    "addresses" -> com.whitelabel.commerce.feature.addresses.AddressBook(session.email,
                        com.whitelabel.commerce.core.domain.model.CustomerAddress(recipientName = profileForm.fullName, phone = profileForm.phone))
                    "preferences" -> PreferencesAndSupportCard(darkThemeOverride, onSetDarkThemePreference, isRtl, onSelectLanguage, onOpenSupport)
                    "security" -> PasswordPanel(PasswordMode.Change, viewModel = viewModel)
                    "wallet" -> WalletAccountCard(balance = state.walletSummary.balance, currency = state.walletSummary.currency.ifBlank { state.storeSettings.currency },
                        locale = state.storeSettings.locale, cashbackEnabled = state.storeSettings.cashbackEnabled,
                        cashbackPercentage = state.storeSettings.cashbackPercentage, transactions = state.walletSummary.transactions,
                        isLoading = state.isLoadingWallet, onRefresh = viewModel::loadWallet)
                    "profile" -> ProfileCard(profileForm, viewModel)
                }
            }
        }
    }
}

@Composable
private fun ProfileCard(profileForm: ProfileFormState, viewModel: AccountViewModel) {
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
            Text(
                text = localized("بيانات الشحن الافتراضية", "Default Shipping Profile"),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = localized(
                    "تُستخدم هذه البيانات لملء عنوان الشحن عند الدفع.",
                    "Used to fill in your shipping details at checkout.",
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
                                "تم حفظ بيانات حسابك.",
                                "Your profile has been saved.",
                            ),
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }

            profileForm.saveError?.let { BannerFeedback(it) }

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
}

@Composable
private fun HubTile(label: String, count: Int, modifier: Modifier, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = modifier) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(count.toString(), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
            Text(label, style = MaterialTheme.typography.labelLarge)
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
                        val shortOrder = tx.orderId?.let(::formatOrderNumber).orEmpty()
                        val title = localized(
                            arabic = tx.noteAr.ifBlank {
                                when (tx.type) {
                                    "cashback_earned" -> "كاش باك طلب $shortOrder".trim()
                                    "order_redemption" -> "خصم على طلب $shortOrder".trim()
                                    "order_refund" -> "استرداد طلب ملغي $shortOrder".trim()
                                    "return_refund", "credit" -> "استرداد إرجاع $shortOrder".trim()
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
                                    "return_refund", "credit" -> "Return refund $shortOrder".trim()
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
