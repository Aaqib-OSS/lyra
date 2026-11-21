package dev.lyra.android.update

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import dev.lyra.android.BuildConfig
import dev.lyra.android.MediaMonitor
import dev.lyra.android.RecordService
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * The in-app updater for builds that come from GitHub Releases (not Play, not F-Droid / IzzyOnDroid).
 *
 * check (WorkManager, at most every 12 h, Wi-Fi by default) -> download with resume -> SHA-256 against the release's checksum
 * -> signing certificate must equal the installed app's -> PackageInstaller session. State is kept in [UpdatePrefs], so every
 * step can resume after the process dies. Nothing here runs unless [disabledReason] is null.
 */
object UpdateManager {
    enum class Outcome { OK, RETRY, FAILED, SKIPPED }

    private const val PERIODIC = "lyra-update-check"
    private const val DOWNLOAD = "lyra-update-download"

    private val lock = Any()

    // ---- availability -------------------------------------------------------------------------------------------

    /** Why the updater is off (shown in Settings), or null when it is on. */
    fun disabledReason(ctx: Context): String? {
        if (BuildConfig.DEBUG) return "Updates are only available in the release app."
        if (!BuildConfig.IN_APP_UPDATER) return "This build is updated through F-Droid."
        val installer = installerOf(ctx)
        if (UpdatePolicy.isStoreManaged(installer)) return "Lyra was installed from an app store, which updates it for you."
        return null
    }

    private fun installerOf(ctx: Context): String? = try {
        if (Build.VERSION.SDK_INT >= 30) ctx.packageManager.getInstallSourceInfo(ctx.packageName).installingPackageName
        else @Suppress("DEPRECATION") ctx.packageManager.getInstallerPackageName(ctx.packageName)
    } catch (_: Exception) {
        null
    }

    private fun installedName(ctx: Context): String? = try {
        ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName
    } catch (_: Exception) {
        null
    }

    private fun updatesDir(ctx: Context) = File(ctx.filesDir, "updates")
    private fun apkFile(ctx: Context, r: ReleaseInfo) = File(updatesDir(ctx), "Lyra-Android-${r.version}.apk")
    private fun partFile(ctx: Context, r: ReleaseInfo) = File(updatesDir(ctx), "Lyra-Android-${r.version}.apk.part")

    // ---- scheduling ---------------------------------------------------------------------------------------------

    /** Idempotent: call on every app start. [replace] re-applies changed settings (channel is read at check time). */
    fun schedule(ctx: Context, replace: Boolean = false) {
        val app = ctx.applicationContext
        val wm = WorkManager.getInstance(app)
        val prefs = UpdatePrefs(app)
        if (disabledReason(app) != null || !prefs.autoCheck) {
            wm.cancelUniqueWork(PERIODIC)
            return
        }
        val net = if (prefs.unmeteredOnly) NetworkType.UNMETERED else NetworkType.CONNECTED
        val req = PeriodicWorkRequestBuilder<UpdateCheckWorker>(12, TimeUnit.HOURS, 2, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(net).setRequiresBatteryNotLow(true).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.MINUTES)
            .build()
        wm.enqueueUniquePeriodicWork(PERIODIC, if (replace) ExistingPeriodicWorkPolicy.UPDATE else ExistingPeriodicWorkPolicy.KEEP, req)
        reconcile(app)
    }

    private fun enqueueDownload(ctx: Context, userInitiated: Boolean) {
        val prefs = UpdatePrefs(ctx)
        // a download the user asked for ignores the Wi-Fi-only setting; background ones respect it
        val net = if (prefs.unmeteredOnly && !userInitiated) NetworkType.UNMETERED else NetworkType.CONNECTED
        val req = OneTimeWorkRequestBuilder<UpdateDownloadWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(net).setRequiresStorageNotLow(true).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(ctx).enqueueUniqueWork(DOWNLOAD, if (userInitiated) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.KEEP, req)
    }

    // ---- checking -----------------------------------------------------------------------------------------------

    /** The periodic job. Returns RETRY on a network error so WorkManager backs off. */
    fun backgroundCheck(ctx: Context): Outcome {
        if (disabledReason(ctx) != null) return Outcome.SKIPPED
        val prefs = UpdatePrefs(ctx)
        if (!prefs.autoCheck) return Outcome.SKIPPED
        reconcile(ctx)
        if (!UpdatePolicy.checkDue(System.currentTimeMillis(), prefs.lastCheckAt, manual = false)) {
            maybeAutoInstall(ctx)
            return Outcome.SKIPPED
        }
        return try {
            check(ctx, manual = false)
            maybeAutoInstall(ctx)
            Outcome.OK
        } catch (_: IOException) {
            Outcome.RETRY
        }
    }

    /** Ask GitHub for the newest release on the chosen channel. Throws IOException when offline. Call off the main thread. */
    @Throws(IOException::class)
    fun check(ctx: Context, manual: Boolean): ReleaseInfo? = synchronized(lock) {
        val prefs = UpdatePrefs(ctx)
        disabledReason(ctx)?.let { throw IOException(it) }
        val now = System.currentTimeMillis()
        if (!UpdatePolicy.checkDue(now, prefs.lastCheckAt, manual)) return@synchronized prefs.release.takeIf { prefs.phase != Phase.IDLE }
        val installed = UpdateVersion.parse(installedName(ctx)) ?: throw IOException("Could not read the installed version.")
        val busy = prefs.phase == Phase.DOWNLOADING || prefs.phase == Phase.VERIFYING || prefs.phase == Phase.INSTALLING
        if (!busy) { prefs.phase = Phase.CHECKING; prefs.error = null }

        val cache = File(ctx.cacheDir, "releases.json")
        var newEtag: String? = prefs.etag
        val body = try {
            AndroidHttp.releases(prefs.etag.takeIf { cache.exists() }, { newEtag = it }) ?: cache.readText()
        } catch (e: IOException) {
            if (!busy) prefs.phase = previousPhase(prefs)
            throw e
        }
        cache.writeText(body)
        prefs.etag = newEtag
        prefs.lastCheckAt = now

        val found = ChannelPolicy.pick(ReleaseParser.parse(body), prefs.channel, installed)
        if (busy) return@synchronized found
        if (found == null) {
            prefs.release = null
            prefs.phase = Phase.IDLE
            cleanup(ctx)
            return@synchronized null
        }
        val current = prefs.release
        if (current == null || current.tag != found.tag) {
            prefs.downloadedBytes = 0
            prefs.verifiedSha = null
            prefs.release = found
            cleanup(ctx)
        } else {
            prefs.release = found // fresh notes / asset urls
        }
        prefs.phase = if (apkFile(ctx, found).exists() && prefs.verifiedSha != null) Phase.READY else Phase.AVAILABLE
        if (prefs.notifiedTag != found.tag && !manual) {
            prefs.notifiedTag = found.tag
            UpdateNotifier.show(ctx, "Lyra ${found.version} is available", "Tap to see what's new.")
        }
        if (!manual && prefs.phase == Phase.AVAILABLE) enqueueDownload(ctx, userInitiated = false)
        found
    }

    private fun previousPhase(p: UpdatePrefs) = if (p.release != null) Phase.AVAILABLE else Phase.IDLE

    // ---- downloading + verification -----------------------------------------------------------------------------

    fun startDownload(ctx: Context) {
        val prefs = UpdatePrefs(ctx)
        if (disabledReason(ctx) != null || prefs.release == null) return
        if (prefs.phase == Phase.AVAILABLE || prefs.phase == Phase.ERROR) {
            prefs.error = null
            prefs.phase = Phase.DOWNLOADING
        }
        enqueueDownload(ctx, userInitiated = true)
    }

    fun fail(ctx: Context, message: String) {
        val prefs = UpdatePrefs(ctx)
        prefs.error = message
        prefs.phase = Phase.ERROR
    }

    /** Runs inside the download worker. */
    fun downloadAndVerify(ctx: Context, isStopped: () -> Boolean): Outcome {
        val prefs = UpdatePrefs(ctx)
        if (disabledReason(ctx) != null) return Outcome.SKIPPED
        val r = prefs.release ?: return Outcome.SKIPPED
        if (prefs.phase == Phase.READY && apkFile(ctx, r).exists()) return Outcome.OK
        val part = partFile(ctx, r)
        val apk = apkFile(ctx, r)
        prefs.error = null
        prefs.phase = Phase.DOWNLOADING
        prefs.verifiedSha = null
        try {
            if (!apk.exists()) {
                val done = ApkDownloader.download(r.apk.url, part, r.apk.size, isStopped) { prefs.downloadedBytes = it }
                if (!done) return Outcome.SKIPPED
                if (!part.renameTo(apk)) throw IOException("Could not save the update.")
            }
        } catch (e: ApkDownloader.HttpStatus) {
            return if (e.code in 500..599 || e.code == 429) Outcome.RETRY else permanent(ctx, "The download failed (${e.message}).")
        } catch (_: IOException) {
            return Outcome.RETRY // resumes from the bytes already on disk
        }

        prefs.phase = Phase.VERIFYING
        val expected = try {
            expectedSha(r)
        } catch (_: IOException) {
            return Outcome.RETRY
        } ?: run { apk.delete(); return permanent(ctx, "This release has no SHA-256 checksum, so Lyra will not install it.") }
        val actual = Checksum.sha256(apk)
        if (!Checksum.matches(expected, actual)) {
            apk.delete(); part.delete(); prefs.downloadedBytes = 0
            return permanent(ctx, "The download did not match its checksum and was deleted.")
        }
        when (val v = ApkVerifier.verify(ctx, apk)) {
            is ApkVerifier.Result.Fail -> { apk.delete(); return permanent(ctx, v.reason) }
            is ApkVerifier.Result.Ok -> Unit
        }
        prefs.verifiedSha = actual
        prefs.phase = Phase.READY
        UpdateNotifier.show(ctx, "Lyra ${r.version} is ready", "Open Lyra settings to install it.")
        maybeAutoInstall(ctx)
        return Outcome.OK
    }

    private fun permanent(ctx: Context, msg: String): Outcome { fail(ctx, msg); return Outcome.FAILED }

    /** Hash from the release's checksum asset, else GitHub's own asset digest; null if the release offers neither. */
    private fun expectedSha(r: ReleaseInfo): String? {
        r.checksum?.let { c ->
            val text = ApkDownloader.getText(c.url, maxBytes = 100_000)
            Checksum.parseExpected(text.orEmpty(), r.apk.name)?.let { return it }
        }
        return Checksum.fromDigest(r.apk.digest)
    }

    // ---- installing ---------------------------------------------------------------------------------------------

    /** "null" (nothing playing / no notification access) fails to parse and counts as not playing. */
    private fun playing(ctx: Context): Boolean =
        runCatching { JSONObject(MediaMonitor.snapshotJson(ctx)).optBoolean("isPlaying") }.getOrDefault(false)

    private fun maybeAutoInstall(ctx: Context) {
        val prefs = UpdatePrefs(ctx)
        if (!prefs.autoInstall || prefs.phase != Phase.READY) return
        if (Build.VERSION.SDK_INT < 31) return // before Android 12 every install asks, so never from the background
        install(ctx, userInitiated = false)
    }

    /** Returns {status: started | deferred | needsPermission | error, message?}. Call off the main thread. */
    fun install(ctx: Context, userInitiated: Boolean): JSONObject = synchronized(lock) {
        fun res(status: String, msg: String? = null) = JSONObject().put("status", status).put("message", msg ?: JSONObject.NULL)
        val prefs = UpdatePrefs(ctx)
        val r = prefs.release
        if (disabledReason(ctx) != null || r == null || prefs.phase != Phase.READY) return@synchronized res("error", "There is no update ready to install.")
        if (!UpdatePolicy.mayInstallNow(playing(ctx),RecordService.isActive(), userInitiated)) {
            return@synchronized res("deferred", "Lyra will install the update when nothing is playing or recording.")
        }
        if (!ctx.packageManager.canRequestPackageInstalls()) {
            if (userInitiated) {
                ctx.startActivity(
                    Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            }
            return@synchronized res("needsPermission", "Allow Lyra to install apps, then tap Install again.")
        }
        // the file sat on disk since it was verified: check it again right before handing it to Android
        val apk = apkFile(ctx, r)
        if (!apk.exists() || prefs.verifiedSha == null || !Checksum.matches(prefs.verifiedSha!!, Checksum.sha256(apk))) {
            apk.delete()
            fail(ctx, "The downloaded file changed after it was checked, so it was removed. Download it again.")
            return@synchronized res("error", prefs.error)
        }
        if (ApkVerifier.verify(ctx, apk) is ApkVerifier.Result.Fail) {
            apk.delete()
            fail(ctx, "The downloaded file failed the signature check and was removed.")
            return@synchronized res("error", prefs.error)
        }
        try {
            val pi = ctx.packageManager.packageInstaller
            pi.mySessions.forEach { runCatching { pi.abandonSession(it.sessionId) } }
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setAppPackageName(ctx.packageName)
            params.setSize(apk.length())
            // Android 12+: an update by the app's own installer may go through without a prompt (not guaranteed)
            if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            val id = pi.createSession(params)
            pi.openSession(id).use { s ->
                apk.inputStream().use { input -> s.openWrite("lyra-update.apk", 0, apk.length()).use { out -> input.copyTo(out); s.fsync(out) } }
                val cb = Intent(ctx, UpdateInstallReceiver::class.java).setPackage(ctx.packageName).putExtra(UpdateInstallReceiver.EXTRA_USER, userInitiated)
                // must be mutable: Android adds the status extras to this intent
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
                prefs.phase = Phase.INSTALLING
                s.commit(PendingIntent.getBroadcast(ctx, id, cb, flags).intentSender)
            }
            res("started")
        } catch (e: Exception) {
            prefs.phase = Phase.READY
            res("error", e.message ?: "Could not start the install.")
        }
    }

    // ---- housekeeping -------------------------------------------------------------------------------------------

    /** Delete downloads that are no longer needed (older versions, finished installs, failed downloads). */
    fun cleanup(ctx: Context) {
        val prefs = UpdatePrefs(ctx)
        val keep = prefs.release?.takeIf { prefs.phase in setOf(Phase.AVAILABLE, Phase.DOWNLOADING, Phase.VERIFYING, Phase.READY, Phase.INSTALLING, Phase.ERROR) }
        val names = keep?.let { setOf(apkFile(ctx, it).name, partFile(ctx, it).name) }.orEmpty()
        updatesDir(ctx).listFiles()?.forEach { if (it.name !in names) it.delete() }
    }

    /** After a restart: an installed update ends the cycle; an INSTALLING phase with no live session was interrupted. */
    fun reconcile(ctx: Context) {
        val prefs = UpdatePrefs(ctx)
        val r = prefs.release
        val installed = UpdateVersion.parse(installedName(ctx))
        if (r != null && installed != null && r.version <= installed) {
            prefs.release = null
            prefs.phase = Phase.IDLE
            prefs.error = null
            prefs.verifiedSha = null
            UpdateNotifier.cancel(ctx)
        } else if (prefs.phase == Phase.INSTALLING && ctx.packageManager.packageInstaller.mySessions.isEmpty()) {
            prefs.phase = Phase.READY
        }
        cleanup(ctx)
    }

    // ---- status for the UI --------------------------------------------------------------------------------------

    fun status(ctx: Context): JSONObject {
        val prefs = UpdatePrefs(ctx)
        val reason = disabledReason(ctx)
        if (reason == null) reconcile(ctx)
        val r = prefs.release
        val o = JSONObject()
            .put("enabled", reason == null)
            .put("disabledReason", reason ?: JSONObject.NULL)
            .put("phase", prefs.phase.name.lowercase())
            .put("installedVersion", installedName(ctx) ?: "")
            .put("channel", prefs.channel.key)
            .put("unmeteredOnly", prefs.unmeteredOnly)
            .put("autoCheck", prefs.autoCheck)
            .put("autoInstall", prefs.autoInstall)
            .put("lastCheckedAt", prefs.lastCheckAt)
            .put("downloadedBytes", prefs.downloadedBytes)
            .put("error", prefs.error ?: JSONObject.NULL)
            .put("canInstallApps", ctx.packageManager.canRequestPackageInstalls())
        o.put(
            "update",
            if (r == null || prefs.phase == Phase.IDLE) JSONObject.NULL
            else JSONObject().put("version", r.version.toString()).put("tag", r.tag).put("prerelease", r.prerelease).put("notes", r.notes).put("sizeBytes", r.apk.size)
        )
        return o
    }
}

/** The GitHub release-list request, kept apart so [UpdateManager] reads as the flow. */
internal object AndroidHttp {
    fun releases(etag: String?, onEtag: (String?) -> Unit): String? =
        ApkDownloader.getText("https://api.github.com/repos/DhruvHarani1/lyra/releases?per_page=30", "application/vnd.github+json", etag, onEtag = onEtag)
}
