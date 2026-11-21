package dev.lyra.android

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * "Widget look": opens when a Lyra widget is added to the home screen, and again from the launcher's Reconfigure
 * action. One tap on a look saves it for that widget and closes. Built in code (no extra libraries).
 */
class WidgetConfigActivity : Activity() {
    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        widgetId = intent?.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            ?: AppWidgetManager.INVALID_APPWIDGET_ID
        // backing out leaves the widget unplaced (the launcher treats CANCELED that way)
        setResult(RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }

        val dp = resources.displayMetrics.density
        fun px(v: Int) = (v * dp).toInt()
        val current = WidgetThemes.get(this, widgetId)

        val list = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(px(18), px(18), px(18), px(28))
        }
        list.addView(TextView(this).apply {
            text = "Widget look"
            textSize = 26f
            setTextColor(Color.WHITE)
            typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
        })
        list.addView(TextView(this).apply {
            text = "Pick how this widget looks. You can change it later: long-press the widget, then Reconfigure."
            textSize = 14f
            setTextColor(Color.argb(170, 255, 255, 255))
            setPadding(0, px(6), 0, px(14))
        })

        for ((key, name, note) in WidgetThemes.options()) {
            list.addView(row(key, name, note, key == current, ::px))
        }

        val scroll = ScrollView(this).apply {
            setBackgroundColor(Color.BLACK)
            isFillViewport = true
            addView(list, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            // targetSdk 36 draws edge to edge: keep the list clear of the bars
            setOnApplyWindowInsetsListener { v, insets ->
                v.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
                insets
            }
        }
        setContentView(scroll)
    }

    /** One look: a swatch drawn in its own colours with sample text on it, then its name. */
    private fun row(key: String, name: String, note: String, selected: Boolean, px: (Int) -> Int): View {
        val pal = WidgetThemes.palette(this, key, null)
        val top = pal?.top ?: Color.parseColor("#6a3d8a")
        val bottom = pal?.bottom ?: Color.parseColor("#1B1235")
        val ink = pal?.text ?: Color.WHITE
        val swatch = TextView(this).apply {
            text = "Aa ♪"
            gravity = Gravity.CENTER
            textSize = 16f
            typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
            setTextColor(ink)
            background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(top, bottom)).apply {
                cornerRadius = px(14).toFloat()
                setStroke(px(2), pal?.accent ?: Color.argb(90, 255, 255, 255))
            }
            layoutParams = LinearLayout.LayoutParams(px(84), px(52))
        }
        val names = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(px(14), 0, 0, 0)
            addView(TextView(context).apply {
                text = name
                textSize = 16f
                setTextColor(Color.WHITE)
                typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
            })
            addView(TextView(context).apply {
                text = note
                textSize = 12f
                setTextColor(Color.argb(150, 255, 255, 255))
            })
        }
        val mark = TextView(this).apply {
            text = if (selected) "✓" else ""
            textSize = 20f
            setTextColor(Color.WHITE)
        }
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(px(10), px(10), px(14), px(10))
            background = GradientDrawable().apply {
                cornerRadius = px(18).toFloat()
                setColor(if (selected) Color.argb(40, 255, 255, 255) else Color.argb(14, 255, 255, 255))
            }
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = px(8) }
            addView(swatch)
            addView(names, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(mark)
            isClickable = true
            contentDescription = name
            setOnClickListener { choose(key) }
        }
    }

    private fun choose(key: String) {
        WidgetThemes.set(this, widgetId, key)
        // the host expects the first picture from us; this also redraws every other widget
        LyraWidgetUpdater.attach(this)
        LyraWidgetUpdater.refresh(force = true)
        setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
        finish()
    }
}
