package dev.lyra.android.tv

import android.content.Context
import dev.lyra.android.MediaMonitor

/**
 * Where the TV gets "what is playing" from. A phone reads another app's media session; a TV has two realistic options
 * (see docs/android-tv.md): the same media-session mirror ([LocalSource], when the TV allows notification access), or
 * the playback state of a Lyra app on another device ([PairedSource]). [dev.lyra.android.Rpc] and the screen saver only
 * talk to this interface, so the page cannot tell which one is behind it.
 */
interface PlaybackSource {
    /** PlaybackSnapshot JSON (the shape the desktop app produces), or the string "null" when nothing is playing. */
    fun snapshotJson(ctx: Context): String
    fun statusJson(ctx: Context): String
    fun queueJson(): String
    /** A transport command as JSON, e.g. {"type":"toggle"}. False when nothing is playing or the source refuses. */
    fun command(json: String): Boolean
    fun addListener(l: () -> Unit)
    fun removeListener(l: () -> Unit)
    /** (Re)attach, e.g. after coming back from a settings screen. */
    fun refresh(ctx: Context)
    fun hasAccess(ctx: Context): Boolean
    /** The cheap "now playing" the screen saver needs (no cover re-encoding). */
    fun now(): MediaMonitor.Now?
}

/** This device's own media sessions: exactly what the phone app does. */
object LocalSource : PlaybackSource {
    override fun snapshotJson(ctx: Context) = MediaMonitor.snapshotJson(ctx)
    override fun statusJson(ctx: Context) = MediaMonitor.statusJson(ctx)
    override fun queueJson() = MediaMonitor.queueJson()
    override fun command(json: String) = MediaMonitor.command(json)
    override fun addListener(l: () -> Unit) = MediaMonitor.addListener(l)
    override fun removeListener(l: () -> Unit) = MediaMonitor.removeListener(l)
    override fun refresh(ctx: Context) = MediaMonitor.refresh(ctx)
    override fun hasAccess(ctx: Context) = MediaMonitor.hasAccess(ctx)
    override fun now() = MediaMonitor.now()
}
