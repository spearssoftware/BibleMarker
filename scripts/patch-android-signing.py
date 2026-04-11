#!/usr/bin/env python3
"""Patch the Tauri-generated Android build.gradle.kts.

Adds:
1. Release signing config (reads credentials from env vars set in CI).
2. androidResources.noCompress for asset types that must survive raw in the APK —
   .zip (SWORD modules) and .db (gnosis-lite). AGP's compressAssets task otherwise
   wraps these files inside a .jar container, which corrupts them when read back
   via the Tauri FS plugin / AssetManager.
"""
import sys

gradle_file = "src-tauri/gen/android/app/build.gradle.kts"

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
