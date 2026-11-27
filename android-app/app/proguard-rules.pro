# Kotlinx Serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.whitelabel.commerce.core.data.remote.dto.**$$serializer { *; }
-keepclassmembers class com.whitelabel.commerce.core.data.remote.dto.** {
    *** Companion;
}
-keepclasseswithmembers class com.whitelabel.commerce.core.data.remote.dto.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.whitelabel.commerce.core.data.local.**$$serializer { *; }
-keepclassmembers class com.whitelabel.commerce.core.data.local.** {
    *** Companion;
}
-keepclasseswithmembers class com.whitelabel.commerce.core.data.local.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.whitelabel.commerce.core.updater.**$$serializer { *; }
-keepclassmembers class com.whitelabel.commerce.core.updater.** {
    *** Companion;
}
-keepclasseswithmembers class com.whitelabel.commerce.core.updater.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.whitelabel.commerce.core.notifications.**$$serializer { *; }
-keepclassmembers class com.whitelabel.commerce.core.notifications.** {
    *** Companion;
}
-keepclasseswithmembers class com.whitelabel.commerce.core.notifications.** {
    kotlinx.serialization.KSerializer serializer(...);
}

-keep class com.whitelabel.commerce.core.domain.model.HeroConfig { *; }
-keep class com.whitelabel.commerce.core.domain.model.HeroConfig$$serializer { *; }
-keep class com.whitelabel.commerce.core.domain.model.HeroConfig$Companion { *; }
-keep class com.whitelabel.commerce.core.domain.model.PromoBannerCampaign { *; }
-keep class com.whitelabel.commerce.core.domain.model.PromoBannerCampaign$$serializer { *; }
-keep class com.whitelabel.commerce.core.domain.model.PromoBannerCampaign$Companion { *; }

# Credential Manager's Play Services AAR ships a consumer keep rule for its
# manifest-discovered provider. Keep the Google credential bundle entry point
# and Supabase's serializable id_token grant payload in minified builds.
-keep,allowoptimization class com.google.android.libraries.identity.googleid.GoogleIdTokenCredential { *; }
-keep,allowoptimization class io.github.jan.supabase.auth.providers.builtin.IDToken$Config { *; }
-keep,allowoptimization class io.github.jan.supabase.auth.providers.builtin.IDToken$Config$* { *; }
