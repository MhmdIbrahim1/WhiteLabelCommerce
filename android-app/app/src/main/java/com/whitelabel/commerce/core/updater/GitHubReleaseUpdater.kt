package com.whitelabel.commerce.core.updater

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.whitelabel.commerce.BuildConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.CacheControl
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileInputStream
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

    private val client by lazy {
        OkHttpClient.Builder()
            .cache(null)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(false)
            .addNetworkInterceptor { chain ->
                val url = chain.request().url
                val allowed = setOf("github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com")
                if (!url.isHttps || (url.host !in allowed && !(url.host == "api.github.com" && url.encodedPath.startsWith("/repos/")))) {
                    throw java.io.IOException("Unexpected GitHub update host")
                }
                chain.proceed(chain.request())
            }
            .build()
    }

    suspend fun checkTenantVersion(): String? = withContext(Dispatchers.IO) {
        runCatching {
            val base = java.net.URL(BuildConfig.WEB_STORE_BASE_URL)
            require(com.whitelabel.commerce.feature.checkout.isAllowedWebStoreBase(base))
            val url = java.net.URL(base, "/api/mobile/update?store_id=" + BuildConfig.STORE_ID +
                "&version_code=" + BuildConfig.VERSION_CODE)
            val connection = url.openConnection() as java.net.HttpURLConnection
            try {
                connection.instanceFollowRedirects = false
                connection.connectTimeout = 5000
                connection.readTimeout = 5000
                if (connection.responseCode != 200) return@runCatching null
                val body = connection.inputStream.bufferedReader().use { it.readText() }
                org.json.JSONObject(body).optJSONObject("update")?.getString("version_name")
            } finally {
                connection.disconnect()
            }
        }.getOrNull()
    }

    private fun updatesDirectory(): File = File(context.cacheDir, "updates")

    /**
     * Deletes leftover downloaded `.apk` / `.part` files from previous update sessions so
     * device cache storage never bloats after updates complete.
     */
    suspend fun cleanupStaleUpdateFiles() = withContext(Dispatchers.IO) {
        val dir = updatesDirectory()
        if (!dir.exists()) return@withContext
        dir.listFiles()?.forEach { file ->
            if (file.isFile && (file.name.endsWith(".apk", ignoreCase = true) || file.name.endsWith(".part", ignoreCase = true))) {
                runCatching { file.delete() }
            }
        }
    }

    suspend fun checkForUpdate(
        githubRepo: String = BuildConfig.GITHUB_REPO,
        currentVersionCode: Int = BuildConfig.VERSION_CODE,
        currentVersionName: String = BuildConfig.VERSION_NAME,
    ): AvailableUpdate? = withContext(Dispatchers.IO) {
        if (!BuildConfig.ENABLE_GITHUB_UPDATER || BuildConfig.IS_WHITE_LABEL_TENANT) return@withContext null

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
            .header("Cache-Control", "no-cache, no-store")
            .header("Pragma", "no-cache")
            .cacheControl(CacheControl.FORCE_NETWORK)
            .get()
            .build()

        runCatching {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use null
                val body = response.body?.string()?.takeIf { it.isNotBlank() } ?: return@use null
                val release = json.decodeFromString(GitHubReleaseDto.serializer(), body)
                if (release.draft || release.prerelease) return@use null

                val metaAsset = release.assets.firstOrNull {
                    it.name.equals("release-meta.json", ignoreCase = true) &&
                        it.browserDownloadUrl.startsWith("https://", ignoreCase = true)
                }
                val releaseMeta = metaAsset?.let { fetchReleaseMeta(it.browserDownloadUrl, currentVersionName) }
                val apkAsset = selectApkAsset(release.assets, releaseMeta?.apkName) ?: return@use null

                if (!ReleaseVersionComparator.isNewerRelease(
                        remoteTag = release.tagName,
                        currentVersionCode = currentVersionCode,
                        currentVersionName = currentVersionName,
                        remoteVersionCode = releaseMeta?.versionCode,
                    )
                ) {
                    return@use null
                }

                val resolvedVersionName = releaseMeta?.versionName?.takeIf { it.isNotBlank() }
                    ?: ReleaseVersionComparator.normalizeVersionName(release.tagName)
                        .ifEmpty { release.name.orEmpty().ifEmpty { release.tagName } }

                val rawNotes = releaseMeta?.notes?.takeIf { it.isNotBlank() } ?: release.body
                val cleanNotes = ReleaseNotesSanitizer.sanitize(rawNotes)

                val expectedSha256 = ApkVerifier.normalizeSha256(releaseMeta?.sha256)
                    ?: ApkVerifier.normalizeSha256(apkAsset.digest)

                AvailableUpdate(
                    tagName = release.tagName,
                    versionCode = releaseMeta?.versionCode,
                    versionName = resolvedVersionName,
                    releaseNotes = cleanNotes,
                    downloadUrl = apkAsset.browserDownloadUrl,
                    assetName = apkAsset.name,
                    fileSizeBytes = apkAsset.size,
                    expectedSha256 = expectedSha256,
                )
            }
        }.getOrNull()
    }

    private fun fetchReleaseMeta(url: String, currentVersionName: String): ReleaseMetaDto? {
        return runCatching {
            val req = Request.Builder()
                .url(url)
                .header("Accept", "application/json")
                .header("User-Agent", "WhiteLabelCommerce-Android/$currentVersionName")
                .header("Cache-Control", "no-cache, no-store")
                .header("Pragma", "no-cache")
                .cacheControl(CacheControl.FORCE_NETWORK)
                .get()
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@use null
                val text = resp.body?.string()?.takeIf { it.isNotBlank() } ?: return@use null
                parseReleaseMetaJson(text, json)
            }
        }.getOrNull()
    }

    internal fun selectApkAsset(
        assets: List<GitHubAssetDto>,
        preferredApkName: String? = null,
    ): GitHubAssetDto? {
        val validApks = assets.filter { asset ->
            asset.name.endsWith(".apk", ignoreCase = true) &&
                asset.browserDownloadUrl.startsWith("https://", ignoreCase = true)
        }
        val cleanPreferred = preferredApkName?.trim()?.takeIf { it.isNotEmpty() }
        if (cleanPreferred != null) {
            validApks.firstOrNull { it.name.equals(cleanPreferred, ignoreCase = true) }?.let { return it }
        }
        return validApks.firstOrNull { it.name.contains("release", ignoreCase = true) }
            ?: validApks.firstOrNull()
    }

    internal companion object {
        fun parseReleaseMetaJson(
            raw: String?,
            jsonParser: Json = Json {
                ignoreUnknownKeys = true
                isLenient = true
            },
        ): ReleaseMetaDto? {
            val trimmed = raw?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            return runCatching {
                jsonParser.decodeFromString(ReleaseMetaDto.serializer(), trimmed)
            }.getOrNull()
        }
    }

    suspend fun downloadApk(
        update: AvailableUpdate,
        onProgress: (Float) -> Unit,
    ): Result<File> = withContext(Dispatchers.IO) {
        runCatching {
            require(update.downloadUrl.startsWith("https://", ignoreCase = true)) {
                "APK download URL must use HTTPS"
            }

            val updatesDir = updatesDirectory().apply { mkdirs() }
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

    suspend fun verifyApk(apkFile: File, expectedSha256: String?): ApkVerificationResult =
        withContext(Dispatchers.IO) {
            ApkVerifier.verifyDownloadedApk(context, apkFile, expectedSha256)
        }

    /**
     * Installs a verified APK using Android's [PackageInstaller.Session] API instead of
     * legacy `Intent.ACTION_VIEW`. Status & user confirmation callbacks are routed through
     * [PackageInstallStatusReceiver].
     */
    suspend fun installApkWithSession(apkFile: File): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val packageInstaller = context.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
                setAppPackageName(context.packageName)
                setSize(apkFile.length())
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
                }
            }

            val sessionId = packageInstaller.createSession(params)
            var session: PackageInstaller.Session? = null
            try {
                session = packageInstaller.openSession(sessionId)
                FileInputStream(apkFile).use { input ->
                    session.openWrite("base.apk", 0L, apkFile.length()).use { output ->
                        val buffer = ByteArray(32 * 1024)
                        while (true) {
                            coroutineContext.ensureActive()
                            val read = input.read(buffer)
                            if (read == -1) break
                            output.write(buffer, 0, read)
                        }
                        session.fsync(output)
                    }
                }

                val statusIntent = Intent(context, PackageInstallStatusReceiver::class.java).apply {
                    action = PackageInstallStatusReceiver.ACTION_INSTALL_STATUS
                }
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
                val callbackPendingIntent = PendingIntent.getBroadcast(
                    context,
                    sessionId,
                    statusIntent,
                    flags,
                )

                session.commit(callbackPendingIntent.intentSender)
            } catch (t: Throwable) {
                runCatching { session?.abandon() }
                runCatching { packageInstaller.abandonSession(sessionId) }
                throw t
            } finally {
                runCatching { session?.close() }
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
}
