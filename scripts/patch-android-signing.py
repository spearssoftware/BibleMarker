#!/usr/bin/env python3
"""Patch Tauri-generated Android project files.

Patches:
1. build.gradle.kts — release signing config (reads credentials from env vars set in CI).
2. build.gradle.kts — androidResources.noCompress for asset types that must survive
   raw in the APK: .zip (SWORD modules) and .db (gnosis-lite). AGP's compressAssets
   task otherwise wraps these files inside a .jar container, which corrupts them
   when read back via the Tauri FS plugin / AssetManager.
3. MainActivity.kt — suppress Android WebView's native text-selection ActionMode
   (the floating Copy/Share/Select-all toolbar). On long-press the system toolbar
   otherwise intercepts our marking flow and our custom BibleMarker menu never
   appears. Dismissing ActionMode in onActionModeStarted lets the JS selection
   handler run and show our menu instead.
"""
import sys

gradle_file = "src-tauri/gen/android/app/build.gradle.kts"
main_activity_file = "src-tauri/gen/android/app/src/main/java/app/biblemarker/MainActivity.kt"

with open(gradle_file) as f:
    content = f.read()

signing_config = """
    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("ANDROID_KEYSTORE_PATH") ?: "/dev/null")
            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD") ?: ""
            keyAlias = System.getenv("ANDROID_KEY_ALIAS") ?: ""
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD") ?: ""
        }
    }
"""

no_compress_block = """
    androidResources {
        noCompress += listOf("zip", "db")
    }
"""

if "    buildTypes {" not in content:
    print("ERROR: Could not find buildTypes block to patch", file=sys.stderr)
    sys.exit(1)

if "signingConfigs" not in content:
    content = content.replace(
        "    buildTypes {",
        signing_config + "    buildTypes {"
    )
    content = content.replace(
        'getByName("release") {',
        'getByName("release") {\n            signingConfig = signingConfigs.getByName("release")'
    )
    print("Patched: signing config")
else:
    print("Skipped: signing config already present")

if "androidResources" not in content:
    content = content.replace(
        "    buildTypes {",
        no_compress_block + "    buildTypes {"
    )
    print("Patched: androidResources noCompress")
else:
    print("Skipped: androidResources already present")

with open(gradle_file, "w") as f:
    f.write(content)

# ---------------------------------------------------------------------------
# MainActivity.kt — suppress native selection ActionMode
# ---------------------------------------------------------------------------

with open(main_activity_file) as f:
    activity = f.read()

if "onActionModeStarted" in activity:
    print("Skipped: MainActivity already overrides onActionModeStarted")
else:
    override = """
  override fun onActionModeStarted(mode: android.view.ActionMode?) {
    // Immediately dismiss the system text-selection toolbar so our custom
    // BibleMarker marking menu (driven by JS handleMouseUp) can take over.
    mode?.finish()
    super.onActionModeStarted(mode)
  }
"""
    # Inject the override right before the final closing brace of the class.
    if "class MainActivity : TauriActivity() {" not in activity:
        print("ERROR: Unexpected MainActivity.kt layout — cannot patch", file=sys.stderr)
        sys.exit(1)
    # Find the last `}` in the file (end of class) and insert before it.
    last_brace = activity.rfind("}")
    if last_brace == -1:
        print("ERROR: Could not find closing brace in MainActivity.kt", file=sys.stderr)
        sys.exit(1)
    activity = activity[:last_brace] + override + activity[last_brace:]
    with open(main_activity_file, "w") as f:
        f.write(activity)
    print("Patched: MainActivity onActionModeStarted override")
