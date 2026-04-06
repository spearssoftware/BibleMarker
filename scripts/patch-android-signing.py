#!/usr/bin/env python3
"""Patch the Tauri-generated Android build.gradle.kts with release signing config.

The signing config reads credentials from environment variables set in CI.
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

if "signingConfigs" in content:
    print("Signing config already present, skipping")
    sys.exit(0)

if "    buildTypes {" not in content:
    print("ERROR: Could not find buildTypes block to patch", file=sys.stderr)
    sys.exit(1)

content = content.replace(
    "    buildTypes {",
    signing_config + "    buildTypes {"
)
content = content.replace(
    'getByName("release") {',
    'getByName("release") {\n            signingConfig = signingConfigs.getByName("release")'
)

with open(gradle_file, "w") as f:
    f.write(content)

print("Patched Android signing config successfully")
