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
