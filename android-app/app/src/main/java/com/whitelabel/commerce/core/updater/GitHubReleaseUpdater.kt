package com.whitelabel.commerce.core.updater

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.whitelabel.commerce.BuildConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.coroutineContext

@Singleton
class GitHubReleaseUpdater @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .followRedirects(true)
        .followSslRedirects(true)
        .build()

    suspend fun checkForUpdate(
        githubRepo: String = BuildConfig.GITHUB_REPO,
        currentVersionCode: Int = BuildConfig.VERSION_CODE,
        currentVersionName: String = BuildConfig.VERSION_NAME,
    ): AvailableUpdate? = withContext(Dispatchers.IO) {
        if (!BuildConfig.ENABLE_GITHUB_UPDATER) return@withContext null

        val cleanRepo = githubRepo.trim().trim('/')
        if (cleanRepo.isEmpty() ||
            !cleanRepo.contains('/') ||
            cleanRepo.startsWith("OWNER/", ignoreCase = true)
        ) {
            return@withContext null
        }

        val request = Request.Builder()
            .url("https://api.github.com/repos/$cleanRepo/releases/latest")
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", "WhiteLabelCommerce-Android/$currentVersionName")
            .get()
            .build()

        runCatching {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use null
                val body = response.body?.string()?.takeIf { it.isNotBlank() } ?: return@use null
                val release = json.decodeFromString(GitHubReleaseDto.serializer(), body)
                if (release.draft || release.prerelease) return@use null
                if (!ReleaseVersionComparator.isNewerRelease(
                        remoteTag = release.tagName,
                        currentVersionCode = currentVersionCode,
                        currentVersionName = currentVersionName,
                    )
                ) {
                    return@use null
                }

                val apkAsset = selectApkAsset(release.assets) ?: return@use null
                AvailableUpdate(
                    tagName = release.tagName,
                    versionName = ReleaseVersionComparator.normalizeVersionName(release.tagName)
                        .ifEmpty { release.name.orEmpty().ifEmpty { release.tagName } },
                    releaseNotes = release.body?.trim().orEmpty(),
                    downloadUrl = apkAsset.browserDownloadUrl,
                    assetName = apkAsset.name,
                    fileSizeBytes = apkAsset.size,
                )
            }
        }.getOrNull()
    }

    internal fun selectApkAsset(assets: List<GitHubAssetDto>): GitHubAssetDto? {
        val validApks = assets.filter { asset ->
            asset.name.endsWith(".apk", ignoreCase = true) &&
                asset.browserDownloadUrl.startsWith("https://", ignoreCase = true)
        }
        return validApks.firstOrNull { it.name.contains("release", ignoreCase = true) }
            ?: validApks.firstOrNull()
    }

    suspend fun downloadApk(
        update: AvailableUpdate,
        onProgress: (Float) -> Unit,
    ): Result<File> = withContext(Dispatchers.IO) {
        runCatching {
            require(update.downloadUrl.startsWith("https://", ignoreCase = true)) {
                "APK download URL must use HTTPS"
            }

            val updatesDir = File(context.cacheDir, "updates").apply { mkdirs() }
            // Remove stale APK files before downloading the new release
            updatesDir.listFiles()?.forEach { oldFile ->
                runCatching { oldFile.delete() }
            }

            val safeName = update.assetName
                .replace(Regex("[^A-Za-z0-9._-]"), "_")
                .ifBlank { "update-${update.versionName}.apk" }
            val targetFile = File(updatesDir, safeName)
            val partFile = File(updatesDir, "$safeName.part")

            val request = Request.Builder()
                .url(update.downloadUrl)
                .header("Accept", "application/octet-stream")
                .header("User-Agent", "WhiteLabelCommerce-Android/${BuildConfig.VERSION_NAME}")
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    throw IOException("Download failed with HTTP ${response.code}")
                }
                val responseBody = response.body ?: throw IOException("Empty APK response body")
                val totalBytes = responseBody.contentLength().takeIf { it > 0L }
                    ?: update.fileSizeBytes.takeIf { it > 0L }
                    ?: -1L

                onProgress(0f)
                var downloaded = 0L
                val buffer = ByteArray(16 * 1024)

                responseBody.byteStream().use { input ->
                    FileOutputStream(partFile).use { output ->
                        while (true) {
                            coroutineContext.ensureActive()
                            val read = input.read(buffer)
                            if (read == -1) break
                            output.write(buffer, 0, read)
                            downloaded += read
                            if (totalBytes > 0L) {
                                onProgress((downloaded.toFloat() / totalBytes.toFloat()).coerceIn(0f, 1f))
                            }
                        }
                        output.flush()
                    }
                }

                if (!partFile.exists() || partFile.length() <= 0L) {
                    partFile.delete()
                    throw IOException("Downloaded APK is empty")
                }
                if (totalBytes > 0L && partFile.length() < totalBytes) {
                    partFile.delete()
                    throw IOException("Downloaded APK is incomplete (${partFile.length()} / $totalBytes bytes)")
                }
                if (targetFile.exists()) {
                    targetFile.delete()
                }
                if (!partFile.renameTo(targetFile)) {
                    partFile.copyTo(targetFile, overwrite = true)
                    partFile.delete()
                }
                onProgress(1f)
                targetFile
            }
        }
    }

    fun canRequestPackageInstalls(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.packageManager.canRequestPackageInstalls()
        } else {
            true
        }
    }

    fun buildManageUnknownSourcesIntent(): Intent {
        return Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${context.packageName}"),
        )
    }

    fun buildInstallApkIntent(apkFile: File): Intent {
        val apkUri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            apkFile,
        )
        return Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(apkUri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }
}
