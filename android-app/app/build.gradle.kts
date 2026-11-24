import org.gradle.api.GradleException
import java.io.File
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.hilt.android)
    alias(libs.plugins.ksp)
}

if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

val localProps = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) {
        file.inputStream().use { load(it) }
    }
}

val keystoreProps = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) {
        file.inputStream().use { load(it) }
    }
}

fun resolveConfigValue(key: String, fallback: String = ""): String {
    val fromProp = (project.findProperty(key) as? String)?.trim()?.trim('"')
    val fromLocal = localProps.getProperty(key)?.trim()?.trim('"')
    val fromEnv = System.getenv(key)?.trim()?.trim('"')
    return (
        fromProp?.takeIf { it.isNotEmpty() }
            ?: fromLocal?.takeIf { it.isNotEmpty() }
            ?: fromEnv?.takeIf { it.isNotEmpty() }
            ?: fallback
        )
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
}

fun resolveSigningValue(key: String): String? {
    val fromEnv = System.getenv(key)?.trim()?.takeIf { it.isNotEmpty() }
    val fromKeystoreProps = keystoreProps.getProperty(key)?.trim()?.takeIf { it.isNotEmpty() }
    return fromEnv ?: fromKeystoreProps
}

val releaseKeystorePath = resolveSigningValue("KEYSTORE_FILE")
val releaseKeystoreFile = releaseKeystorePath?.let { rawPath ->
    val candidate = File(rawPath)
    if (candidate.isAbsolute) candidate else rootProject.file(rawPath)
}
val releaseKeystorePassword = resolveSigningValue("KEYSTORE_PASSWORD")
val releaseKeyAlias = resolveSigningValue("KEY_ALIAS")
val releaseKeyPassword = resolveSigningValue("KEY_PASSWORD")
val hasReleaseSigning = releaseKeystoreFile != null &&
    releaseKeystoreFile.exists() &&
    !releaseKeystorePassword.isNullOrBlank() &&
    !releaseKeyAlias.isNullOrBlank() &&
    !releaseKeyPassword.isNullOrBlank()

val isCiEnvironment = System.getenv("CI")?.equals("true", ignoreCase = true) == true
val isReleaseBuildRequested = gradle.startParameter.taskNames.any { task ->
    task.contains("Release", ignoreCase = true)
}

if (isCiEnvironment && isReleaseBuildRequested && !hasReleaseSigning) {
    throw GradleException(
        "CI release build aborted: release signing credentials are missing or KEYSTORE_FILE does not exist " +
            "(resolved path: ${releaseKeystoreFile?.absolutePath ?: "<unset>"}). " +
            "Set ANDROID_KEYSTORE_BASE64 / KEYSTORE_FILE, KEYSTORE_PASSWORD, KEY_ALIAS, and KEY_PASSWORD.",
    )
}

val resolvedVersionCode = (project.findProperty("VERSION_CODE") as? String)
    ?.trim()
    ?.toIntOrNull()
    ?.takeIf { it > 0 }
    ?: 1

val resolvedVersionName = (project.findProperty("VERSION_NAME") as? String)
    ?.trim()
    ?.takeIf { it.isNotEmpty() }
    ?: "1.0.0"

android {
    namespace = "com.whitelabel.commerce"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.whitelabel.commerce"
        minSdk = 24
        targetSdk = 35
        versionCode = resolvedVersionCode
        versionName = resolvedVersionName

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        vectorDrawables {
            useSupportLibrary = true
        }

        buildConfigField("String", "STORE_ID", "\"${resolveConfigValue("STORE_ID", "00000000-0000-0000-0000-000000000001")}\"")
        buildConfigField("String", "WEB_STORE_BASE_URL", "\"${resolveConfigValue("WEB_STORE_BASE_URL", "http://10.0.2.2:3000")}\"")
        buildConfigField(
            type = "String",
            name = "SUPABASE_URL",
            value = "\"${resolveConfigValue("SUPABASE_URL", "https://unconfigured.invalid")}\""
        )
        buildConfigField(
            type = "String",
            name = "SUPABASE_ANON_KEY",
            value = "\"${resolveConfigValue("SUPABASE_ANON_KEY", "unconfigured")}\""
        )
        buildConfigField(
            type = "String",
            name = "GITHUB_REPO",
            value = "\"${resolveConfigValue("GITHUB_REPO", "OWNER/WhiteLabelCommerce")}\""
        )
    }

    flavorDimensions += "distribution"

    productFlavors {
        create("github") {
            dimension = "distribution"
            isDefault = true
            buildConfigField("Boolean", "ENABLE_GITHUB_UPDATER", "true")
        }
        create("playstore") {
            dimension = "distribution"
            buildConfigField("Boolean", "ENABLE_GITHUB_UPDATER", "false")
        }
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = releaseKeystoreFile
                storePassword = releaseKeystorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = when {
                hasReleaseSigning -> signingConfigs.getByName("release")
                isCiEnvironment && isReleaseBuildRequested -> throw GradleException(
                    "Refusing to fall back to debug signing on CI release build.",
                )
                else -> signingConfigs.getByName("debug")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(17))
    }
}

dependencies {
    // AndroidX Core & Lifecycle
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    // Jetpack Compose (Material 3)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.ui.text.google.fonts)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)

    // Navigation & Local Persistence
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.datastore.preferences)

    // Hilt DI
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.androidx.hilt.navigation.compose)

    // Coroutines & Serialization
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)

    // Supabase Kotlin SDK & Ktor OkHttp Engine
    implementation(platform(libs.supabase.bom))
    implementation(libs.supabase.postgrest)
    implementation(libs.supabase.auth)
    implementation(libs.supabase.realtime)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.okhttp)

    // Image Loading
    implementation(libs.coil.compose)

    // Google Play In-App Updates (used by playstore flavor when ENABLE_GITHUB_UPDATER == false)
    implementation(libs.play.app.update)
    implementation(libs.play.app.update.ktx)

    // Firebase Cloud Messaging (BoM 35.2.0)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)

    // Testing
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.ui.test.junit4)
    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)
}
