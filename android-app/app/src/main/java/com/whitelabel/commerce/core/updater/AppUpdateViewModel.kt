package com.whitelabel.commerce.core.updater

import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

data class AppUpdateUiState(
    val availableUpdate: AvailableUpdate? = null,
    val isDismissed: Boolean = false,
    val isDownloading: Boolean = false,
    val downloadProgress: Float = 0f,
    val downloadedApk: File? = null,
    val awaitingInstallPermission: Boolean = false,
    val downloadFailed: Boolean = false,
)

@HiltViewModel
class AppUpdateViewModel @Inject constructor(
    private val updater: GitHubReleaseUpdater,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AppUpdateUiState())
    val uiState: StateFlow<AppUpdateUiState> = _uiState.asStateFlow()

    private var downloadJob: Job? = null

    init {
        checkForUpdates()
    }

    fun checkForUpdates() {
        viewModelScope.launch {
            val release = updater.checkForUpdate()
            if (release != null) {
                _uiState.update { current ->
                    current.copy(
                        availableUpdate = release,
                        isDismissed = false,
                    )
                }
            }
        }
    }

    fun startUpdate(
        onRequestInstallPermission: (Intent) -> Unit,
        onLaunchInstaller: (Intent) -> Unit,
    ) {
        val state = _uiState.value
        val update = state.availableUpdate ?: return
        if (state.isDownloading) return

        // If APK is already downloaded and intact, go straight to install/permission flow
        val existingApk = state.downloadedApk
        if (existingApk != null && existingApk.exists() && existingApk.length() > 0L) {
            triggerInstallOrPermission(existingApk, onRequestInstallPermission, onLaunchInstaller)
            return
        }

        downloadJob?.cancel()
        downloadJob = viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isDownloading = true,
                    downloadProgress = 0f,
                    downloadFailed = false,
                    awaitingInstallPermission = false,
                )
            }

            val result = updater.downloadApk(update) { progress ->
                _uiState.update { it.copy(downloadProgress = progress) }
            }

            result.onSuccess { apkFile ->
                _uiState.update {
                    it.copy(
                        isDownloading = false,
                        downloadProgress = 1f,
                        downloadedApk = apkFile,
                        downloadFailed = false,
                    )
                }
                triggerInstallOrPermission(apkFile, onRequestInstallPermission, onLaunchInstaller)
            }.onFailure {
                _uiState.update {
                    it.copy(
                        isDownloading = false,
                        downloadProgress = 0f,
                        downloadFailed = true,
                    )
                }
            }
        }
    }

    fun onUnknownSourcesResult(onLaunchInstaller: (Intent) -> Unit) {
        val apkFile = _uiState.value.downloadedApk ?: return
        if (!apkFile.exists() || apkFile.length() <= 0L) return
        if (updater.canRequestPackageInstalls()) {
            _uiState.update { it.copy(awaitingInstallPermission = false) }
            onLaunchInstaller(updater.buildInstallApkIntent(apkFile))
        }
    }

    fun dismiss() {
        downloadJob?.cancel()
        downloadJob = null
        _uiState.update {
            it.copy(
                isDismissed = true,
                isDownloading = false,
                awaitingInstallPermission = false,
            )
        }
    }

    private fun triggerInstallOrPermission(
        apkFile: File,
        onRequestInstallPermission: (Intent) -> Unit,
        onLaunchInstaller: (Intent) -> Unit,
    ) {
        if (!updater.canRequestPackageInstalls()) {
            _uiState.update { it.copy(awaitingInstallPermission = true) }
            onRequestInstallPermission(updater.buildManageUnknownSourcesIntent())
        } else {
            _uiState.update { it.copy(awaitingInstallPermission = false) }
            onLaunchInstaller(updater.buildInstallApkIntent(apkFile))
        }
    }
}
