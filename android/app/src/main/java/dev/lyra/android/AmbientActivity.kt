package dev.lyra.android

import android.graphics.Color
import android.os.Bundle
import android.os.SystemClock
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * "Ambient lyrics": an always-on-display style screen. Pure black, very dim lyrics, low brightness, no system bars,
 * and it slowly shifts so an OLED panel is never lit in the same place. It shows over the lock screen, like an alarm.
 *
 * Two renderers: the "Minimal" style is a hand-drawn native view (no WebView, one update per lyric line, a tap or the
 * proximity sensor ends it); "Glow" and "Video" are the web ambient page. Brightness, keep-awake and dimming are shared.
 */
class AmbientActivity : ComponentActivity() {
    private var rpc: Rpc? = null
    private var web: LyraWebView? = null
    private var driver: AodDriver? = null
    private var native = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val fromCharger = intent?.getBooleanExtra("auto", false) == true
        showOverLockScreen(true, turnScreenOn = !fromCharger) // started by the charger: never wake a dark phone
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        level = AmbientConfig.brightness(this)
        setBrightness(level, AmbientConfig.autoBrightness(this))

        native = AmbientConfig.native(this)
        val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        if (native) {
            val v = AodLyricsView(this).apply { layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT) }
            v.setOnClickListener { finishAndRemoveTask() } // tap leaves
            root.addView(v)
            driver = AodDriver(this, v)
        } else {
            val view = LyraWebView(this).apply { layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT) }
            WebSetup.configure(view, this)
            root.addView(view)
            web = view
        }
        AmbientController.activity = this
        AmbientController.changed(applicationContext)
        setContentView(root)
        web?.let { v ->
            rpc = Rpc(applicationContext, v, this).also { it.install() }
            WebSetup.load(v, "?ambient=1")
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) // until we know whether music is playing
        MediaMonitor.addListener(playbackListener)
        updateAwake()
        scheduleDim()
    }

    private var sensors: android.hardware.SensorManager? = null
    private var level = 0.2f
    private var auto = false
    private var smoothed = -1f
    private var lastActivityAt = SystemClock.elapsedRealtime()
    private var dimmed = 1f

    private val lightListener = object : android.hardware.SensorEventListener {
        override fun onAccuracyChanged(sensor: android.hardware.Sensor?, accuracy: Int) {}

        override fun onSensorChanged(e: android.hardware.SensorEvent) {
            // room light on a log scale: a dark room (~0 lux) -> half of the slider value, a bright room (~1000 lux) -> all of it
            val f = (kotlin.math.log10(e.values[0] + 1f) / 3f).coerceIn(0f, 1f)
            val target = 0.5f + 0.5f * f
            smoothed = if (smoothed < 0) target else smoothed * 0.85f + target * 0.15f // no flicker when a light switches
            apply()
        }
    }

    // Pocket / face-down: the proximity sensor reports "near", so leave and let the phone sleep (native screen only).
    private val proximityListener = object : android.hardware.SensorEventListener {
        private val since = SystemClock.elapsedRealtime()

        override fun onAccuracyChanged(sensor: android.hardware.Sensor?, accuracy: Int) {}

        override fun onSensorChanged(e: android.hardware.SensorEvent) {
            val near = e.values[0] < (e.sensor.maximumRange.coerceAtMost(5f))
            if (near && SystemClock.elapsedRealtime() - since > 2500) finishAndRemoveTask()
        }
    }

    private fun apply() {
        val factor = (if (auto && smoothed >= 0) smoothed else 1f) * dimmed
        window.attributes = window.attributes.apply { screenBrightness = (level * factor).coerceIn(0.01f, 1f) }
    }

    /**
     * Screen brightness for ambient mode, from Settings (and the web ambient page). [value] is the slider (what you set
     * is what you get); with [automatic] the light sensor scales it between 50% (dark room) and 100% (bright room).
     */
    fun setBrightness(value: Float, automatic: Boolean) {
        level = value.coerceIn(0.03f, 1f)
        auto = automatic
        sensors?.unregisterListener(lightListener)
        val sm = sensors ?: (getSystemService(SENSOR_SERVICE) as android.hardware.SensorManager).also { sensors = it }
        val light = sm.getDefaultSensor(android.hardware.Sensor.TYPE_LIGHT)
        if (automatic && light != null) sm.registerListener(lightListener, light, android.hardware.SensorManager.SENSOR_DELAY_NORMAL)
        else smoothed = -1f
        apply()
    }

    // The screen stays on while music is playing. When the music stops it may go to sleep after a few minutes (battery).
    private val awake = android.os.Handler(android.os.Looper.getMainLooper())
    private val releaseAwake = Runnable { window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
    private val playbackListener = { lastActivityAt = SystemClock.elapsedRealtime(); updateAwake() }

    private fun updateAwake() {
        awake.post {
            awake.removeCallbacks(releaseAwake)
            if (MediaMonitor.now()?.playing == true) {
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                if (dimmed != 1f) { dimmed = 1f; apply() }
            } else {
                awake.postDelayed(releaseAwake, 3 * 60_000L)
            }
        }
    }

    // After N minutes with no music activity the screen dims further (checked once a minute, not per frame).
    private val dimCheck = object : Runnable {
        override fun run() {
            val f = AodLogic.dimFactor(SystemClock.elapsedRealtime() - lastActivityAt, AmbientConfig.dimAfterMin(this@AmbientActivity) * 60_000L)
            if (f != dimmed && MediaMonitor.now()?.playing != true) { dimmed = f; apply() }
            awake.postDelayed(this, 60_000L)
        }
    }

    private fun scheduleDim() {
        awake.removeCallbacks(dimCheck)
        awake.postDelayed(dimCheck, 60_000L)
    }

    override fun onResume() {
        super.onResume()
        OverlayService.appForeground(true)
        rpc?.pushState()
        driver?.start()
        if (auto) setBrightness(level, true) // the light sensor was released in onPause
        if (native) {
            val sm = sensors ?: (getSystemService(SENSOR_SERVICE) as android.hardware.SensorManager).also { sensors = it }
            sm.getDefaultSensor(android.hardware.Sensor.TYPE_PROXIMITY)?.let { sm.registerListener(proximityListener, it, android.hardware.SensorManager.SENSOR_DELAY_NORMAL) }
        }
    }

    override fun onPause() {
        driver?.stop()
        sensors?.unregisterListener(proximityListener)
        sensors?.unregisterListener(lightListener) // screen off or another app on top: no reason to keep the light sensor running
        OverlayService.appForeground(false)
        super.onPause()
    }

    override fun onDestroy() {
        sensors?.unregisterListener(lightListener)
        sensors?.unregisterListener(proximityListener)
        awake.removeCallbacksAndMessages(null)
        MediaMonitor.removeListener(playbackListener)
        if (isFinishing) AmbientAutoStart.userClosed()
        if (AmbientController.activity === this) AmbientController.activity = null
        AmbientController.changed(applicationContext)
        rpc?.dispose()
        web?.destroy()
        super.onDestroy()
    }
}
