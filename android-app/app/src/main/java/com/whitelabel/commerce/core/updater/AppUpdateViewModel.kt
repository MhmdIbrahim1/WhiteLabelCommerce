package com.whitelabel.commerce.core.updater

import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.whitelabel.commerce.BuildConfig
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
    val isVerifying: Boolean = false,
    val isInstalling: Boolean = false,
    val downloadProgress: Float = 0f,
    val downloadedApk: File? = null,
    val awaitingInstallPermission: Boolean = false,
    val errorMessageAr: String? = null,
    val errorMessageEn: String? = null,
) {
    val isBusy: Boolean
        get() = isDownloading || isVerifying || isInstalling
}

@HiltViewModel
class AppUpdateViewModel @Inject constructor(
    private val updater: GitHubReleaseUpdater,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AppUpdateUiState())
    val uiState: StateFlow<AppUpdateUiState> = _uiState.asStateFlow()

    private var updateJob: Job? = null

    init {
        viewModelScope.launch {
            // Always clean up leftover cached APKs from completed/abandoned updates
            updater.cleanupStaleUpdateFiles()
            if (BuildConfig.ENABLE_GITHUB_UPDATER) {
                checkForUpdates()
            }
        }
        observeInstallEvents()
    }

    private fun observeInstallEvents() {
        viewModelScope.launch {
            InstallStatusBus.events.collect { event ->
                when (event) {
                    InstallSessionEvent.AwaitingUserConfirmation -> {
                        _uiState.update {
                            it.copy(
                                isInstalling = true,
                                errorMessageAr = null,
                                errorMessageEn = null,
                            )
                        }
                    }

                    InstallSessionEvent.Succeeded -> {
                        _uiState.update {
                            it.copy(
                                isInstalling = false,
                                isDismissed = true,
                                errorMessageAr = null,
                                errorMessageEn = null,
                            )
                        }
                    }

                    is InstallSessionEvent.Failed -> {
                        _uiState.update {
                            it.copy(
                                isInstalling = false,
                                errorMessageAr = event.messageAr,
                                errorMessageEn = event.messageEn,
                            )
                        }
                    }
                }
            }
        }
    }

    fun checkForUpdates() {
        if (!BuildConfig.ENABLE_GITHUB_UPDATER) return
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
    ) {
        val state = _uiState.value
        val update = state.availableUpdate ?: return
        if (state.isBusy) return

        // If APK is already downloaded & intact, re-verify and proceed to PackageInstaller session
        val existingApk = state.downloadedApk
        if (existingApk != null && existingApk.exists() && existingApk.length() > 0L) {
            updateJob?.cancel()
            updateJob = viewModelScope.launch {
                verifyAndInstall(existingApk, update.expectedSha256, onRequestInstallPermission)
            }
            return
        }

        updateJob?.cancel()
        updateJob = viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isDownloading = true,
                    isVerifying = false,
                    isInstalling = false,
                    downloadProgress = 0f,
                    awaitingInstallPermission = false,
                    errorMessageAr = null,
                    errorMessageEn = null,
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
                    )
                }
                verifyAndInstall(apkFile, update.expectedSha256, onRequestInstallPermission)
            }.onFailure {
                _uiState.update {
                    it.copy(
                        isDownloading = false,
                        downloadProgress = 0f,
                        errorMessageAr = "تعذر تحميل ملف التحديث. تحقق من اتصالك بالإنترنت وحاول مجدداً.",
                        errorMessageEn = "Could not download the update package. Please check your connection and try again.",
                    )
                }
            }
        }
    }

    fun onUnknownSourcesResult() {
        val state = _uiState.value
        val apkFile = state.downloadedApk ?: return
        val update = state.availableUpdate ?: return
        if (!apkFile.exists() || apkFile.length() <= 0L) return
        if (!updater.canRequestPackageInstalls()) return

        _uiState.update { it.copy(awaitingInstallPermission = false) }
        updateJob?.cancel()
        updateJob = viewModelScope.launch {
            verifyAndInstall(apkFile, update.expectedSha256) { /* permission already granted */ }
        }
    }

    fun dismiss() {
        updateJob?.cancel()
        updateJob = null
        _uiState.update {
            it.copy(
                isDismissed = true,
                isDownloading = false,
                isVerifying = false,
                isInstalling = false,
                awaitingInstallPermission = false,
            )
        }
    }

    private suspend fun verifyAndInstall(
        apkFile: File,
        expectedSha256: String?,
        onRequestInstallPermission: (Intent) -> Unit,
    ) {
        _uiState.update {
            it.copy(
                isVerifying = true,
                errorMessageAr = null,
                errorMessageEn = null,
            )
        }

        when (val verification = updater.verifyApk(apkFile, expectedSha256)) {
            is ApkVerificationResult.Failed -> {
                runCatching { apkFile.delete() }
                _uiState.update {
                    it.copy(
                        isVerifying = false,
                        isInstalling = false,
                        downloadedApk = null,
                        errorMessageAr = verification.messageAr,
                        errorMessageEn = verification.messageEn,
                    )
                }
                return
            }

            ApkVerificationResult.Valid -> {
                _uiState.update { it.copy(isVerifying = false) }
            }
        }

        if (!updater.canRequestPackageInstalls()) {
            _uiState.update { it.copy(awaitingInstallPermission = true) }
            onRequestInstallPermission(updater.buildManageUnknownSourcesIntent())
            return
        }

        _uiState.update {
            it.copy(
                awaitingInstallPermission = false,
                isInstalling = true,
            )
        }

        updater.installApkWithSession(apkFile).onFailure {
            _uiState.update {
                it.copy(
                    isInstalling = false,
                    errorMessageAr = "تعذر بدء جلسة تثبيت التحديث. يرجى المحاولة مرة أخرى.",
                    errorMessageEn = "Could not start the package installation session. Please try again.",
                )
            }
        }
    }
}
