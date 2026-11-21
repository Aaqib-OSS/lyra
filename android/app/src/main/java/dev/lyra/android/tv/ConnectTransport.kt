package dev.lyra.android.tv

/** How far the link to the other Lyra device has got. */
enum class LinkState { IDLE, WAITING, CONNECTED, LOST }

/**
 * The wire between this TV and a Lyra app on a phone or computer. Everything above it ([PairedSource], the pairing screen,
 * the screen saver) is finished; only the implementation behind [TvTransports.create] is not, because the connection
 * protocol is specified separately (docs/connect-protocol.md). To finish the TV side, implement this interface against
 * that document:
 *  - [connect] announces this TV for [code] and keeps trying until [stop]; call [Listener.onState] as the link changes
 *  - the other device sends PlaybackSnapshot JSON (same shape the desktop app already produces); hand each one to
 *    [Listener.onSnapshot], and "null" when nothing plays
 *  - [send] forwards a transport command ({"type":"toggle"}, ...) and returns whether it was accepted
 * All callbacks may come from any thread; [PairedSource] hops to the main thread.
 */
interface ConnectTransport {
    interface Listener {
        fun onState(state: LinkState)
        fun onSnapshot(json: String)
    }

    fun connect(code: String, deviceName: String, listener: Listener)
    fun stop()
    fun send(commandJson: String): Boolean
}

/**
 * Placeholder until the protocol lands: it never connects. The TV shows the pairing screen and "Waiting for your
 * device..." forever, which is the honest state: nothing can pair yet.
 */
class StubConnectTransport : ConnectTransport {
    override fun connect(code: String, deviceName: String, listener: ConnectTransport.Listener) = listener.onState(LinkState.WAITING)
    override fun stop() = Unit
    override fun send(commandJson: String) = false
}

object TvTransports {
    /** The one place to switch to the real transport. */
    fun create(): ConnectTransport = StubConnectTransport()
}
