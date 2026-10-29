plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release credentials are supplied by the owner through the process environment.
// An explicitly requested staging build is unsigned and cannot be distributed.
val signingNames = listOf("SALAPIYA_KEYSTORE", "SALAPIYA_STORE_PASSWORD", "SALAPIYA_KEY_ALIAS", "SALAPIYA_KEY_PASSWORD")
val releaseCredentials = signingNames.associateWith { System.getenv(it)?.takeIf(String::isNotBlank) }
val hasReleaseCredentials = releaseCredentials.values.all { it != null }
val unsignedStaging = System.getenv("SALAPIYA_UNSIGNED_STAGING") == "true"
require(releaseCredentials.values.none { it != null } || hasReleaseCredentials) {
    "Supply all four Salapiya release-signing environment variables, or none."
}
gradle.taskGraph.whenReady {
    if (allTasks.any { it.project == project && it.name.contains("Release") } && !hasReleaseCredentials && !unsignedStaging) {
        throw GradleException("Release signing is required. Provision owner-controlled signing credentials. For non-distributable UNSIGNED staging only, set SALAPIYA_UNSIGNED_STAGING=true.")
    }
}

android {
    namespace = "dev.salapiya.salapiya"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Preserve the installed identity and OAuth callback across upgrades.
        applicationId = "dev.salapiya.salapiya"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasReleaseCredentials) {
            create("privateRelease") {
                storeFile = file(releaseCredentials.getValue("SALAPIYA_KEYSTORE")!!)
                storePassword = releaseCredentials.getValue("SALAPIYA_STORE_PASSWORD")
                keyAlias = releaseCredentials.getValue("SALAPIYA_KEY_ALIAS")
                keyPassword = releaseCredentials.getValue("SALAPIYA_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            signingConfig = if (hasReleaseCredentials) signingConfigs.getByName("privateRelease") else null
        }
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
