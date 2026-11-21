package dev.lyra.android.update

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

/** Periodic, battery-friendly release check (WorkManager keeps it alive across process death and reboots). */
class UpdateCheckWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    override fun doWork(): Result = when (UpdateManager.backgroundCheck(applicationContext)) {
        UpdateManager.Outcome.RETRY -> if (runAttemptCount < 3) Result.retry() else Result.success()
        else -> Result.success()
    }
}

/** Downloads the APK with resume. A dropped connection is retried with exponential backoff and continues where it stopped. */
class UpdateDownloadWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    override fun doWork(): Result = when (UpdateManager.downloadAndVerify(applicationContext, { isStopped })) {
        UpdateManager.Outcome.RETRY -> if (runAttemptCount < 6) Result.retry() else {
            UpdateManager.fail(applicationContext, "The download kept failing. Try again later.")
            Result.failure()
        }
        UpdateManager.Outcome.FAILED -> Result.failure()
        else -> Result.success()
    }
}
