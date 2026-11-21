package dev.lyra.android.update

import java.io.File
import java.io.InputStream
import java.security.MessageDigest

object Checksum {
    fun sha256(file: File): String = file.inputStream().use { sha256(it) }

    fun sha256(input: InputStream): String {
        val md = MessageDigest.getInstance("SHA-256")
        val buf = ByteArray(64 * 1024)
        while (true) {
            val n = input.read(buf)
            if (n < 0) break
            md.update(buf, 0, n)
        }
        return hex(md.digest())
    }

    fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }

    private val HEX64 = Regex("""^[0-9a-fA-F]{64}$""")

    /**
     * Reads the expected hash for [fileName] out of a checksum file: `sha256sum` output (`<hash>  name`, `<hash> *name`),
     * or a file holding just the hash. Returns lower-case hex, or null if there is no usable entry for the file.
     */
    fun parseExpected(text: String, fileName: String): String? {
        val lines = text.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.toList()
        for (line in lines) {
            val parts = line.split(Regex("\\s+"), limit = 2)
            if (parts.size == 2 && HEX64.matches(parts[0]) && parts[1].trimStart('*').substringAfterLast('/') == fileName) return parts[0].lowercase()
        }
        if (lines.size == 1 && HEX64.matches(lines[0])) return lines[0].lowercase()
        return null
    }

    /** GitHub's asset `digest` field: `sha256:<hex>`. */
    fun fromDigest(digest: String?): String? {
        if (digest == null || !digest.startsWith("sha256:", true)) return null
        val h = digest.substring(7)
        return if (HEX64.matches(h)) h.lowercase() else null
    }

    fun matches(expected: String, actual: String): Boolean = MessageDigest.isEqual(expected.lowercase().toByteArray(), actual.lowercase().toByteArray())
}
