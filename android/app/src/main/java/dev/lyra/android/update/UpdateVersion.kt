package dev.lyra.android.update

/**
 * A release version in semantic-versioning form (`0.8.0`, `1.2.3-beta.1`). Tags look like `android-v0.8.0`, `v0.8.0` or
 * `0.4.0-beta.1`, so [parse] skips any prefix before the first number. Ordering follows semver precedence: a
 * pre-release is older than its release, numeric identifiers compare as numbers, build metadata (`+x`) is ignored.
 */
data class UpdateVersion(val major: Int, val minor: Int, val patch: Int, val pre: List<String>) : Comparable<UpdateVersion> {
    val isPreRelease: Boolean get() = pre.isNotEmpty()

    override fun compareTo(other: UpdateVersion): Int {
        if (major != other.major) return major.compareTo(other.major)
        if (minor != other.minor) return minor.compareTo(other.minor)
        if (patch != other.patch) return patch.compareTo(other.patch)
        if (pre.isEmpty() || other.pre.isEmpty()) {
            // no pre-release part ranks higher than any pre-release
            return when {
                pre.isEmpty() && other.pre.isEmpty() -> 0
                pre.isEmpty() -> 1
                else -> -1
            }
        }
        for (i in 0 until minOf(pre.size, other.pre.size)) {
            val c = comparePre(pre[i], other.pre[i])
            if (c != 0) return c
        }
        return pre.size.compareTo(other.pre.size)
    }

    override fun toString(): String = "$major.$minor.$patch" + if (pre.isEmpty()) "" else "-" + pre.joinToString(".")

    companion object {
        private val RX = Regex("""(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?""")

        fun parse(raw: String?): UpdateVersion? {
            if (raw == null) return null
            val m = RX.find(raw.trim()) ?: return null
            val (ma, mi, pa, pre) = m.destructured
            return UpdateVersion(
                ma.toIntOrNull() ?: return null,
                mi.toIntOrNull() ?: return null,
                if (pa.isEmpty()) 0 else pa.toIntOrNull() ?: return null,
                if (pre.isEmpty()) emptyList() else pre.split('.').filter { it.isNotEmpty() }
            )
        }

        private fun comparePre(a: String, b: String): Int {
            val an = a.toLongOrNull()
            val bn = b.toLongOrNull()
            return when {
                an != null && bn != null -> an.compareTo(bn)
                an != null -> -1 // numeric identifiers rank below alphanumeric ones
                bn != null -> 1
                else -> a.compareTo(b)
            }
        }
    }
}
