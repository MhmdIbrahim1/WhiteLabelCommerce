import groovy.json.JsonSlurper
import org.gradle.api.GradleException
import java.io.File
import java.net.URI
import java.util.Properties
import javax.xml.parsers.DocumentBuilderFactory

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.hilt.android)
    alias(libs.plugins.ksp)
}

val resolvedAppIdSuffix = (
    (project.findProperty("appIdSuffix") as? String)
        ?: (project.findProperty("APP_ID_SUFFIX") as? String)
)?.trim()?.trim('"')?.takeIf { it.isNotEmpty() }?.let { raw ->
    if (raw.startsWith(".")) raw else ".$raw"
}

val baseApplicationId = "com.whitelabel.commerce"
val appPackage = baseApplicationId + resolvedAppIdSuffix.orEmpty()
val firebaseConfig = file("google-services.json")
val hasFirebaseClient = firebaseConfig.isFile && run {
    val config = JsonSlurper().parse(firebaseConfig) as Map<*, *>
    (config["client"] as List<*>).any { client ->
        val info = (client as Map<*, *>)["client_info"] as Map<*, *>
        (info["android_client_info"] as? Map<*, *>)?.get("package_name") == appPackage
    }
}
if (hasFirebaseClient) {
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

// Single source of truth for Android release versioning (read by .github/workflows/android-release.yml).
// Must be strictly greater than all previously published GitHub Releases (v1.2.0 = 40, v1.3.0 = 42, v1.3.1 = 43, v1.4.0 = 44).
val defaultVersionCode = 56
val defaultVersionName = "1.6.0"

val resolvedVersionCode = ((project.findProperty("versionCode") ?: project.findProperty("VERSION_CODE")) as? String)
    ?.trim()
    ?.toIntOrNull()
    ?.takeIf { it > 0 }
    ?: defaultVersionCode

val resolvedVersionName = ((project.findProperty("versionName") ?: project.findProperty("VERSION_NAME")) as? String)
    ?.trim()
    ?.takeIf { it.isNotEmpty() }
    ?: defaultVersionName

val NOVA_STORE_ID = "00000000-0000-0000-0000-000000000001"
val resolvedStoreId = resolveConfigValue(
    "storeId",
    resolveConfigValue("STORE_ID", NOVA_STORE_ID),
)

require(Regex("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}").matches(resolvedStoreId)) { "Invalid storeId UUID" }
require(resolvedStoreId.equals(NOVA_STORE_ID, ignoreCase = true) || resolvedAppIdSuffix != null) { "Custom storeId requires appIdSuffix" }
require(resolvedAppIdSuffix?.matches(Regex("([.][a-zA-Z][a-zA-Z0-9_]*)+")) != false) { "Invalid appIdSuffix" }
val isWhiteLabelTenant = resolvedAppIdSuffix != null || !resolvedStoreId.equals(NOVA_STORE_ID, ignoreCase = true)
val resolvedStoreSlug = resolveConfigValue(
    "storeSlug",
    resolveConfigValue("STORE_SLUG", if (isWhiteLabelTenant) "" else "nova-store"),
)
require(resolvedStoreSlug.isEmpty() || Regex("^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$").matches(resolvedStoreSlug)) {
    "Invalid storeSlug"
}
val oauthCallbackScheme = "shopstage"
val oauthCallbackHost = resolvedStoreSlug.ifEmpty { appPackage.lowercase().replace('_', '-') }
val oauthCallbackPath = "/auth-callback"

val resolvedStoreName = (
    (project.findProperty("storeName") as? String)
        ?: (project.findProperty("STORE_NAME") as? String)
)?.trim()?.trim('"')?.takeIf { it.isNotEmpty() } ?: if (isWhiteLabelTenant) "Store" else "Nova Store"

val webStoreBaseUrl = resolveConfigValue("WEB_STORE_BASE_URL", "http://10.0.2.2:3000")

fun validReleaseStorefrontOrigin(raw: String, storeSlug: String): Boolean {
    val uri = runCatching { URI(raw) }.getOrNull() ?: return false
    val host = uri.host?.lowercase() ?: return false
    // Production storefront routing accepts DNS names. Localhost and IP literals are for development.
    val suffix = host.substringAfterLast('.')
    val publicHost = '.' in host && host.length <= 253 &&
        suffix.matches(Regex("[a-z]{2,63}|xn--[a-z0-9-]{1,58}[a-z0-9]")) &&
        suffix !in setOf("localhost", "local", "internal", "invalid") &&
        host != "home.arpa" && !host.endsWith(".home.arpa")
    val path = uri.rawPath.removeSuffix("/")
    return uri.scheme.equals("https", ignoreCase = true) && publicHost &&
        uri.port in setOf(-1, 80, 443) && !uri.rawAuthority.endsWith(':') &&
        uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null &&
        (path.isEmpty() || (storeSlug.isNotEmpty() && path == "/s/$storeSlug"))
}

val validateReleaseStorefrontOrigin = tasks.register("validateReleaseStorefrontOrigin") {
    val validOrigin = validReleaseStorefrontOrigin(webStoreBaseUrl, resolvedStoreSlug)
    doLast {
        if (!validOrigin) throw GradleException(
            "Set WEB_STORE_BASE_URL to the public HTTPS storefront origin before building a release.",
        )
    }
}

// Debug builds may point checkout at the emulator while still opening published storefront links.
val linkRootHost = if (validReleaseStorefrontOrigin(webStoreBaseUrl, resolvedStoreSlug)) {
    val host = URI(webStoreBaseUrl).host.lowercase()
    if (resolvedStoreSlug.isEmpty()) host else host.removePrefix("$resolvedStoreSlug.")
} else "shopstage.live"
val linkTenantHost = if (resolvedStoreSlug.isEmpty()) linkRootHost else "$resolvedStoreSlug.$linkRootHost"
val linkTenantPath = if (resolvedStoreSlug.isEmpty()) "/products/" else "/s/$resolvedStoreSlug/products/"

androidComponents.onVariants(androidComponents.selector().withBuildType("release")) { variant ->
    variant.lifecycleTasks.registerPreBuild(validateReleaseStorefrontOrigin)
}

android {
    namespace = "com.whitelabel.commerce"
    compileSdk = 35

    defaultConfig {
        applicationId = baseApplicationId
        if (resolvedAppIdSuffix != null) {
            applicationIdSuffix = resolvedAppIdSuffix
        }
        minSdk = 24
        targetSdk = 35
        versionCode = resolvedVersionCode
        versionName = resolvedVersionName

        // The manifest merger XML-escapes the placeholder when serializing the attribute.
        manifestPlaceholders["appName"] = resolvedStoreName
        manifestPlaceholders["linkTenantHost"] = linkTenantHost
        manifestPlaceholders["linkRootHost"] = linkRootHost
        manifestPlaceholders["linkTenantPath"] = linkTenantPath
        manifestPlaceholders["oauthCallbackScheme"] = oauthCallbackScheme
        manifestPlaceholders["oauthCallbackHost"] = oauthCallbackHost
        manifestPlaceholders["oauthCallbackPath"] = oauthCallbackPath
        buildConfigField("String", "OAUTH_CALLBACK_SCHEME", "\"$oauthCallbackScheme\"")
        buildConfigField("String", "OAUTH_CALLBACK_HOST", "\"$oauthCallbackHost\"")
        buildConfigField("String", "OAUTH_CALLBACK_PATH", "\"$oauthCallbackPath\"")
        buildConfigField("String", "LINK_ROOT_HOST", "\"$linkRootHost\"")

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        vectorDrawables {
            useSupportLibrary = true
        }

        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"${resolveConfigValue("GOOGLE_WEB_CLIENT_ID", "")}\"")
        buildConfigField("String", "STORE_ID", "\"$resolvedStoreId\"")
        buildConfigField("String", "STORE_SLUG", "\"$resolvedStoreSlug\"")
        buildConfigField("Boolean", "IS_WHITE_LABEL_TENANT", isWhiteLabelTenant.toString())
        buildConfigField("String", "WEB_STORE_BASE_URL", "\"$webStoreBaseUrl\"")
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
    implementation(libs.androidx.browser)

    // Native Sign in with Google
    implementation(libs.androidx.credentials.core)
    implementation(libs.androidx.credentials.play.services.auth)
    implementation(libs.google.id)

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
    implementation(libs.play.services.location)

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

val verifyReleaseStorefrontOriginContract = tasks.register("verifyReleaseStorefrontOriginContract") {
    doLast {
        val slug = "nova-store"
        listOf(
            "https://shopstage.live", "https://shopstage.live:443/s/$slug/", "https://$slug.shopstage.live/",
        ).forEach { check(validReleaseStorefrontOrigin(it, slug)) { "Expected a valid storefront origin: $it" } }
        listOf(
            "", "http://127.0.0.1:3000", "http://shopstage.live", "https://127.0.0.1",
            "https://[::1]", "https://10.0.2.2", "https://$slug.localhost", "https://localhost",
            "https://user@shopstage.live", "https://shopstage.live/?q=1", "https://shopstage.live/#section",
            "https://shopstage.live/s/another-store",
        ).forEach { check(!validReleaseStorefrontOrigin(it, slug)) { "Expected an invalid storefront origin: $it" } }
    }
}
tasks.named("check") { dependsOn(verifyReleaseStorefrontOriginContract) }

// End-to-end contract check for the workflow inputs consumed by the Android
// manifest merger. Invoke with the same -PstoreName/-PVERSION_* arguments used
// by build-store-apk.yml; special characters must round-trip as raw text.
tasks.register("verifyGithubDebugManifestContract") {
    val mergedManifest = tasks.named("processGithubDebugMainManifest").map {
        it.outputs.files.asFileTree.matching { include("**/AndroidManifest.xml") }.singleFile
    }
    dependsOn("processGithubDebugMainManifest")
    doLast {
        val document = DocumentBuilderFactory.newInstance().apply {
            isNamespaceAware = true
        }.newDocumentBuilder().parse(mergedManifest.get())
        val androidNamespace = "http://schemas.android.com/apk/res/android"
        val manifest = document.documentElement
        val application = document.getElementsByTagName("application").item(0)
            ?: throw GradleException("Merged manifest has no <application> element.")
        val actualLabel = application.attributes
            .getNamedItemNS(androidNamespace, "label")?.nodeValue.orEmpty()
        val actualVersionCode = manifest.getAttributeNS(androidNamespace, "versionCode")
        val actualVersionName = manifest.getAttributeNS(androidNamespace, "versionName")

        val linkData = document.getElementsByTagName("data")
        val routes = (0 until linkData.length).map { linkData.item(it) as org.w3c.dom.Element }
        val oauthRoute = routes.single { it.getAttributeNS(androidNamespace, "scheme") == oauthCallbackScheme }
        check(oauthRoute.getAttributeNS(androidNamespace, "host") == oauthCallbackHost &&
            oauthRoute.getAttributeNS(androidNamespace, "path") == oauthCallbackPath) {
            "Merged manifest must match $oauthCallbackScheme://$oauthCallbackHost$oauthCallbackPath"
        }
        val productRoutes = routes
            .filter { it.getAttributeNS(androidNamespace, "scheme") == "https" }
            .map { it.getAttributeNS(androidNamespace, "host") to it.getAttributeNS(androidNamespace, "pathPrefix") }
        check(linkTenantHost to "/products/" in productRoutes && linkRootHost to linkTenantPath in productRoutes) {
            "Merged manifest is missing a tenant product URL"
        }

        if (actualLabel != resolvedStoreName) {
            throw GradleException(
                "Merged app label mismatch: expected '$resolvedStoreName', found '$actualLabel'.",
            )
        }
        if (actualVersionCode != resolvedVersionCode.toString()) {
            throw GradleException(
                "Merged versionCode mismatch: expected '$resolvedVersionCode', found '$actualVersionCode'.",
            )
        }
        if (actualVersionName != resolvedVersionName) {
            throw GradleException(
                "Merged versionName mismatch: expected '$resolvedVersionName', found '$actualVersionName'.",
            )
        }
        logger.lifecycle(
            "Verified merged manifest label='$actualLabel', versionCode=$actualVersionCode, versionName=$actualVersionName, " +
                "callback=$oauthCallbackScheme://$oauthCallbackHost$oauthCallbackPath",
        )
    }
}
