package com.whitelabel.commerce

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
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.whitelabel.commerce.app.MainViewModel
import com.whitelabel.commerce.app.navigation.WhiteLabelAppShell
import com.whitelabel.commerce.core.designsystem.WhiteLabelCommerceTheme
import com.whitelabel.commerce.core.updater.AppUpdateDialog
import com.whitelabel.commerce.core.updater.AppUpdateViewModel
import com.whitelabel.commerce.core.updater.PlayStoreUpdater
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

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

            LaunchedEffect(Unit) {
                if (!BuildConfig.ENABLE_GITHUB_UPDATER) {
                    PlayStoreUpdater.checkAndPromptIfAvailable(context, playStoreUpdateLauncher)
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
                    isDarkTheme = useDarkTheme,
                    isSignedIn = uiState.isSignedIn,
                    onToggleTheme = { mainViewModel.toggleDarkTheme(currentlyDark = useDarkTheme) },
                    onLanguage = {
                        val next = if (settings.isRtl) "en" else "ar"
                        prefs.edit().putString("language", next).apply()
                        language.value = next
                    },
                    onRefreshStore = mainViewModel::refreshStoreSettings,
                )

                if (BuildConfig.ENABLE_GITHUB_UPDATER) {
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
