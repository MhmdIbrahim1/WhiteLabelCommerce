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
)

data class AvailableUpdate(
    val tagName: String,
    val versionName: String,
    val releaseNotes: String,
    val downloadUrl: String,
    val assetName: String,
    val fileSizeBytes: Long,
)

/**
 * Compares a GitHub Release tag (e.g. `v1.0.14`, `1.0.14`, `v2.1.0`, or `v25`) against
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
    ): Boolean {
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
            // Same semantic version tuple -> only treat as newer if an explicit "+code" build metadata is higher
            val remoteBuildCode = remoteTag.substringAfter('+', "")
                .takeWhile { it.isDigit() }
                .toIntOrNull()
            return remoteBuildCode != null && remoteBuildCode > currentVersionCode
        }

        // Fallback if currentVersionName has no digits: compare patch/last segment to versionCode
        return remoteParts.last() > currentVersionCode
    }
}
