package com.whitelabel.commerce.core.updater

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
internal data class GitHubReleaseDto(
    @SerialName("tag_name") val tagName: String = "",
    @SerialName("name") val name: String? = null,
    @SerialName("body") val body: String? = null,
    @SerialName("draft") val draft: Boolean = false,
    @SerialName("prerelease") val prerelease: Boolean = false,
    @SerialName("assets") val assets: List<GitHubAssetDto> = emptyList(),
)

@Serializable
internal data class GitHubAssetDto(
    @SerialName("name") val name: String = "",
    @SerialName("browser_download_url") val browserDownloadUrl: String = "",
    @SerialName("size") val size: Long = 0L,
    @SerialName("content_type") val contentType: String? = null,
    @SerialName("digest") val digest: String? = null,
)

@Serializable
internal data class ReleaseMetaDto(
    @SerialName("versionCode") val versionCode: Int? = null,
    @SerialName("versionName") val versionName: String? = null,
    @SerialName("apkName") val apkName: String? = null,
    @SerialName("sha256") val sha256: String? = null,
    @SerialName("notes") val notes: String? = null,
)

data class AvailableUpdate(
    val tagName: String,
    val versionCode: Int?,
    val versionName: String,
    val releaseNotes: String,
    val downloadUrl: String,
    val assetName: String,
    val fileSizeBytes: Long,
    val expectedSha256: String? = null,
)

/**
 * Strips raw Markdown syntax (`**`, `#`, links, inline code, HTML tags) from GitHub Release notes
 * so Arabic RTL and English LTR text render cleanly in Material 3 dialogs.
 */
object ReleaseNotesSanitizer {
    private val MARKDOWN_LINK_REGEX = Regex("\\[([^\\]]+)]\\((https?://[^)]+)\\)")
    private val BARE_URL_REGEX = Regex("https?://\\S+")
    private val HEADING_PREFIX_REGEX = Regex("^#{1,6}\\s*")
    private val BULLET_PREFIX_REGEX = Regex("^[*+-]\\s+")
    private val EMPHASIS_REGEX = Regex("(\\*\\*|__|~~|`|\\*)")
    private val HTML_TAG_REGEX = Regex("<[^>]+>")
    private val MULTI_SPACE_REGEX = Regex("[ \\t]{2,}")

    fun sanitize(raw: String?): String {
        if (raw.isNullOrBlank()) return ""
        val lines = raw
            .replace("\r\n", "\n")
            .replace("\r", "\n")
            .split('\n')
            .mapNotNull { originalLine ->
                var line = originalLine.trim()
                if (line.isEmpty()) return@mapNotNull null
                // Drop GitHub's auto-generated "Full Changelog: https://..." footer noise
                if (line.contains("Full Changelog", ignoreCase = true) && line.contains("http", ignoreCase = true)) {
                    return@mapNotNull null
                }
                line = MARKDOWN_LINK_REGEX.replace(line, "$1")
                line = HTML_TAG_REGEX.replace(line, "")
                line = HEADING_PREFIX_REGEX.replace(line, "")
                line = if (BULLET_PREFIX_REGEX.containsMatchIn(line)) {
                    "• " + BULLET_PREFIX_REGEX.replaceFirst(line, "")
                } else {
                    line
                }
                line = EMPHASIS_REGEX.replace(line, "")
                line = BARE_URL_REGEX.replace(line, "")
                line = MULTI_SPACE_REGEX.replace(line, " ").trim()
                line.takeIf { it.isNotBlank() && it != "•" }
            }
        return lines.joinToString("\n").trim()
    }
}

/**
 * Compares a GitHub Release tag (and optional `release-meta.json` `versionCode`) against
 * the currently installed app's `versionCode` and `versionName`.
 */
object ReleaseVersionComparator {

    private val NUMERIC_PARTS_REGEX = Regex("\\d+")

    fun normalizeVersionName(rawTag: String): String {
        return rawTag.trim().removePrefix("v").removePrefix("V").trim()
    }

    internal fun parseTuple(raw: String): List<Int> {
        val core = normalizeVersionName(raw)
            .substringBefore('-')
            .substringBefore('+')
        return NUMERIC_PARTS_REGEX.findAll(core)
            .mapNotNull { it.value.toIntOrNull() }
            .toList()
    }

    fun isNewerRelease(
        remoteTag: String,
        currentVersionCode: Int,
        currentVersionName: String,
        remoteVersionCode: Int? = null,
    ): Boolean {
        if (remoteVersionCode != null && remoteVersionCode > 0) {
            return remoteVersionCode > currentVersionCode
        }

        val remoteParts = parseTuple(remoteTag)
        if (remoteParts.isEmpty()) return false

        // Single-number tags (e.g. "v15") compare directly against versionCode
        if (remoteParts.size == 1) {
            return remoteParts[0] > currentVersionCode
        }

        val currentParts = parseTuple(currentVersionName)
        if (currentParts.isNotEmpty()) {
            val maxLen = maxOf(remoteParts.size, currentParts.size)
            for (i in 0 until maxLen) {
                val remoteVal = remoteParts.getOrElse(i) { 0 }
                val currentVal = currentParts.getOrElse(i) { 0 }
                if (remoteVal != currentVal) {
                    return remoteVal > currentVal
                }
            }
            val remoteBuildCode = remoteTag.substringAfter('+', "")
                .takeWhile { it.isDigit() }
                .toIntOrNull()
            return remoteBuildCode != null && remoteBuildCode > currentVersionCode
        }

        return remoteParts.last() > currentVersionCode
    }
}
