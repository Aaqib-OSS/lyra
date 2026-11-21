package dev.lyra.android.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateVersionTest {
    private fun v(s: String) = UpdateVersion.parse(s)!!

    @Test fun parsesTagFormats() {
        assertEquals(v("0.8.0"), v("android-v0.8.0"))
        assertEquals(v("0.8.0"), v("v0.8.0"))
        assertEquals(UpdateVersion(1, 2, 0, emptyList()), v("1.2"))
        assertEquals(listOf("beta", "1"), v("0.4.0-beta.1").pre)
        assertEquals(v("1.0.0"), v("1.0.0+build.5"))
        assertNull(UpdateVersion.parse("nightly"))
        assertNull(UpdateVersion.parse(null))
    }

    @Test fun ordersNumbersNotStrings() {
        assertTrue(v("0.10.0") > v("0.9.0"))
        assertTrue(v("1.0.0") > v("0.99.99"))
        assertTrue(v("0.8.1") > v("0.8.0"))
    }

    @Test fun preReleaseRanksBelowRelease() {
        assertTrue(v("1.0.0") > v("1.0.0-rc.1"))
        assertTrue(v("1.0.0-rc.1") > v("1.0.0-beta.2"))
        assertTrue(v("1.0.0-beta.11") > v("1.0.0-beta.2"))
        assertTrue(v("1.0.0-beta.1") > v("1.0.0-beta"))
        assertTrue(v("1.0.0-alpha") > v("1.0.0-1"))
        assertTrue(v("1.0.1-beta.1") > v("1.0.0"))
    }

    @Test fun upgradeNeedsHigherVersionCode() {
        assertTrue(ChannelPolicy.isUpgrade(8000, 8001))
        assertFalse(ChannelPolicy.isUpgrade(8000, 8000))
        assertFalse(ChannelPolicy.isUpgrade(8000, 7999))
    }
}

class ChannelPolicyTest {
    private fun rel(tag: String, pre: Boolean = false, apk: String = "Lyra-Android-x.apk", extra: String = "") = """
        {"tag_name":"$tag","draft":false,"prerelease":$pre,"body":"notes for $tag","assets":[
          {"name":"$apk","size":1234,"browser_download_url":"${ReleaseParser.DOWNLOAD_PREFIX}$tag/$apk","digest":"sha256:${"a".repeat(64)}"}$extra]}"""

    private fun parse(vararg r: String) = ReleaseParser.parse(r.joinToString(",", "[", "]"))
    private val installed = UpdateVersion.parse("0.8.0")!!

    @Test fun stableIgnoresPreReleases() {
        val list = parse(rel("android-v0.9.0-beta.1", pre = true), rel("android-v0.8.5"))
        assertEquals("android-v0.8.5", ChannelPolicy.pick(list, Channel.STABLE, installed)?.tag)
    }

    @Test fun betaTakesNewestIncludingPreRelease() {
        val list = parse(rel("android-v0.9.0-beta.1", pre = true), rel("android-v0.8.5"))
        assertEquals("android-v0.9.0-beta.1", ChannelPolicy.pick(list, Channel.BETA, installed)?.tag)
    }

    @Test fun betaStillPrefersReleaseOverItsOwnBeta() {
        val list = parse(rel("android-v0.9.0-beta.3", pre = true), rel("android-v0.9.0"))
        assertEquals("android-v0.9.0", ChannelPolicy.pick(list, Channel.BETA, installed)?.tag)
    }

    @Test fun nothingWhenUpToDateOrOlder() {
        assertNull(ChannelPolicy.pick(parse(rel("android-v0.8.0"), rel("android-v0.7.0")), Channel.STABLE, installed))
        assertNull(ChannelPolicy.pick(emptyList(), Channel.BETA, installed))
    }

    @Test fun betaInstalledMovesToTheStableOfSameNumber() {
        val beta = UpdateVersion.parse("0.9.0-beta.1")!!
        assertEquals("android-v0.9.0", ChannelPolicy.pick(parse(rel("android-v0.9.0")), Channel.STABLE, beta)?.tag)
    }

    @Test fun skipsWindowsReleasesDraftsAndForeignUrls() {
        val windows = """{"tag_name":"v0.8.9","assets":[{"name":"Lyra-Setup-0.8.9.exe","size":1,"browser_download_url":"${ReleaseParser.DOWNLOAD_PREFIX}v0.8.9/Lyra-Setup-0.8.9.exe"}]}"""
        val draft = rel("android-v1.0.0").replace("\"draft\":false", "\"draft\":true")
        val foreign = rel("android-v1.1.0").replace(ReleaseParser.DOWNLOAD_PREFIX, "https://evil.example/")
        assertTrue(parse(windows, draft, foreign).isEmpty())
        assertTrue(ReleaseParser.parse("not json").isEmpty())
    }

    @Test fun findsChecksumAssetAndRoundTrips() {
        val sums = """,{"name":"Lyra-Android-x.apk.sha256","size":90,"browser_download_url":"${ReleaseParser.DOWNLOAD_PREFIX}t/Lyra-Android-x.apk.sha256"}"""
        val r = parse(rel("android-v0.9.0", extra = sums)).single()
        assertNotNull(r.checksum)
        assertEquals("Lyra-Android-x.apk.sha256", r.checksum!!.name)
        assertEquals("notes for android-v0.9.0", r.notes)
        assertEquals(1234L, r.apk.size)
        assertEquals(r, ReleaseInfo.fromJson(r.toJson()))
    }
}

class ChecksumTest {
    private val h = "0123456789abcdef".repeat(4)

    @Test fun sha256OfKnownInput() {
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", Checksum.sha256("abc".byteInputStream()))
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", Checksum.sha256("".byteInputStream()))
    }

    @Test fun parsesSha256sumFormats() {
        assertEquals(h, Checksum.parseExpected("$h  Lyra-Android-1.apk\n", "Lyra-Android-1.apk"))
        assertEquals(h, Checksum.parseExpected("${h.uppercase()} *Lyra-Android-1.apk", "Lyra-Android-1.apk"))
        assertEquals(h, Checksum.parseExpected("$h  ./Lyra-Android-1.apk", "Lyra-Android-1.apk"))
        assertEquals(h, Checksum.parseExpected("  $h \n", "whatever.apk")) // bare hash
    }

    @Test fun refusesMissingOrWrongEntries() {
        assertNull(Checksum.parseExpected("$h  other.apk\n", "Lyra-Android-1.apk"))
        assertNull(Checksum.parseExpected("$h  a.apk\n$h  b.apk", "c.apk"))
        assertNull(Checksum.parseExpected("not a hash  Lyra-Android-1.apk", "Lyra-Android-1.apk"))
        assertNull(Checksum.parseExpected("", "x.apk"))
    }

    @Test fun readsGithubDigest() {
        assertEquals(h, Checksum.fromDigest("sha256:$h"))
        assertNull(Checksum.fromDigest("sha1:$h"))
        assertNull(Checksum.fromDigest("sha256:zz"))
        assertNull(Checksum.fromDigest(null))
    }

    @Test fun comparisonIgnoresCaseButNotContent() {
        assertTrue(Checksum.matches(h, h.uppercase()))
        assertFalse(Checksum.matches(h, h.replaceRange(0, 1, "f")))
    }
}

class UpdatePolicyTest {
    private val hour = 3_600_000L

    @Test fun backgroundChecksWaitTwelveHours() {
        assertTrue(UpdatePolicy.checkDue(100 * hour, 0, manual = false))
        assertFalse(UpdatePolicy.checkDue(100 * hour, 100 * hour - 11 * hour, manual = false))
        assertTrue(UpdatePolicy.checkDue(100 * hour, 100 * hour - 12 * hour, manual = false))
    }

    @Test fun manualCheckOnlyDebounces() {
        assertFalse(UpdatePolicy.checkDue(1_000_000, 1_000_000 - 5_000, manual = true))
        assertTrue(UpdatePolicy.checkDue(1_000_000, 1_000_000 - 30_000, manual = true))
    }

    @Test fun clockMovingBackDoesNotBlockChecks() {
        assertTrue(UpdatePolicy.checkDue(10, 1_000_000, manual = false))
    }

    @Test fun neverInstallsWhileRecording() {
        assertFalse(UpdatePolicy.mayInstallNow(playing = false, recording = true, userInitiated = true))
        assertFalse(UpdatePolicy.mayInstallNow(playing = false, recording = true, userInitiated = false))
    }

    @Test fun automaticInstallWaitsForSilence() {
        assertFalse(UpdatePolicy.mayInstallNow(playing = true, recording = false, userInitiated = false))
        assertTrue(UpdatePolicy.mayInstallNow(playing = false, recording = false, userInitiated = false))
        assertTrue(UpdatePolicy.mayInstallNow(playing = true, recording = false, userInitiated = true))
    }

    @Test fun storeInstallersDisableTheUpdater() {
        assertTrue(UpdatePolicy.isStoreManaged("org.fdroid.fdroid"))
        assertTrue(UpdatePolicy.isStoreManaged("com.looker.droidify"))
        assertTrue(UpdatePolicy.isStoreManaged("com.android.vending"))
        assertFalse(UpdatePolicy.isStoreManaged(null)) // sideloaded
        assertFalse(UpdatePolicy.isStoreManaged("dev.lyra.android")) // updated by itself before
        assertFalse(UpdatePolicy.isStoreManaged("com.google.android.packageinstaller"))
    }

    @Test fun signersMustMatchExactly() {
        assertTrue(UpdatePolicy.sameSigners(setOf("aa"), setOf("aa")))
        assertFalse(UpdatePolicy.sameSigners(setOf("aa"), setOf("bb")))
        assertFalse(UpdatePolicy.sameSigners(setOf("aa"), setOf("aa", "bb")))
        assertFalse(UpdatePolicy.sameSigners(emptySet(), emptySet())) // unsigned never matches
    }
}
