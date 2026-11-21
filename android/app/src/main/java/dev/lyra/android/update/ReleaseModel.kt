package dev.lyra.android.update

import org.json.JSONArray
import org.json.JSONObject

enum class Channel(val key: String) {
    STABLE("stable"), BETA("beta");

    companion object {
        fun from(key: String?): Channel = values().firstOrNull { it.key == key } ?: STABLE
    }
}

data class ReleaseAsset(val name: String, val url: String, val size: Long, val digest: String?)

data class ReleaseInfo(
    val tag: String,
    val version: UpdateVersion,
    val prerelease: Boolean,
    val notes: String,
    val apk: ReleaseAsset,
    val checksum: ReleaseAsset?
) {
    fun toJson(): JSONObject = JSONObject()
        .put("tag", tag).put("version", version.toString()).put("prerelease", prerelease).put("notes", notes)
        .put("apk", asset(apk)).put("checksum", checksum?.let { asset(it) } ?: JSONObject.NULL)

    private fun asset(a: ReleaseAsset) = JSONObject().put("name", a.name).put("url", a.url).put("size", a.size).put("digest", a.digest ?: JSONObject.NULL)

    companion object {
        fun fromJson(o: JSONObject): ReleaseInfo? = try {
            ReleaseInfo(
                o.getString("tag"), UpdateVersion.parse(o.getString("version")) ?: return null, o.optBoolean("prerelease"), o.optString("notes"),
                readAsset(o.getJSONObject("apk")) ?: return null, o.optJSONObject("checksum")?.let { readAsset(it) }
            )
        } catch (_: Exception) {
            null
        }

        private fun readAsset(a: JSONObject): ReleaseAsset? {
            val name = a.optString("name")
            val url = a.optString("url")
            if (name.isEmpty() || url.isEmpty()) return null
            return ReleaseAsset(name, url, a.optLong("size", -1), a.optString("digest").takeIf { it.isNotEmpty() && it != "null" })
        }
    }
}

/** Turns the GitHub "list releases" response into the releases that carry an Android APK. */
object ReleaseParser {
    /** Only downloads from this project's own releases are ever fetched. */
    const val DOWNLOAD_PREFIX = "https://github.com/DhruvHarani1/lyra/releases/download/"

    private val APK_NAME = Regex("""^Lyra-Android-.+\.apk$""")

    fun parse(json: String): List<ReleaseInfo> {
        val arr = try { JSONArray(json) } catch (_: Exception) { return emptyList() }
        val out = ArrayList<ReleaseInfo>()
        for (i in 0 until arr.length()) {
            val r = arr.optJSONObject(i) ?: continue
            if (r.optBoolean("draft")) continue
            val tag = r.optString("tag_name")
            val version = UpdateVersion.parse(tag) ?: continue
            val assets = r.optJSONArray("assets") ?: continue
            val list = (0 until assets.length()).mapNotNull { idx ->
                val a = assets.optJSONObject(idx) ?: return@mapNotNull null
                val name = a.optString("name")
                val url = a.optString("browser_download_url")
                if (name.isEmpty() || !url.startsWith(DOWNLOAD_PREFIX)) return@mapNotNull null
                ReleaseAsset(name, url, a.optLong("size", -1), a.optString("digest").takeIf { it.isNotEmpty() && it != "null" })
            }
            val apk = list.firstOrNull { APK_NAME.matches(it.name) } ?: continue
            val checksum = list.firstOrNull { it.name.equals("${apk.name}.sha256", true) }
                ?: list.firstOrNull { it.name.equals("SHA256SUMS", true) || it.name.equals("SHA256SUMS.txt", true) }
            out += ReleaseInfo(tag, version, r.optBoolean("prerelease") || version.isPreRelease, r.optString("body").take(6000), apk, checksum)
        }
        return out
    }
}

object ChannelPolicy {
    /** The newest release this channel may offer that is strictly newer than [installed]; null when up to date. */
    fun pick(releases: List<ReleaseInfo>, channel: Channel, installed: UpdateVersion): ReleaseInfo? =
        releases
            .filter { channel == Channel.BETA || !it.prerelease }
            .filter { it.version > installed }
            .maxByOrNull { it.version }

    /** versionCode of the downloaded APK must be strictly higher than the installed one (no downgrade, no replay). */
    fun isUpgrade(installedCode: Long, candidateCode: Long): Boolean = candidateCode > installedCode
}
