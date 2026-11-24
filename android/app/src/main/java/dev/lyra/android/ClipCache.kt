package dev.lyra.android

import android.content.Context
import android.net.ConnectivityManager
import android.webkit.WebResourceResponse
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Apple's preview clips (about 20 MB HD) with a disk cache, like the Windows ClipStore:
 *  - ONE download per clip into a growing `.part` file; the player is served from that file while it grows, so the clip
 *    starts after the first few hundred KB and two video elements (the loop crossfade) share the one download;
 *  - a dropped or stalled connection resumes with `Range: bytes=<received>-` (4 tries, backoff); 429/503 honour Retry-After;
 *    404/403/too big are not retried;
 *  - a finished clip is renamed into place; later plays and loops come straight from disk;
 *  - the folder lives in cacheDir (Android may reclaim it) and is capped by file count and total size.
 * Only Apple's preview hosts are ever fetched.
 */
object ClipCache {
    private const val MAX_CLIP = 64L * 1024 * 1024
    private const val MAX_FILES = 60
    private const val MAX_TOTAL = 300L * 1024 * 1024
    private const val STALL_MS = 15_000
    private const val ATTEMPTS = 4
    private val HOST = Regex("^https://[a-z0-9-]+\\.itunes\\.apple\\.com/", RegexOption.IGNORE_CASE)
    private val pool = Executors.newFixedThreadPool(2) { r -> Thread(r, "lyra-clip").apply { isDaemon = true } }

    private class Entry(val url: String, val file: File, val part: File) {
        @Volatile var total = -1L
        @Volatile var received = 0L
        @Volatile var done = false
        @Volatile var failed: String? = null
        val lock = Object()
    }

    private val entries = ConcurrentHashMap<String, Entry>()

    fun allowed(target: String) = HOST.containsMatchIn(target)

    private fun dir(ctx: Context): File = File(ctx.cacheDir, "clips").apply { mkdirs() }

    private fun nameOf(url: String): String =
        MessageDigest.getInstance("SHA-256").digest(url.toByteArray()).take(12).joinToString("") { "%02x".format(it) } + ".mp4"

    /** Metered network with the system Data Saver on: do not download clips nobody asked for yet. */
    private fun dataSaverOn(ctx: Context): Boolean = try {
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        cm.isActiveNetworkMetered && cm.restrictBackgroundStatus == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED
    } catch (e: Exception) {
        false
    }

    /** Start saving a clip in the background (the next song's clip). Skipped under Data Saver on a metered network. */
    fun warm(ctx: Context, target: String) {
        if (!allowed(target) || dataSaverOn(ctx)) return
        ensure(ctx, target)
    }

    private fun ensure(ctx: Context, target: String): Entry? {
        val file = File(dir(ctx), nameOf(target))
        if (file.exists()) return null
        synchronized(entries) {
            val old = entries[target]
            if (old != null && old.failed == null) return old
            val e = Entry(target, file, File(file.path + ".part"))
            entries[target] = e
            pool.execute { download(e, ctx.applicationContext) }
            return e
        }
    }

    private fun download(e: Entry, ctx: Context) {
        try {
            e.part.delete()
            RandomAccessFile(e.part, "rw").use { out ->
                var attempt = 0
                var wait = 700L
                while (!e.done) {
                    var c: HttpURLConnection? = null
                    try {
                        c = URL(e.url).openConnection() as HttpURLConnection
                        c.connectTimeout = 12_000
                        c.readTimeout = STALL_MS
                        c.instanceFollowRedirects = false // a redirect could leave Apple's hosts
                        if (e.received > 0) c.setRequestProperty("Range", "bytes=${e.received}-")
                        val code = c.responseCode
                        if (code == 404 || code == 403 || code == 410) throw Permanent("Apple answered $code")
                        if (code == 429 || code == 503) {
                            val ra = c.getHeaderField("Retry-After")?.toLongOrNull() ?: 0L
                            throw IOException("busy $code").also { wait = maxOf(wait, minOf(ra, 10L) * 1000) }
                        }
                        if (code != 200 && code != 206) throw IOException("Apple answered $code")
                        if (code == 200 && e.received > 0) { // the server ignored Range: start over
                            out.setLength(0)
                            e.received = 0
                        }
                        val len = c.getHeaderField("Content-Length")?.toLongOrNull() ?: -1L
                        val cr = c.getHeaderField("Content-Range")?.substringAfter('/')?.toLongOrNull()
                        val total = cr ?: if (code == 200 && len > 0) len else -1L
                        if (total > MAX_CLIP) throw Permanent("clip too big")
                        if (total > 0) synchronized(e.lock) { e.total = total; e.lock.notifyAll() }
                        out.seek(e.received)
                        val buf = ByteArray(32 * 1024)
                        c.inputStream.use { input ->
                            while (true) {
                                val n = input.read(buf)
                                if (n < 0) break
                                out.write(buf, 0, n)
                                synchronized(e.lock) { e.received += n; e.lock.notifyAll() }
                                if (e.received > MAX_CLIP) throw Permanent("clip too big")
                            }
                        }
                        if (e.total > 0 && e.received < e.total) throw IOException("connection closed early")
                        synchronized(e.lock) { if (e.total <= 0) e.total = e.received }
                        out.fd.sync()
                        e.part.renameTo(e.file)
                        synchronized(e.lock) { e.done = true; e.lock.notifyAll() }
                    } catch (x: Permanent) {
                        throw x
                    } catch (x: Exception) {
                        if (++attempt > ATTEMPTS) throw x
                        Thread.sleep(wait)
                        wait = minOf(wait * 2, 8_000)
                    } finally {
                        c?.disconnect()
                    }
                }
            }
            tidy(ctx)
        } catch (x: Exception) {
            synchronized(e.lock) { e.failed = x.message ?: "download failed"; e.lock.notifyAll() }
            e.part.delete()
        } finally {
            if (e.failed == null) entries.remove(e.url, e)
        }
    }

    private class Permanent(m: String) : IOException(m)

    /** Play a clip: from disk when saved, else from the growing file. Null = could not be saved, stream it straight instead. */
    fun open(ctx: Context, target: String, rangeHeader: String?): WebResourceResponse? {
        val range = rangeHeader?.let { Regex("bytes=(\\d*)-(\\d*)").find(it) }
        val saved = File(dir(ctx), nameOf(target))
        if (saved.exists()) {
            saved.setLastModified(System.currentTimeMillis()) // recently played clips are the last to be removed
            return respond(saved, null, saved.length(), range)
        }
        val e = ensure(ctx, target) ?: return respond(saved, null, saved.length(), range)
        // wait (briefly) for the size so Content-Range is right; the first bytes follow within a moment
        val until = System.currentTimeMillis() + 15_000
        synchronized(e.lock) {
            while (e.total <= 0 && e.failed == null && !e.done && System.currentTimeMillis() < until) e.lock.wait(500)
        }
        if (e.failed != null || e.total <= 0) return null
        return respond(if (e.done) e.file else e.part, e, e.total, range)
    }

    private fun respond(file: File, e: Entry?, total: Long, range: MatchResult?): WebResourceResponse? {
        if (total <= 0) return null
        val start = range?.groupValues?.get(1)?.toLongOrNull() ?: 0L
        val end = range?.groupValues?.get(2)?.toLongOrNull()?.coerceAtMost(total - 1) ?: (total - 1)
        if (start > end || start >= total) return WebResourceResponse("text/plain", "utf-8", 416, "Range Not Satisfiable", mapOf("Content-Range" to "bytes */$total", "Access-Control-Allow-Origin" to Rpc.ASSET_ORIGIN), "".byteInputStream())
        val partial = range != null
        val raf = try {
            RandomAccessFile(file, "r")
        } catch (x: Exception) {
            // the download finished and was renamed between the check and the open
            RandomAccessFile(e?.file ?: file, "r")
        }
        raf.seek(start)
        val stream = object : InputStream() {
            var pos = start
            override fun read(): Int {
                val one = ByteArray(1)
                return if (read(one, 0, 1) < 0) -1 else one[0].toInt() and 0xff
            }

            override fun read(b: ByteArray, off: Int, n: Int): Int {
                if (pos > end) return -1
                if (e != null && !e.done) {
                    val stallUntil = System.currentTimeMillis() + 20_000
                    synchronized(e.lock) {
                        while (e.received <= pos && !e.done && e.failed == null) {
                            if (System.currentTimeMillis() > stallUntil) throw IOException("clip stalled")
                            e.lock.wait(500)
                        }
                        if (e.received <= pos && e.failed != null) throw IOException(e.failed)
                    }
                }
                val avail = if (e != null && !e.done) minOf(e.received, end + 1) else end + 1
                val want = minOf(n.toLong(), avail - pos).toInt()
                if (want <= 0) return -1
                val r = raf.read(b, off, want)
                if (r > 0) pos += r
                return r
            }

            override fun close() = raf.close()
        }
        val headers = mutableMapOf("Accept-Ranges" to "bytes", "Content-Length" to (end - start + 1).toString(), "Access-Control-Allow-Origin" to Rpc.ASSET_ORIGIN)
        if (partial) headers["Content-Range"] = "bytes $start-$end/$total"
        return WebResourceResponse("video/mp4", null, if (partial) 206 else 200, if (partial) "Partial Content" else "OK", headers, stream)
    }

    /** Remove unfinished leftovers, then keep the folder inside its file-count and size limits (oldest first). */
    fun tidy(ctx: Context) {
        try {
            val now = System.currentTimeMillis()
            val all = dir(ctx).listFiles() ?: return
            for (f in all) {
                if (f.name.endsWith(".part") && now - f.lastModified() > 10 * 60_000 && entries.values.none { it.part == f }) f.delete()
            }
            var total = 0L
            all.filter { it.name.endsWith(".mp4") && it.exists() }.sortedByDescending { it.lastModified() }.forEachIndexed { i, f ->
                total += f.length()
                if (i >= MAX_FILES || total > MAX_TOTAL) f.delete()
            }
        } catch (x: Exception) {
            // housekeeping is best effort
        }
    }

    /** Saved clips: how many and how many bytes (for Settings). */
    fun info(ctx: Context): Pair<Int, Long> {
        val f = dir(ctx).listFiles { x -> x.name.endsWith(".mp4") } ?: return 0 to 0L
        return f.size to f.sumOf { it.length() }
    }

    fun clear(ctx: Context) {
        dir(ctx).listFiles()?.forEach { f -> if (entries.values.none { it.part == f }) f.delete() }
    }
}
