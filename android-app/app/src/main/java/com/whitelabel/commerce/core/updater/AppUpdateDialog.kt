package com.whitelabel.commerce.core.updater

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.SystemUpdate
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.designsystem.LocalBrandColors
import com.whitelabel.commerce.core.designsystem.LocalStoreSettings
import com.whitelabel.commerce.core.designsystem.localized
import java.util.Locale
import kotlin.math.roundToInt

@Composable
fun AppUpdateDialog(
    state: AppUpdateUiState,
    onUpdateNow: () -> Unit,
    onDismiss: () -> Unit,
) {
    val update = state.availableUpdate ?: return
    if (state.isDismissed) return

    val storeSettings = LocalStoreSettings.current
    val brandColors = LocalBrandColors.current
    val layoutDirection = if (storeSettings.isRtl) LayoutDirection.Rtl else LayoutDirection.Ltr
    val hasDownloadedApk = state.downloadedApk != null && state.downloadedApk.exists()

    AlertDialog(
        onDismissRequest = {
            if (!state.isDownloading) {
                onDismiss()
            }
        },
        properties = DialogProperties(
            dismissOnBackPress = !state.isDownloading,
            dismissOnClickOutside = !state.isDownloading,
        ),
        icon = {
            Icon(
                imageVector = Icons.Rounded.SystemUpdate,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(32.dp),
            )
        },
        title = {
            CompositionLocalProvider(LocalLayoutDirection provides layoutDirection) {
                Text(
                    text = localized("تحديث جديد متاح", "New Update Available"),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        text = {
            CompositionLocalProvider(LocalLayoutDirection provides layoutDirection) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Surface(
                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.55f),
                            shape = MaterialTheme.shapes.small,
                        ) {
                            Text(
                                text = localized(
                                    "الإصدار ${update.versionName}",
                                    "Version ${update.versionName}",
                                ),
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                            )
                        }
                        if (update.fileSizeBytes > 0L) {
                            val sizeMb = String.format(
                                Locale.US,
                                "%.1f MB",
                                update.fileSizeBytes / (1024.0 * 1024.0),
                            )
                            Text(
                                text = sizeMb,
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }

                    Text(
                        text = localized(
                            "الإصدار الحالي: ${BuildConfig.VERSION_NAME}",
                            "Current version: ${BuildConfig.VERSION_NAME}",
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    Surface(
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                        shape = MaterialTheme.shapes.small,
                        border = BorderStroke(1.dp, brandColors.hairline),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = 170.dp)
                                .verticalScroll(rememberScrollState())
                                .padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Text(
                                text = localized("ما الجديد في هذا التحديث:", "What's new in this release:"),
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            Text(
                                text = update.releaseNotes.ifBlank {
                                    localized(
                                        "تحسينات في الأداء والاستقرار وتجربة التسوق.",
                                        "Performance improvements, bug fixes, and a smoother shopping experience.",
                                    )
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }

                    if (state.isDownloading) {
                        val percent = (state.downloadProgress * 100f).roundToInt().coerceIn(0, 100)
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(
                                    text = localized("جاري تحميل التحديث...", "Downloading update…"),
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Text(
                                    text = "$percent%",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.primary,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                            LinearProgressIndicator(
                                progress = { state.downloadProgress.coerceIn(0f, 1f) },
                                modifier = Modifier.fillMaxWidth(),
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }

                    if (state.awaitingInstallPermission) {
                        Text(
                            text = localized(
                                "يرجى تفعيل إذن تثبيت التطبيقات من هذا المصدر في الإعدادات ثم العودة لإكمال التثبيت تلقائياً.",
                                "Please allow installing apps from this source in Settings, then return to continue installation automatically.",
                            ),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }

                    if (state.downloadFailed) {
                        Text(
                            text = localized(
                                "تعذر تحميل ملف التحديث. تحقق من اتصالك بالإنترنت وحاول مجدداً.",
                                "Could not download the update package. Please check your connection and try again.",
                            ),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }
        },
        confirmButton = {
            CompositionLocalProvider(LocalLayoutDirection provides layoutDirection) {
                Button(
                    onClick = onUpdateNow,
                    enabled = !state.isDownloading,
                ) {
                    Text(
                        text = when {
                            state.isDownloading -> localized("جاري التحميل...", "Downloading…")
                            hasDownloadedApk -> localized("تثبيت الآن", "Install Now")
                            else -> localized("تحديث الآن", "Update Now")
                        },
                    )
                }
            }
        },
        dismissButton = {
            CompositionLocalProvider(LocalLayoutDirection provides layoutDirection) {
                TextButton(onClick = onDismiss) {
                    Text(
                        text = if (state.isDownloading) {
                            localized("إلغاء", "Cancel")
                        } else {
                            localized("لاحقاً", "Later")
                        },
                    )
                }
            }
        },
    )
}
