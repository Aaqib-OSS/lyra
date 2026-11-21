package dev.lyra.android.tv

import java.net.URLEncoder
import java.security.SecureRandom
import java.util.Random

/**
 * The short code (and QR link) that pairs this TV with a Lyra app on a phone or computer.
 * Six characters from an alphabet without look-alikes (no 0 / O, 1 / I / L), shown as K7M-2QX so it can be read from a
 * sofa and typed with a phone keyboard. 31^6 is about 887 million codes; the code only starts a handshake and is
 * replaced on request, so it is a pairing hint, not a secret that protects anything by itself (see docs/android-tv.md).
 */
object PairingCode {
    const val ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    const val LENGTH = 6

    fun generate(random: Random = SecureRandom()): String =
        buildString { repeat(LENGTH) { append(ALPHABET[random.nextInt(ALPHABET.length)]) } }

    /** "K7M2QX" -> "K7M-2QX" */
    fun format(code: String): String = if (code.length == LENGTH) code.substring(0, 3) + "-" + code.substring(3) else code

    /** What a person typed ("k7m 2qx", "K7M-2QX") as the plain code, or null when it cannot be a code. */
    fun normalize(input: String): String? {
        val c = input.uppercase().filter { it.isLetterOrDigit() }
        return if (c.length == LENGTH && c.all { it in ALPHABET }) c else null
    }

    /**
     * What the QR code carries. A placeholder scheme until docs/connect-protocol.md fixes the real one:
     * lyra://pair?c=<code>&n=<TV name>. The Lyra app on the other device reads it, finds this TV and starts the handshake.
     */
    fun link(code: String, deviceName: String): String =
        "lyra://pair?c=$code&n=" + URLEncoder.encode(deviceName, "UTF-8").replace("+", "%20")
}
