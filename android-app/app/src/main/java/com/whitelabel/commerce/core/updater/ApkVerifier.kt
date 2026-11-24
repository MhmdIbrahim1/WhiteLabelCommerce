package com.whitelabel.commerce.core.updater

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.os.Build
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

sealed interface ApkVerificationResult {
    data object Valid : ApkVerificationResult
    data class Failed(
        val messageAr: String,
        val messageEn: String,
    ) : ApkVerificationResult
}

object ApkVerifier {

    private val HEX_CHARS = "0123456789abcdef".toCharArray()

    fun normalizeSha256(raw: String?): String? {
        val cleaned = raw?.trim()
            ?.removePrefix("sha256:")
            ?.removePrefix("SHA256:")
            ?.replace(":", "")
            ?.lowercase()
            ?.takeIf { it.length == 64 && it.all { ch -> ch in '0'..'9' || ch in 'a'..'f' } }
        return cleaned
    }

    fun computeFileSha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(16 * 1024)
        FileInputStream(file).use { input ->
            while (true) {
                val read = input.read(buffer)
                if (read == -1) break
                digest.update(buffer, 0, read)
            }
        }
        return bytesToHex(digest.digest())
    }

    fun verifyDownloadedApk(
        context: Context,
        apkFile: File,
        expectedSha256: String?,
    ): ApkVerificationResult {
        if (!apkFile.exists() || apkFile.length() <= 0L) {
            return ApkVerificationResult.Failed(
                messageAr = "ملف التحديث غير مكتمل أو تالف. يرجى المحاولة مرة أخرى.",
                messageEn = "The downloaded update file is missing or corrupt. Please try again.",
            )
        }

        // 1. Verify SHA-256 digest when provided by release-meta.json or GitHub asset metadata
        val normalizedExpected = normalizeSha256(expectedSha256)
        if (normalizedExpected != null) {
            val actualHash = runCatching { computeFileSha256(apkFile) }.getOrNull()
            if (actualHash == null || !actualHash.equals(normalizedExpected, ignoreCase = true)) {
                return ApkVerificationResult.Failed(
                    messageAr = "فشل التحقق من سلامة ملف التحديث (SHA-256 غير مطابق). يرجى إعادة التحميل.",
                    messageEn = "Update integrity verification failed (SHA-256 mismatch). Please retry the download.",
                )
            }
        }

        // 2. Verify package name & signing certificate match the currently installed app
        val pm = context.packageManager
        val archiveInfo = readArchivePackageInfo(pm, apkFile.absolutePath)
            ?: return ApkVerificationResult.Failed(
                messageAr = "تعذر قراءة حزمة التحديث (APK غير صالح).",
                messageEn = "Unable to inspect the downloaded update package (invalid APK).",
            )

        if (archiveInfo.packageName != context.packageName) {
            return ApkVerificationResult.Failed(
                messageAr = "حزمة التحديث لا تخص هذا التطبيق.",
                messageEn = "The downloaded APK belongs to a different application package.",
            )
        }

        val installedInfo = readInstalledPackageInfo(pm, context.packageName)
            ?: return ApkVerificationResult.Failed(
                messageAr = "تعذر التحقق من شهادة التطبيق المثبّت حالياً.",
                messageEn = "Unable to inspect the currently installed app's signing certificate.",
            )

        val installedCerts = extractCertFingerprints(installedInfo)
        val archiveCerts = extractCertFingerprints(archiveInfo)

        if (installedCerts.isEmpty() || archiveCerts.isEmpty()) {
            return ApkVerificationResult.Failed(
                messageAr = "تعذر التحقق من التوقيع الرقمي لحزمة التحديث.",
                messageEn = "Could not verify the update package's signing certificate.",
            )
        }

        if (installedCerts.intersect(archiveCerts).isEmpty()) {
            return ApkVerificationResult.Failed(
                messageAr = "شهادة توقيع التحديث لا تطابق النسخة المثبّتة حالياً (مثل نسخة Debug مقابل نسخة Release). يرجى إلغاء تثبيت النسخة الحالية ثم تثبيت الإصدار الرسمي.",
                messageEn = "The update's signing certificate does not match the currently installed build (for example, Debug vs. Release). Please uninstall the current build before installing this release.",
            )
        }

        return ApkVerificationResult.Valid
    }

    @Suppress("DEPRECATION")
    private fun readArchivePackageInfo(pm: PackageManager, apkPath: String): PackageInfo? {
        return runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.getPackageArchiveInfo(
                    apkPath,
                    PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong()),
                )
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pm.getPackageArchiveInfo(apkPath, PackageManager.GET_SIGNING_CERTIFICATES)
            } else {
                pm.getPackageArchiveInfo(apkPath, PackageManager.GET_SIGNATURES)
            }
        }.getOrNull()
    }

    @Suppress("DEPRECATION")
    private fun readInstalledPackageInfo(pm: PackageManager, packageName: String): PackageInfo? {
        return runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.getPackageInfo(
                    packageName,
                    PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong()),
                )
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pm.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES)
            } else {
                pm.getPackageInfo(packageName, PackageManager.GET_SIGNATURES)
            }
        }.getOrNull()
    }

    @Suppress("DEPRECATION")
    private fun extractCertFingerprints(info: PackageInfo): Set<String> {
        val signatures: List<Signature> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val signingInfo = info.signingInfo
            if (signingInfo == null) {
                emptyList()
            } else if (signingInfo.hasMultipleSigners()) {
                signingInfo.apkContentsSigners?.toList().orEmpty()
            } else {
                signingInfo.signingCertificateHistory?.toList().orEmpty()
            }
        } else {
            info.signatures?.toList().orEmpty()
        }

        return signatures.mapNotNull { sig ->
            runCatching {
                val digest = MessageDigest.getInstance("SHA-256").digest(sig.toByteArray())
                bytesToHex(digest)
            }.getOrNull()
        }.toSet()
    }

    internal fun bytesToHex(bytes: ByteArray): String {
        val out = CharArray(bytes.size * 2)
        for (i in bytes.indices) {
            val v = bytes[i].toInt() and 0xFF
            out[i * 2] = HEX_CHARS[v ushr 4]
            out[i * 2 + 1] = HEX_CHARS[v and 0x0F]
        }
        return String(out)
    }
}
