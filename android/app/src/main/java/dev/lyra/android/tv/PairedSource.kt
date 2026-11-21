package dev.lyra.android.tv

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import dev.lyra.android.MediaMonitor
import org.json.JSONObject

/**
 * Follows a Lyra app on another device. It keeps the newest snapshot the transport delivered and answers the page's
 * questions from it; commands go back over the transport. The snapshot carries `positionMs` and `sampledAt`, and the
 * page extrapolates between pushes, so a snapshot every few seconds or on every change is enough.
 */
class PairedSource(private val transport: ConnectTransport) : PlaybackSource {
    private val main = Handler(Looper.getMainLooper())
    private val listeners = mutableListOf<() -> Unit>()

    @Volatile var link: LinkState = LinkState.IDLE
        private set
    private var latest: String = "null"
    private var receivedAtElapsed = 0L
    private var started = false

    val connected: Boolean get() = link == LinkState.CONNECTED

    private val onTransport = object : ConnectTransport.Listener {
        override fun onState(state: LinkState) {
            main.post {
                link = state
                if (state != LinkState.CONNECTED) latest = "null"
                notifyListeners()
            }
        }

        override fun onSnapshot(json: String) {
            main.post {
                latest = json
                receivedAtElapsed = SystemClock.elapsedRealtime()
                notifyListeners()
            }
        }
    }

    fun start(code: String, deviceName: String) {
        if (started) return
        started = true
        link = LinkState.WAITING
        transport.connect(code, deviceName, onTransport)
    }

    fun stop() {
        if (!started) return
        started = false
        transport.stop()
        link = LinkState.IDLE
        latest = "null"
        notifyListeners()
    }

    private fun notifyListeners() = listeners.toList().forEach { it() }

    override fun snapshotJson(ctx: Context): String = latest

    override fun statusJson(ctx: Context): String =
        if (connected) JSONObject().put("state", "connected").toString()
        else JSONObject().put("state", "needs-setup").put("message", "Pair this TV with Lyra on your phone or computer.").toString()

    override fun queueJson(): String = "null"
    override fun command(json: String): Boolean = connected && transport.send(json)
    override fun addListener(l: () -> Unit) { main.post { listeners.add(l) } }
    override fun removeListener(l: () -> Unit) { main.post { listeners.remove(l) } }
    override fun refresh(ctx: Context) = notifyListeners()
    override fun hasAccess(ctx: Context) = true

    override fun now(): MediaMonitor.Now? {
        val o = try { JSONObject(latest) } catch (_: Exception) { return null }
        val t = o.optJSONObject("track") ?: return null
        val playing = o.optBoolean("isPlaying")
        var pos = o.optLong("positionMs")
        if (playing) pos += SystemClock.elapsedRealtime() - receivedAtElapsed
        val artists = t.optJSONArray("artists")
        val artist = if (artists != null && artists.length() > 0) artists.optString(0) else ""
        return MediaMonitor.Now(
            id = t.optString("id"),
            title = t.optString("title"),
            artist = artist,
            positionMs = pos.coerceAtLeast(0),
            playing = playing,
            art = null,
            isAd = o.optBoolean("isAdOrUnknown"),
            durationMs = t.optLong("durationMs")
        )
    }
}
