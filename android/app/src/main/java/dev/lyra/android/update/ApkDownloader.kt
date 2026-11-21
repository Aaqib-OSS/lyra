package dev.lyra.android.update

import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL

/** Plain HTTPS access to GitHub, with a resumable file download (HTTP Range) that survives drops and process death. */
object ApkDownloader {
    private const val UA = "Lyra-Android-Updater"
    private const val TIMEOUT_MS = 20_000

    class HttpStatus(val code: Int) : IOException("HTTP $code")

    private fun open(url: String): HttpURLConnection {
        require(url.startsWith("https://")) { "refusing a non-HTTPS update URL" }
        return (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = TIMEOUT_MS
            readTimeout = TIMEOUT_MS
            setRequestProperty("User-Agent", UA)
        }
    }

    /** GET a small text resource (release list, checksum file). [etag] makes it conditional; null result = 304 not modified. */
    fun getText(url: String, accept: String? = null, etag: String? = null, maxBytes: Int = 2_000_000, onEtag: (String?) -> Unit = {}): String? {
        val c = open(url)
        try {
            accept?.let { c.setRequestProperty("Accept", it) }
            etag?.let { c.setRequestProperty("If-None-Match", it) }
            val code = c.responseCode
            if (code == 304) return null
            if (code != 200) throw HttpStatus(code)
            onEtag(c.getHeaderField("ETag"))
            val out = java.io.ByteArrayOutputStream()
            c.inputStream.use { input ->
                val buf = ByteArray(8192)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    out.write(buf, 0, n)
                    if (out.size() > maxBytes) throw IOException("response too large")
                }
            }
            return out.toString("UTF-8")
        } finally {
            c.disconnect()
        }
    }

    /**
     * Download [url] into [part], continuing from whatever [part] already holds. Returns when the file holds [expectedSize]
     * bytes (when known) or the server ended the stream. Throws [IOException] on network trouble (the caller retries and
     * resumes); returns false if [isStopped] asked to stop.
     */
    fun download(url: String, part: File, expectedSize: Long, isStopped: () -> Boolean, onProgress: (Long) -> Unit): Boolean {
        part.parentFile?.mkdirs()
        var have = if (part.exists()) part.length() else 0L
        if (expectedSize > 0 && have > expectedSize) { part.delete(); have = 0 }
        if (expectedSize > 0 && have == expectedSize) return true

        val c = open(url)
        try {
            if (have > 0) c.setRequestProperty("Range", "bytes=$have-")
            val code = c.responseCode
            val append = when (code) {
                206 -> true
                200 -> false // the server ignored Range: start over
                416 -> { part.delete(); throw IOException("range not satisfiable, restarting") }
                else -> throw HttpStatus(code)
            }
            if (!append) have = 0
            RandomAccessFile(part, "rw").use { raf ->
                if (!append) raf.setLength(0)
                raf.seek(have)
                c.inputStream.use { input ->
                    val buf = ByteArray(64 * 1024)
                    var lastReport = 0L
                    while (true) {
                        if (isStopped()) return false
                        val n = input.read(buf)
                        if (n < 0) break
                        raf.write(buf, 0, n)
                        have += n
                        val now = System.currentTimeMillis()
                        if (now - lastReport > 500) { lastReport = now; onProgress(have) }
                    }
                }
            }
            onProgress(have)
            if (expectedSize > 0 && have < expectedSize) throw IOException("connection dropped at $have of $expectedSize bytes")
            return true
        } finally {
            c.disconnect()
        }
    }
}
