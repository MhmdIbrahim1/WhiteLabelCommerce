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
            ?.takeIf { it.isNotEmpty() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        extractDeepLink(intent)?.let { pendingDeepLinkState.value = it }
        extractNotificationId(intent)?.let { pendingNotificationIdState.value = it }

        setContent {
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
                    mainViewModel.syncPushToken(uiState.storeSettings.locale)
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

            val prefs = androidx.compose.runtime.remember { getSharedPreferences("language_" + BuildConfig.STORE_ID, MODE_PRIVATE) }
            val language = androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(prefs.getString("language", null)) }
            val settings = uiState.storeSettings.copy(locale = language.value ?: uiState.storeSettings.locale)
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
                    onSelectLanguage = { next ->
                        prefs.edit().putString("language", next).apply()
                        language.value = next
                        mainViewModel.syncPushToken(next)
                    },
                    onRefreshStore = mainViewModel::refreshStoreSettings,
                )

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
