package com.whitelabel.commerce

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.whitelabel.commerce.app.MainViewModel
import com.whitelabel.commerce.app.navigation.WhiteLabelAppShell
import com.whitelabel.commerce.core.designsystem.WhiteLabelCommerceTheme
import com.whitelabel.commerce.core.notifications.NotificationChannels
import com.whitelabel.commerce.core.updater.AppUpdateDialog
import com.whitelabel.commerce.core.updater.AppUpdateViewModel
import com.whitelabel.commerce.core.updater.PlayStoreUpdater
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private val pendingDeepLinkState = mutableStateOf<String?>(null)
    private val pendingNotificationIdState = mutableStateOf<String?>(null)

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        extractDeepLink(intent)?.let { pendingDeepLinkState.value = it }
        extractNotificationId(intent)?.let { pendingNotificationIdState.value = it }
    }

    private fun extractDeepLink(intent: Intent?): String? {
        return intent?.getStringExtra(NotificationChannels.EXTRA_DEEP_LINK)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
    }

    private fun extractNotificationId(intent: Intent?): String? {
        return intent?.getStringExtra(NotificationChannels.EXTRA_NOTIFICATION_ID)
            ?.trim()
            ?.takeIf { Regex("[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}").matches(it) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        extractDeepLink(intent)?.let { pendingDeepLinkState.value = it }
        extractNotificationId(intent)?.let { pendingNotificationIdState.value = it }

        setContent {
            val ready by androidx.compose.runtime.produceState(false) {
                (application as WhiteLabelCommerceApp).localStartup.await()
                value = true
            }
            if (!ready) {
                androidx.compose.material3.Surface {
                    com.whitelabel.commerce.core.designsystem.components.BannerSkeleton()
                }
                return@setContent
            }
            val mainViewModel: MainViewModel = hiltViewModel()
            val updateViewModel: AppUpdateViewModel = hiltViewModel()
            val uiState by mainViewModel.uiState.collectAsStateWithLifecycle()
            val updateState by updateViewModel.uiState.collectAsStateWithLifecycle()
            val systemDark = isSystemInDarkTheme()
            val useDarkTheme = uiState.darkThemeOverride ?: systemDark
            val context = LocalContext.current

            val installPermissionLauncher = rememberLauncherForActivityResult(
                contract = ActivityResultContracts.StartActivityForResult(),
            ) {
                updateViewModel.onUnknownSourcesResult()
            }

            val playStoreUpdateLauncher = rememberLauncherForActivityResult(
                contract = ActivityResultContracts.StartIntentSenderForResult(),
            ) { /* Play Store handles flexible/immediate update lifecycle */ }

            val notificationPermissionLauncher = rememberLauncherForActivityResult(
                contract = ActivityResultContracts.RequestPermission(),
            ) { granted ->
                if (granted) {
                    mainViewModel.syncPushToken()
                }
            }

            LaunchedEffect(pendingNotificationIdState.value) {
                val notifId = pendingNotificationIdState.value ?: return@LaunchedEffect
                mainViewModel.markNotificationRead(notifId)
                pendingNotificationIdState.value = null
            }

            LaunchedEffect(Unit) {
                if (!BuildConfig.ENABLE_GITHUB_UPDATER && !BuildConfig.IS_WHITE_LABEL_TENANT) {
                    PlayStoreUpdater.checkAndPromptIfAvailable(context, playStoreUpdateLauncher)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    val granted = ContextCompat.checkSelfPermission(
                        context,
                        Manifest.permission.POST_NOTIFICATIONS,
                    ) == PackageManager.PERMISSION_GRANTED
                    if (!granted) {
                        notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    }
                }
            }

            androidx.lifecycle.compose.LifecycleResumeEffect(Unit) {
                mainViewModel.refreshStoreSettings()
                mainViewModel.syncPushToken()
                onPauseOrDispose {}
            }

            DisposableEffect(useDarkTheme) {
                enableEdgeToEdge(
                    statusBarStyle = if (useDarkTheme) {
                        SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
                    } else {
                        SystemBarStyle.light(
                            android.graphics.Color.TRANSPARENT,
                            android.graphics.Color.TRANSPARENT,
                        )
                    },
                    navigationBarStyle = if (useDarkTheme) {
                        SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
                    } else {
                        SystemBarStyle.light(
                            android.graphics.Color.TRANSPARENT,
                            android.graphics.Color.TRANSPARENT,
                        )
                    },
                )
                onDispose {}
            }

            val settings = uiState.storeSettings
            com.whitelabel.commerce.core.designsystem.arabicLanguage.value = settings.isRtl
            WhiteLabelCommerceTheme(
                storeSettings = settings,
                darkTheme = useDarkTheme,
            ) {
                WhiteLabelAppShell(
                    storeSettings = settings,
                    cartItemCount = uiState.cartItemCount,
                    unreadNotificationCount = uiState.unreadNotificationCount,
                    wishlistCount = uiState.wishlistCount,
                    pendingDeepLink = pendingDeepLinkState.value,
                    onConsumeDeepLink = { pendingDeepLinkState.value = null },
                    isDarkTheme = useDarkTheme,
                    darkThemeOverride = uiState.darkThemeOverride,
                    isSignedIn = uiState.isSignedIn,
                    onSetDarkThemePreference = mainViewModel::setDarkThemePreference,
                    onSelectLanguage = mainViewModel::setLanguage,
                    onRefreshStore = mainViewModel::refreshStoreSettings,
                )

                if (BuildConfig.IS_WHITE_LABEL_TENANT && updateState.tenantVersion != null && !updateState.isDismissed) {
                    androidx.compose.material3.AlertDialog(
                        onDismissRequest = updateViewModel::dismiss,
                        title = { androidx.compose.material3.Text(if (settings.isRtl) "يتوفر تحديث للتطبيق" else "App update available") },
                        text = { androidx.compose.material3.Text(settings.storeName + " " + updateState.tenantVersion) },
                        confirmButton = {
                            androidx.compose.material3.TextButton(onClick = updateViewModel::dismiss) {
                                androidx.compose.material3.Text(if (settings.isRtl) "حسنًا" else "OK")
                            }
                        },
                    )
                }
                if (BuildConfig.ENABLE_GITHUB_UPDATER && !BuildConfig.IS_WHITE_LABEL_TENANT) {
                    AppUpdateDialog(
                        state = updateState,
                        onUpdateNow = {
                            updateViewModel.startUpdate(
                                onRequestInstallPermission = { settingsIntent ->
                                    runCatching { installPermissionLauncher.launch(settingsIntent) }
                                },
                            )
                        },
                        onDismiss = updateViewModel::dismiss,
                    )
                }
            }
        }
    }
}
