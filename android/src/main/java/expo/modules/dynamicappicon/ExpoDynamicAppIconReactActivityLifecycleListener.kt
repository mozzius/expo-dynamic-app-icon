package expo.modules.dynamicappicon

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import expo.modules.core.interfaces.ReactActivityLifecycleListener

object SharedObject {
    var packageName: String = ""
    var classesToKill = ArrayList<String>()
    var icon: String = ""
    var pm: PackageManager? = null
    var shouldChangeIcon: Boolean = false
}

class ExpoDynamicAppIconReactActivityLifecycleListener : ReactActivityLifecycleListener {
    private var currentActivity: Activity? = null
    private var isBackground = false
    private val handler = Handler(Looper.getMainLooper())
    private val backgroundCheckRunnable = Runnable {
        if (isBackground) {
            onBackground()
        }
    }

    override fun onPause(activity: Activity) {
        currentActivity = activity
        isBackground = true
        // Apply icon change immediately when app goes to background
        if (SharedObject.shouldChangeIcon) {
            applyIconChange(activity)
            // Force close the app after icon change to ensure clean restart
            handler.postDelayed({
                forceCloseApp(activity)
            }, 500) // Small delay to ensure icon change completes
        }
    }

    override fun onResume(activity: Activity) {
        currentActivity = activity
        isBackground = false
        handler.removeCallbacks(backgroundCheckRunnable)
    }

    override fun onDestroy(activity: Activity) {
        handler.removeCallbacks(backgroundCheckRunnable)
        if (SharedObject.shouldChangeIcon) {
            applyIconChange(activity)
        }
        if (currentActivity === activity) {
            currentActivity = null
        }
    }

    private fun onBackground() {
        // This method is no longer used since we apply changes immediately in onPause
    }
    
    private fun forceCloseApp(activity: Activity) {
        try {
            // Force close the app process to ensure clean restart
            activity.finishAffinity()
            android.os.Process.killProcess(android.os.Process.myPid())
        } catch (e: Exception) {
            Log.e("IconChange", "Error force closing app", e)
        }
    }

    private fun applyIconChange(activity: Activity) {
        SharedObject.icon
            .takeIf { it.isNotEmpty() }
            ?.let { icon ->
                val pm = SharedObject.pm ?: return
                val newComponent = ComponentName(SharedObject.packageName, icon)

                if (!doesComponentExist(newComponent)) {
                    SharedObject.shouldChangeIcon = false
                    return
                }

                try {
                    // Get all launcher activities and disable all except the new one
                    val packageInfo =
                        pm.getPackageInfo(
                            SharedObject.packageName,
                            PackageManager.GET_ACTIVITIES or PackageManager.GET_DISABLED_COMPONENTS
                        )

                    packageInfo.activities?.forEach { activityInfo ->
                        val componentName =
                            ComponentName(SharedObject.packageName, activityInfo.name)
                        val state = pm.getComponentEnabledSetting(componentName)

                        if (
                            activityInfo.name != icon &&
                                state != PackageManager.COMPONENT_ENABLED_STATE_DISABLED
                        ) {
                            pm.setComponentEnabledSetting(
                                componentName,
                                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                                PackageManager.DONT_KILL_APP
                            )
                            Log.i("IconChange", "Disabled component: ${activityInfo.name}")
                        }
                    }

                    // Enable the new icon
                    pm.setComponentEnabledSetting(
                        newComponent,
                        PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                        PackageManager.DONT_KILL_APP
                    )
                    Log.i("IconChange", "Enabled new icon: $icon")
                } catch (e: Exception) {
                    Log.e("IconChange", "Error during icon change", e)
                } finally {
                    SharedObject.shouldChangeIcon = false
                }

                // Ensure at least one component is enabled
                ensureAtLeastOneComponentEnabled(activity)
            }
    }

    private fun ensureAtLeastOneComponentEnabled(context: Context) {
        val pm = SharedObject.pm ?: return
        val packageInfo =
            pm.getPackageInfo(
                SharedObject.packageName,
                PackageManager.GET_ACTIVITIES or PackageManager.GET_DISABLED_COMPONENTS
            )

        val hasEnabledComponent =
            packageInfo.activities?.any { activityInfo ->
                val componentName = ComponentName(SharedObject.packageName, activityInfo.name)
                pm.getComponentEnabledSetting(componentName) ==
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED
            } ?: false

        if (!hasEnabledComponent) {
            val mainActivityName = "${SharedObject.packageName}.MainActivity"
            val mainComponent = ComponentName(SharedObject.packageName, mainActivityName)
            try {
                pm.setComponentEnabledSetting(
                    mainComponent,
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                    PackageManager.DONT_KILL_APP
                )
                Log.i("IconChange", "No active component found. Re-enabling $mainActivityName")
            } catch (e: Exception) {
                Log.e("IconChange", "Error enabling fallback MainActivity", e)
            }
        }
    }

    /** Check if a component exists in the manifest (including disabled ones). */
    private fun doesComponentExist(componentName: ComponentName): Boolean {
        return try {
            val packageInfo =
                SharedObject.pm?.getPackageInfo(
                    SharedObject.packageName,
                    PackageManager.GET_ACTIVITIES or PackageManager.GET_DISABLED_COMPONENTS
                )

            val activityExists =
                packageInfo?.activities?.any { it.name == componentName.className } == true

            activityExists
        } catch (e: Exception) {

            false
        }
    }
}
