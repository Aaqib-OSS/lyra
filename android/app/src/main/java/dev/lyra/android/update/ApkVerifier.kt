package dev.lyra.android.update

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.pm.PackageInfoCompat
import java.io.File
import java.security.MessageDigest

/** Checks that a downloaded APK really is a newer build of this app signed by the same key. */
object ApkVerifier {
    sealed class Result {
        data class Ok(val versionCode: Long, val versionName: String) : Result()
        data class Fail(val reason: String) : Result()
    }

    @Suppress("DEPRECATION")
    private val FLAGS = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES

    fun verify(ctx: Context, file: File): Result {
        val pm = ctx.packageManager
        val candidate = try {
            pm.getPackageArchiveInfo(file.absolutePath, FLAGS)
        } catch (_: Exception) {
            null
        } ?: return Result.Fail("The downloaded file is not a valid APK.")
        if (candidate.packageName != ctx.packageName) return Result.Fail("The downloaded APK is for a different app.")
        val installed = try {
            pm.getPackageInfo(ctx.packageName, FLAGS)
        } catch (_: Exception) {
            return Result.Fail("Could not read the installed app.")
        }
        if (!UpdatePolicy.sameSigners(signers(installed), signers(candidate))) {
            return Result.Fail("The update is not signed with the same key as the installed app, so it was not installed.")
        }
        val code = PackageInfoCompat.getLongVersionCode(candidate)
        if (!ChannelPolicy.isUpgrade(PackageInfoCompat.getLongVersionCode(installed), code)) {
            return Result.Fail("The downloaded APK is not newer than the installed version.")
        }
        return Result.Ok(code, candidate.versionName ?: "")
    }

    /** SHA-256 fingerprints of the signing certificates in [info]. */
    @Suppress("DEPRECATION")
    private fun signers(info: PackageInfo): Set<String> {
        val sigs = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
        return sigs.orEmpty().map { Checksum.hex(MessageDigest.getInstance("SHA-256").digest(it.toByteArray())) }.toSet()
    }
}
