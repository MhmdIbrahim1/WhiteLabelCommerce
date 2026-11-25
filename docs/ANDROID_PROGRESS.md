# Native Android App Progress (`android-app/`)

> **Isolation Note:** This log tracks native Android progress independently of `docs/PROGRESS.md` so Android work runs in parallel with `web-store/` without merge conflicts.

| Phase | Status | Scope |
| --- | --- | --- |
| Phase 3 (Core Foundation) | Complete | Gradle Kotlin DSL + Version Catalog, White-Label 60-30-10 Design System (Light/Dark/RTL), Supabase & DataStore Data Layer, Core App Shell & Navigation |
| Phase 4 (Full Storefront UI & Interactive Flows) | Complete (verified build & unit tests) | Home carousel & grid, Catalog search/sort, Product Details with variants, Persistent Cart, COD Checkout & Receipt, Order Tracking Timeline, Customer Support & WhatsApp |

---

## 1. Gradle, SDK & Dependency Setup

- **Application ID / Namespace:** `com.whitelabel.commerce`
- **SDK Targets:** `minSdk = 24`, `compileSdk = 35`, `targetSdk = 35`
- **Build Toolchain:** AGP `8.7.3`, Gradle `8.11.1` (wrapper generated in `android-app/gradlew` + `gradlew.bat`), Kotlin `2.0.21`, KSP `2.0.21-1.0.28`, Java 17 target / JBR 21 build runtime
- **Version Catalog:** `android-app/gradle/libs.versions.toml`
- **Key Dependencies Configured:**
  - **UI:** Jetpack Compose BOM `2024.10.01`, Material 3, Material Icons Extended, Google Downloadable Fonts (`ui-text-google-fonts`)
  - **Navigation:** `androidx.navigation:navigation-compose:2.8.4`
  - **DI:** Hilt `2.52` (KSP compiler) + `hilt-navigation-compose:1.2.0`
  - **Async & Serialization:** Kotlin Coroutines `1.9.0`, `kotlinx-serialization-json:1.7.3`
  - **Backend & Networking:** Supabase Kotlin SDK BOM `3.0.3` (`postgrest-kt`, `auth-kt`, `realtime-kt`) + Ktor OkHttp Engine `3.0.3`
  - **Local Storage:** Jetpack DataStore Preferences `1.1.1`
  - **Images:** Coil Compose `2.7.0`
- **Safe Configuration (`local.properties` -> `BuildConfig`):**
  - `android-app/local.properties` is gitignored via `android-app/.gitignore` and holds `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
  - `android-app/local.properties.example` provides the template for fresh clones/CI.

---

## 2. Phase 3 Core Foundation (Complete)

- **Design System (`core/designsystem/`):**
  - Bundled offline fallback `app/src/main/assets/brand-config.json` + live Supabase `store_settings` override (`StoreRepositoryImpl`).
  - Light & Dark 60-30-10 color system (`Color.kt`), dynamic `border_radius` Material 3 `Shapes` (`Shape.kt`), `IBM Plex Sans Arabic` typography (`Type.kt`), RTL enforcement (`Theme.kt`), currency formatting (`Formatting.kt`).
- **Domain & Data Layer (`core/domain/`, `core/data/`):**
  - Domain models & Supabase DTOs for `StoreSettings`, `Category`, `Product`, `CartItem`, `Order`, `OrderItem`, `SavedOrderReceipt`, `SupportTicket`.
  - Repositories: `StoreRepositoryImpl`, `CatalogRepositoryImpl` (with Phase 1/2 `created_at` fallback), `CartRepositoryImpl` (DataStore), `OrderRepositoryImpl` (trusted `store_checkout` RPC, `track_guest_order` RPC, local DataStore receipts, RLS-safe guest insert without `.select()`), `SupportRepositoryImpl` (RLS-safe insert without `.select()` or staff-only columns + local submitted tickets).

---

## 3. Phase 4 Storefront Screens & Interactive Flows

### Shared Design System Components (`core/designsystem/components/`)
- `ShimmerEffect.kt`: Animated shimmer brush + `BannerSkeleton`, `CategoryChipsSkeletonRow`, `ProductCardSkeleton`.
- `ProductCard.kt`: 4:5 portrait image card (`aspectRatio(0.8f)`) via Coil `SubcomposeAsyncImage`, discount `-XX%` badge, stock pill, strikethrough `old_price`, quick-add CTA.
- `ColorSwatchUtils.kt`: Maps Arabic, English, and `#RRGGBB` hex color names to visual swatch circles.
- `StatusComponents.kt`: `OrderStatusBadge`, `TicketStatusBadge`, `OrderTimelineStepper` (`pending -> confirmed -> shipped -> delivered` + `cancelled`), and `BrandEmptyState`.

### Milestone 1: Home Screen (`feature/home/`)
- **Files:** `HomeViewModel.kt`, `HomeScreen.kt`
- **Bindings:** `StoreRepository`, `CatalogRepository`, `CartRepository`
- **Implemented:** Dynamic TopAppBar store name + Light/Dark toggle + Support shortcut; `PullToRefreshBox`; auto-scrolling `HorizontalPager` promotional banner carousel with animated page indicators (and branded 60-30-10 hero fallback when no banners are configured); horizontal category cards with contextual icons routing into filtered Catalog; 2-column `4:5` latest products grid with quick-add Snackbar and shimmer skeleton loading states.

### Milestone 2: Catalog & Product Details (`feature/catalog/`)
- **Files:** `CatalogViewModel.kt`, `CatalogScreen.kt`, `ProductDetailViewModel.kt`, `ProductDetailScreen.kt`
- **Bindings:** `CatalogRepository`, `CartRepository`
- **Implemented:**
  - **Catalog Screen:** Debounced search bar, horizontal category filter chips (`الكل` + live categories), sort selector (`الأحدث`, `الأقل سعراً`, `الأعلى سعراً`), 2-column product grid with pull-to-refresh and empty state.
  - **Product Details (`/product/{productId}`):** High-res Coil image preview, discount badge, stock status, description, interactive Size chips (`sizes[]`), interactive Color swatches (`colors[]`), stock-bounded quantity stepper, and sticky `"أضف إلى السلة"` CTA bar with `"عرض السلة"` Snackbar action.

### Milestone 3: Persistent Cart & COD Checkout (`feature/cart/`, `feature/checkout/`)
- **Files:** `CartViewModel.kt`, `CartScreen.kt`, `CheckoutViewModel.kt`, `CheckoutScreen.kt`
- **Bindings:** `CartRepository`, `StoreRepository`, `OrderRepository`
- **Implemented:**
  - **Cart Screen:** Persistent DataStore items with thumbnails, size/color variant tags, quantity steppers, delete/clear controls, subtotal, dynamic `shipping_fee` from `store_settings`, grand total in `EGP` (`ج.م`), and sticky `"إتمام الطلب"` CTA.
  - **Checkout Screen:** Customer full name, Egyptian mobile validation (`010/011/012/015` & `+201...` / Arabic-Indic numerals normalized via `PhoneNormalizer`), full delivery address, `COD` payment selection (with disabled `CARD` teaser matching `web-store`), idempotent `request_key` calling `public.store_checkout` RPC, and Arabic error mapping.
  - **Order Confirmation Receipt:** Displays generated `order_number` with one-tap copy button, itemized receipt summary, `"تتبع الطلب"` deep-handoff into Orders, and automatic local DataStore receipt save + cart clear.

### Milestone 4: Order Tracking & Customer Support (`feature/orders/`, `feature/support/`)
- **Files:** `OrdersViewModel.kt`, `OrdersScreen.kt`, `SupportViewModel.kt`, `SupportScreen.kt`
- **Bindings:** `OrderRepository`, `SupportRepository`, `StoreRepository`
- **Implemented:**
  - **Order Tracking Screen:** Search by `order_number` + phone calling `public.track_guest_order` RPC, visual step-by-step `OrderTimelineStepper`, itemized receipt display, persistent on-device saved order history via DataStore with one-tap live status refresh & copy, plus authenticated account orders when signed in.
  - **Support Screen (`/support?orderId={orderId}`):** Quick WhatsApp deep-link (`https://wa.me/...` from `store_settings.whatsapp_number`), support email action, RLS-compliant support ticket submission with optional order reference (and quick-select chips from recent local orders), and ticket history showing status badges & merchant `admin_reply`.

### Navigation & App Shell (`app/navigation/`)
- **Files:** `AppDestination.kt`, `WhiteLabelAppShell.kt`
- **Routes:** `home`, `categories`, `cart`, `orders`, `product/{productId}`, `checkout`, `support?orderId={orderId}` with live cart badge on `السلة`, root SnackbarHost, and cross-tab handoffs (Home -> filtered Catalog, Order Confirmation -> live Order Tracking, Orders -> Support linked to Order ID).

---

## 4. Build & Test Verification Status

- **Command:** `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon` (Gradle `8.11.1`, auto-provisioned JDK 17 toolchain via Foojay resolver, Android SDK `35`)
- **Compilation:** Passed (`:app:kspDebugKotlin`, `:app:compileDebugKotlin`, `:app:hiltJavaCompileDebug`, `:app:assembleDebug`) with **0 errors and 0 Kotlin compiler warnings**.
- **Debug APK Output:** `android-app/app/build/outputs/apk/debug/app-debug.apk` (`21.6 MB`).
- **Unit Tests (`testDebugUnitTest`): 10 / 10 passed (0 failures, 0 errors):**
  - `PhoneNormalizerTest` — 3 passed (Arabic-Indic digits, Egyptian mobile validation `010/011/012/015` & `+201...`, WhatsApp formatting, length bounds)
  - `BrandColorParserTest` — 3 passed (hex parsing, fallback safety, Light/Dark 60-30-10 color scheme generation)
  - `ColorSwatchMapperTest` — 1 passed (Arabic, English, and `#RRGGBB` swatch resolution)
  - `ProductModelTest` — 2 passed (discount calculation, variant-aware `CartItem.lineKey` & totals)
  - `CatalogSortingTest` — 1 passed (price low-to-high and high-to-low sorting)

## 5. Next Steps (Android Studio / Emulator Acceptance)

1. Open `WhiteLabelCommerce/android-app` in Android Studio (or install `app-debug.apk` via `adb install -r android-app/app/build/outputs/apk/debug/app-debug.apk`).
2. Optional font certs: populate official Google Play Services certificates in `app/src/main/res/values/font_certs.xml` via Android Studio Resource Manager (`IBM Plex Sans Arabic`) or drop `.ttf` weights into `app/src/main/res/font/`.
3. End-to-end live verification against Supabase (after `shared/phase-2-storefront.sql` is applied in Supabase SQL Editor): browse catalog, select size/color variants, add to cart, complete a COD order, copy the UUID, track it in `طلباتي`, and submit a support ticket / open WhatsApp.


---

## 6. Phases 8b, 9 & 10 Feature Parity, Dual-Flavor CI/CD & Smart Notifications (2026-11-24)

| Milestone | Status | Scope |
| --- | --- | --- |
| Phase 8b (Storefront Parity & Paymob) | Complete | Multi-tenant DataStore key isolation (`BuildConfig.STORE_ID`), Dynamic Hero Banner CMS, `search_products_fast` smart bilingual search + LRU cache + 15-category synonyms, Apple/Zara bilingual specs table + `SizeGuideSheet`, Paymob Card & Wallet WebView with cart protection & retry banners |
| Dual-Flavor Distribution & Self-Updater | Complete | `github` (`ENABLE_GITHUB_UPDATER = true`, GitHub Releases APK updater) vs `playstore` (`ENABLE_GITHUB_UPDATER = false`, Google Play In-App Updates) product flavors, `.github/workflows/android-release.yml`, release signing & ProGuard rules |
| Phase 9 & 10 (Auth, Locations, COD & Carousel) | Complete | Unified customer auth (`AuthScreen`, `AccountScreen`, `DataStoreSessionManager`), release `WEB_STORE_BASE_URL` + flavor `network_security_config.xml` + 15s WebView/OkHttp timeout, 27-governorate cascading `EgyptAddressPicker`, Home Search Bar, COD Retry Fallback (`switch_order_to_cod`), Animated `OrderTimelineStepper`, Multi-Banner `HorizontalPager` Carousel |
| Phase 9 Smart Notification Engine (FCM + Realtime) | Complete | `firebase-bom:35.2.0` + `firebase-messaging`, conditional `google-services` plugin, `POST_NOTIFICATIONS` Android 13+ permission, `orders_channel` & `promotions_channel`, `push_subscriptions` token sync on startup/login/locale switch, deep-link routing, Top-Bar Notification Bell + `NotificationsScreen.kt` Supabase Realtime inbox, out-of-stock "Notify Me" on `ProductDetailScreen.kt` |

### 6.1 Release Payment Gateway Config, LAN Security & Timeouts
- **Release `WEB_STORE_BASE_URL`:** Configured in `android-app/app/build.gradle.kts` (`BuildConfig.WEB_STORE_BASE_URL`) and injected in CI from `${{ secrets.WEB_STORE_BASE_URL || vars.WEB_STORE_BASE_URL }}`.
- **Flavor-Specific Network Security (`network_security_config.xml`):**
  - `github` flavor permits cleartext local LAN testing with a strict runtime host allowlist in `PaymentFlow.kt`.
  - `playstore` flavor enforces strict HTTPS-only transport (`cleartextTrafficPermitted="false"`).
- **15-Second Timeout Hardening (`PaymentFlow.kt`):** Enforced 15-second OkHttp connect/read/write timeouts and a 15-second WebView load watchdog with main-frame error handling and localized **Retry** / **Switch to Cash on Delivery** actions.

### 6.2 Cascading Egypt Addresses, Home Search, COD Retry, Animated Tracker & Banner Carousel
- **27-Governorate Cascading Egypt Addresses (`EgyptLocations.kt`, `EgyptAddressPicker.kt`):** Bilingual (`AR`/`EN`) dataset of all 27 governorates and cities/districts integrated into Checkout and Account saved profile forms with searchable picker and automatic city reset on governorate change.
- **Home Screen Search Bar (`HomeViewModel.kt`, `HomeScreen.kt`):** Top-of-Home bilingual search bar combining 0ms local fuzzy filtering with 180ms debounced `search_products_fast` full-catalog search and inline results.
- **Cash on Delivery (`COD`) Retry Fallback (`OrdersScreen.kt`, `PaymentFlow.kt`):** Retry Payment sheet offers **Bank Card**, **Mobile Wallet**, and **Cash on Delivery** (calling `public.switch_order_to_cod` RPC to set `payment_method = 'cod'`, `payment_status = 'cod_pending'`, `status = 'confirmed'`).
- **Animated Order Status Tracker (`StatusComponents.kt`):** `OrderTimelineStepper` upgraded with `animateFloatAsState` progress rail, `rememberInfiniteTransition` active-stage pulsing halo, `AnimatedContent` checkmarks, and localized Bosta/Aramex/Mylerz/Egypt Post tracking badges.
- **Multi-Banner `HorizontalPager` Carousel (`HomeScreen.kt`, `StoreSettings.kt`):** Renders `ui_config.pages.home.promo_banners` with `graphicsLayer` scale/alpha transitions, touch-pausing auto-scroll, expanding dot indicators, and category/product deep-link routing (backward-compatible with single Hero Banner).

### 6.3 Phase 9 Smart Notification Engine (FCM + Supabase Realtime + Back-in-Stock)
- **Gradle & Secret Hygiene (`libs.versions.toml`, `build.gradle.kts`, `app/build.gradle.kts`, `.gitignore`, `proguard-rules.pro`):**
  - Added `com.google.firebase:firebase-bom:35.2.0` and `com.google.firebase:firebase-messaging` (main module, NOT deprecated `-ktx`), plus `com.google.gms.google-services:4.4.2` applied conditionally (`if (file("google-services.json").exists())`) so local debug builds pass without secret files while CI builds with decoded Firebase config enable full FCM.
  - Added `android-app/app/google-services.json` and `**/google-services.json` to `.gitignore` and `android-app/.gitignore`.
  - Updated `.github/workflows/android-release.yml` to decode `secrets.GOOGLE_SERVICES_JSON_BASE64` into `android-app/app/google-services.json` before Gradle runs.
  - Added Kotlinx Serialization ProGuard keep rules for `com.whitelabel.commerce.core.notifications.**`.
- **Android 13+ Permission, Channels & FCM Service (`AndroidManifest.xml`, `WhiteLabelCommerceApp.kt`, `MainActivity.kt`, `core/notifications/`):**
  - Declared `android.permission.POST_NOTIFICATIONS`, `default_notification_channel_id` (`orders_channel`), and `CommerceFirebaseMessagingService` (`com.google.firebase.MESSAGING_EVENT`).
  - `NotificationChannels.ensureCreated(this)` creates high-importance `orders_channel` and default-importance `promotions_channel` on app startup.
  - `MainActivity` requests `POST_NOTIFICATIONS` on Android 13+ (`Build.VERSION_CODES.TIRAMISU`), extracts `deep_link` extras on cold start & `onNewIntent`, and passes `pendingDeepLink` into `WhiteLabelAppShell`.
  - `FcmTokenManager` safely checks `FirebaseApp.getApps(context).isNotEmpty()`, retrieves the FCM registration token, and syncs it via `public.register_push_subscription` RPC on startup, auth session changes (linking `user_id` + `phone` on login), and language toggles (`ar`/`en`).
  - `CommerceFirebaseMessagingService` handles `onNewToken` and foreground/data `onMessageReceived` payloads, posting localized notifications to the appropriate channel with a `PendingIntent` carrying `deep_link` to `MainActivity`.
- **Realtime Inbox, Top-Bar Bell & Back-in-Stock (`NotificationRepositoryImpl.kt`, `WhiteLabelAppShell.kt`, `feature/notifications/`, `ProductDetailScreen.kt`):**
  - `NotificationRepositoryImpl` loads `public.notifications` scoped to `BuildConfig.STORE_ID`, subscribes to live `INSERT` events via Supabase Realtime (`postgresChangeFlow<PostgresAction.Insert>`), tracks read state (persisting server-side for signed-in users and locally in DataStore for public broadcasts), and calls `subscribe_back_in_stock` RPC.
  - `WhiteLabelAppShell` renders a TopAppBar Notification Bell with a Material 3 `BadgedBox` live unread counter and routes deep links (`/`, `/products`, `/products/{id}`, `/products?category=...`, `/cart`, `/orders`, `/account`, `/support`) from both push taps and inbox taps.
  - `NotificationsScreen.kt` + `NotificationsViewModel.kt` provide a 100% bilingual (`AR` RTL / `EN` LTR) notification center with refresh, mark-all-read, category icons, unread indicator dots, and tap-to-navigate deep linking.
  - `ProductDetailScreen.kt` + `ProductDetailViewModel.kt` display a bilingual **"نبّهني عند التوفر / Notify Me When Available"** restock alert card on out-of-stock products (with optional phone input + automatic FCM token attachment).

### 6.4 Latest Build Verification (2026-11-24)
- **Command:** `$env:JAVA_HOME='C:\Users\moham\.jdks\jbr-21.0.11'; .\gradlew.bat assembleGithubDebug assemblePlaystoreDebug --no-daemon`
- **Result:** `BUILD SUCCESSFUL` across both `github` and `playstore` product flavors with `firebase-bom:35.2.0`, `firebase-messaging`, Hilt DI, and Supabase Realtime.


### 6.5 `v1.1.0` Release Bump & Tag-Triggered CI Pipeline (2026-11-25)
- **Local Firebase Config & CI Secret:** Copied `google-services.json` (`com.whitelabel.commerce`, project `novasaas-4c25d`) into gitignored `android-app/app/google-services.json` and uploaded its Base64 payload to GitHub Actions secret `GOOGLE_SERVICES_JSON_BASE64`.
- **Version Bump (`android-app/app/build.gradle.kts`):** Bumped default `versionCode` to `20` (strictly above `v1.0.9`'s `versionCode = 19`) and `versionName` to `"1.1.0"` so installed `1.0.9` clients detect and install the Phase 9 FCM update via the GitHub Releases self-updater.
- **Tag-Aware Release Workflow (`.github/workflows/android-release.yml`):** Added `tags: ["v*"]` under `on.push` so pushing tag `v1.1.0` builds `versionName = 1.1.0` (`versionCode = github.run_number + 20`) with decoded `google-services.json` and publishes `WhiteLabelCommerce v1.1.0` as the latest GitHub Release.


### 6.6 Realtime `DELETE` Sync, Broadcast `read_at` RPC & Push-Tap Auto-Read (2026-11-25)
- **Realtime Inbox Management (`NotificationRepositoryImpl.kt`, `NotificationsViewModel.kt`, `NotificationsScreen.kt`, `AppNotification.kt`):**
  - Added `read_at` mapping on `NotificationDto` (`isRead = isRead || !readAt.isNullOrBlank()`).
  - Upgraded `NotificationRepositoryImpl` to subscribe to Supabase Realtime `PostgresAction.Delete` and `PostgresAction.Update` alongside `Insert` so notifications deleted from `/admin/notifications` immediately vanish from the Android inbox and decrement the badge counter.
  - Wired `markAsRead(id)` and `markAllAsRead()` to call the `public.mark_notifications_read` `SECURITY DEFINER` RPC so both personal notifications and broadcast promo campaigns (`user_id IS NULL`) persist `read_at` in Supabase.
  - Added `deleteNotification(id)` and `clearAllNotifications()` in the repository/ViewModel plus per-item Delete icon buttons (`Icons.Rounded.DeleteOutline`) and a TopAppBar **"مسح الكل / Clear All"** action with bilingual confirmation dialog in `NotificationsScreen.kt`.
- **External Push Tap Auto-Read (`CommerceFirebaseMessagingService.kt`, `MainActivity.kt`, `MainViewModel.kt`):**
  - `MainActivity` extracts `notification_id` (`NotificationChannels.EXTRA_NOTIFICATION_ID`) from both cold-start `intent` and `onNewIntent` and invokes `mainViewModel.markNotificationRead(notifId)` so tapping an OS push notification immediately marks it as read in Supabase.
- **Build Verification:** `$env:JAVA_HOME='C:\Users\moham\.jdks\jbr-21.0.11'; .\gradlew.bat assembleGithubDebug assemblePlaystoreDebug --no-daemon` passed (`BUILD SUCCESSFUL`, 0 errors) across both `github` and `playstore` flavors with `google-services.json` processed.


### 6.7 Pure Compose Animated Multi-Slide Hero Carousel & `v1.1.1` Release (2026-11-25)
- **Native Jetpack Compose `HorizontalPager` Hero Carousel (`HomeScreen.kt`, `StoreSettings.kt`, `WhiteLabelAppShell.kt`, `CatalogViewModel.kt`):**
  - Upgraded `MultiCampaignPromoCarousel` using pure Compose Foundation `HorizontalPager` (zero external pager libraries) with horizontal `contentPadding = PaddingValues(horizontal = 14.dp)` peek edges (`beyondViewportPageCount = 1`).
  - Added fluid `graphicsLayer` motion driven by `pagerState.getOffsetDistanceInPages(page)`: smooth card scale (`0.93f -> 1f`), alpha fade (`0.72f -> 1f`), background image parallax (`scale = 1.10f` + directional `translationX`), and subtle RTL/LTR-aware inner content parallax.
  - Upgraded smart auto-play inside `LaunchedEffect` honoring `bannerSpeedMs` / `banner_autoplay_seconds` (default `4500ms`), advancing via `animateScrollToPage(..., animationSpec = tween(650, easing = FastOutSlowInEasing))`, pausing automatically while `pagerState.isScrollInProgress` is true, and supporting RTL (Arabic) & LTR (English) natively.
  - Upgraded expanding-width (`animateDpAsState`) pill indicators tinted with `MaterialTheme.colorScheme.primary` with tap-to-jump navigation.
  - Enhanced deep-link routing in `WhiteLabelAppShell.handleHeroRoute` and `CatalogViewModel.applyExternalCategory` to route `/product/{id}`, `/products/{id}`, `/category/{idOrSlug}`, `/products?category={id}`, `/cart`, `/orders`, and `/offers` seamlessly.
  - Added `heroCarouselDecodesPromoBannersAndAutoplaySettings` unit test in `PublishedSettingsTest.kt`.
- **Release `v1.1.1` Version Bump (`android-app/app/build.gradle.kts`):**
  - Bumped default `versionCode` to `21` and `versionName` to `"1.1.1"` (bundling Phase 9c/9d notification read/delete sync + the new Compose Multi-Slide Hero Carousel) and pushed release tag `v1.1.1` to trigger GitHub Actions signed APK publication.
- **Build & Test Verification:** `$env:JAVA_HOME='C:\Users\moham\.jdks\jbr-21.0.11'; .\gradlew.bat testGithubDebugUnitTest assembleGithubDebug assemblePlaystoreDebug --no-daemon` passed (`BUILD SUCCESSFUL`, 0 errors) across both `github` and `playstore` flavors.


### 6.8 Phase 10A: Guest Switch-to-COD UX, Free-Shipping Cart Progress Bar, Store Credit / Cashback Wallet & `v1.1.2` Release (2026-11-25)
- **Guest "Switch to COD" Actionable UX (`OrdersViewModel.kt`, `OrdersScreen.kt`, `WhiteLabelAppShell.kt`):**
  - Exposed live `isSignedIn` state and `SwitchToCodOutcome` (`Success`, `RequiresSignIn`, `Failure`) in `OrdersViewModel`.
  - When an unauthenticated guest taps "تحويل إلى الدفع عند الاستلام / Cash on Delivery" on an unpaid card order, displays an actionable bilingual prompt (`"سجّل الدخول أولاً لتغيير طريقة الدفع"` / `"Please sign in first to switch payment method"`) with both an inline banner and Snackbar **"تسجيل الدخول / Sign In"** button routing directly to `AccountScreen`.
- **Gamified Free-Shipping Cart Progress Bar (`StoreSettings.kt`, `StoreSettingsDto.kt`, `FreeShippingProgressBar.kt`, `CartViewModel.kt`, `CartScreen.kt`, `CheckoutScreen.kt`):**
  - Decoded `cart_incentive_enabled`, `free_shipping_threshold`, `cashback_enabled`, and `cashback_percentage` from `store_settings` with `effectiveShippingFee(subtotal)` helper.
  - Built animated Material 3 `FreeShippingProgressBar` (`animateFloatAsState` fill + emerald celebration transition at threshold) rendered at the top of `CartScreen` and `CheckoutScreen`, updating shipping to `مجاني / Free` (`0 EGP`) in sync with server-side `store_checkout` / `mobile_checkout`.
- **Store Credit & Cashback Wallet (`WalletModels.kt`, `WalletDto.kt`, `WalletRepository.kt`, `WalletRepositoryImpl.kt`, `RepositoryModule.kt`, `AccountViewModel.kt`, `AccountScreen.kt`, `CheckoutViewModel.kt`, `CheckoutScreen.kt`, `Order.kt`, `OrderDto.kt`, `OrderRepositoryImpl.kt`):**
  - Added `WalletRepositoryImpl` calling `public.get_customer_wallet_summary(p_store_id, p_user_id)` RPC and bound it in Hilt `RepositoryModule`.
  - Added a premium **Wallet Balance Card & Bilingual Transaction History** in `AccountScreen.kt` showing available balance, live cashback rate badge, and signed credit/debit ledger rows.
  - Added an opt-in **"استخدام رصيد المحفظة / Use Wallet Credit"** `Switch` card on `CheckoutScreen.kt` passing `p_use_wallet` to `mobile_checkout`, deducting `min(walletBalance, preWalletTotal)` live, and completing zero-remaining orders directly as **Paid via Store Wallet** (`PaymentMethod.STORE_WALLET`, skipping Paymob WebView).
- **Unit Tests & Release `v1.1.2` (`WalletAndIncentivesTest.kt`, `app/build.gradle.kts`):**
  - Added 4 JUnit tests in `WalletAndIncentivesTest.kt` verifying free-shipping threshold math, disabled-incentive behavior, `StoreSettingsDto` Phase 10A field decoding, and `WalletSummaryDto` decoding.
  - Bumped default `versionCode` to `22` and `versionName` to `"1.1.2"`.
- **Build & Test Verification:** `$env:JAVA_HOME='C:\Users\moham\.jdks\jbr-21.0.11'; .\gradlew.bat testGithubDebugUnitTest assembleGithubDebug assemblePlaystoreDebug --no-daemon` passed (`BUILD SUCCESSFUL`, 0 errors) across both `github` and `playstore` flavors.


### 6.9 Phase 10B: White-Label Multi-Tenant Build Parameterization (2026-11-25)
- **Parameterized Gradle White-Label Builds (`android-app/app/build.gradle.kts`, `AndroidManifest.xml`):**
  - Added optional Gradle CLI properties so any merchant's white-label APK can be built from the single Android codebase while defaulting strictly to `Nova Store` (`00000000-0000-0000-0000-000000000001`, `com.whitelabel.commerce`) when omitted:
    - `-PstoreId=<uuid>` -> `BuildConfig.STORE_ID` (preserving backward-compatible `-PSTORE_ID` / `local.properties` resolution)
    - `-PstoreName="<Name>"` -> `manifestPlaceholders["appName"]` wired to `android:label="${appName}"` in `AndroidManifest.xml` (default `"Nova Store"`)
    - `-PappIdSuffix=.<slug>` -> optional `applicationIdSuffix` (omitted when unset so default package ID remains `com.whitelabel.commerce`)
  - No version bump or release tag in Phase 10B (reserved for Phase 10C Reviews & Wishlist).
- **Build & Test Verification:** `$env:JAVA_HOME='C:\Users\moham\.jdks\jbr-21.0.11'; .\gradlew.bat testGithubDebugUnitTest assembleGithubDebug --no-daemon` passed (`BUILD SUCCESSFUL`, 0 errors) with zero Gradle parameters passed.



### 6.10 Phase 10C: Native Verified Product Reviews, Cloud Wishlist & `v1.2.0` Release (2026-11-25)
- **Domain, DTOs & Repositories (`core/domain/`, `core/data/`):**
  - Extended `Product` and `ProductDto` with `avgRating` / `reviewCount` (`avg_rating` / `review_count`, safe defaults `0.0` / `0`, plus `hasReviews` and `formattedRating`).
  - Added `ReviewModels.kt`, `WishlistModels.kt`, `ReviewDto.kt`, `WishlistDto.kt`, `ReviewRepository`, `ReviewRepositoryImpl`, `WishlistRepository`, and `WishlistRepositoryImpl` strictly scoped to `BuildConfig.STORE_ID` and bound in Hilt `RepositoryModule`.
  - Wired `MainViewModel` and `MainActivity` to track and sync `wishlistCount` on startup and auth session transitions.
- **Compose Material 3 UI (`ProductCard.kt`, `WhiteLabelAppShell.kt`, `HomeScreen.kt`, `CatalogScreen.kt`, `ProductDetailScreen.kt`, `ProductReviewsSection.kt`, `WishlistScreen.kt`, `AccountScreen.kt`):**
  - Upgraded `ProductCard` with a compact warm-amber rating pill (`★ 4.5 (2)`) shown only when `reviewCount > 0` and an animated translucent circular `WishlistHeartIconButton` (`#E11D48` active rose fill + spring bounce scale) mirrored via `Alignment.TopEnd`.
  - Added TopAppBar Heart icon with live `BadgedBox` count badge, `/wishlist` deep-link handling, guest sign-in snackbar prompt, dedicated **Wishlist (`المفضلة`)** screen (`WishlistScreen.kt` + `WishlistViewModel.kt`) with Add-to-Cart, instant Remove, and empty/guest states, plus a Wishlist shortcut card inside `AccountScreen`.
  - Added full Verified Reviews section (`ProductReviewsSection.kt`) on `ProductDetailScreen.kt`: rating summary card with `5★`–`1★` distribution bars, clickable star filter chips, emerald Verified Purchase badges, indented Store Reply card with logical start accent bar, calm eligibility info note, and a Material 3 `ModalBottomSheet` (`WriteReviewBottomSheet`) with `48dp` tactile stars and live AR/EN captions.
- **Unit Tests & Release `v1.2.0` (`ReviewsAndWishlistTest.kt`, `app/build.gradle.kts`):**
  - Added 4 JUnit tests in `ReviewsAndWishlistTest.kt` covering `ProductDto` rating aggregates/defaults, `ReviewEligibilityDto` & `ProductReviewDto` deserialization, `ToggleWishlistResultDto`, and `ReviewFormatting` stats & bilingual labels.
  - Bumped default release version in `android-app/app/build.gradle.kts` to **`versionCode = 23`** and **`versionName = "1.2.0"`** while keeping all Phase 10B white-label Gradle properties (`-PstoreId`, `-PstoreName`, `-PappIdSuffix`) intact.
- **Build & Test Verification:** `$env:JAVA_HOME='C:\Users\moham\.jdks\jbr-21.0.11'; .\gradlew.bat testGithubDebugUnitTest assembleGithubDebug assemblePlaystoreDebug --no-daemon` passed (`BUILD SUCCESSFUL`, 0 errors) across both `github` and `playstore` flavors.

### 6.11 Phase 11A: Native AOV Boost Engine (Flash Sales, Related Products & Smart Cart Upsells) & `v1.3.0` Release (2026-11-25)
- **Domain, DTOs & Multi-Tenant Repositories (`core/domain/`, `core/data/`):**
  - Extended `Product.kt` & `ProductDto.kt` with backward-compatible nullable `flashSalePrice`, `flashSaleStartsAt`, `flashSaleEndsAt`, API-24-safe `FlashSalePricing` ISO-8601 parser & bilingual countdown formatter, and `isFlashSaleActive(nowMillis)`, `effectivePrice(nowMillis)`, `flashSavingsPercent(nowMillis)`, and `displayStrikePrice(nowMillis)` helpers.
  - Extended `CartItem.kt`, `CartItemEntity.kt`, and `CartRepositoryImpl.kt` to persist flash pricing metadata and compute `effectiveUnitPrice()` / `lineTotal` dynamically so Cart totals, `FreeShippingProgressBar`, and Checkout summaries always reflect active flash pricing and revert automatically upon expiry.
  - Added `getRelatedProducts(productId, limit)` and `getCartUpsellProducts(cartProductIds, gapAmount, limit)` in `CatalogRepository` / `CatalogRepositoryImpl`, strictly scoped to `BuildConfig.STORE_ID`.
- **Compose Material 3 UI (`FlashSaleCountdownPill.kt`, `ProductCard.kt`, `HomeScreen.kt`, `ProductDetailScreen.kt`, `ProductDetailViewModel.kt`, `WhiteLabelAppShell.kt`, `CartScreen.kt`, `CartViewModel.kt`):**
  - Created `FlashSaleCountdownPill.kt` with an isolated 1-second `LaunchedEffect` ticker (preventing parent list recomposition), `tnum` tabular figures, forced-LTR time segment for clean RTL/LTR layout, and automatic `onExpired` callback.
  - Upgraded `ProductCard` and `ProductDetailScreen` with crimson `⚡ -XX%` flash badges, flash price + strikethrough regular price, and live countdown pills that cleanly revert on expiry.
  - Added conditional **"عروض مؤقتة / Flash Deals"** horizontal `LazyRow` strip on `HomeScreen` (rendered only when active in-stock flash deals exist), **Related Products ("عملاء اشتروا أيضاً / Customers Also Bought")** horizontal row on `ProductDetailScreen`, and **Smart Cart Upsell Strip** directly beneath `FreeShippingProgressBar` on `CartScreen` with one-click `+ أضف / + Add` updating cart & free-shipping progress live.
- **Unit Tests & Release `v1.3.0` (`AovAndFlashSaleTest.kt`, `app/build.gradle.kts`):**
  - Added 4 JUnit tests in `AovAndFlashSaleTest.kt` covering active/scheduled/expired flash sale windows, effective price fallback, savings percentage, AR/EN countdown formatting, `ProductDto` deserialization, and `CartItem` expiry fallback.
  - Bumped default release version in `android-app/app/build.gradle.kts` to **`versionCode = 24`** and **`versionName = "1.3.0"`** while keeping Phase 10B white-label Gradle properties (`-PstoreId`, `-PstoreName`, `-PappIdSuffix`) untouched.
- **Build & Test Verification:** `$env:JAVA_HOME='C:\Users\moham\.jdks\jbr-21.0.11'; .\gradlew.bat testGithubDebugUnitTest assembleGithubDebug assemblePlaystoreDebug --no-daemon` passed (`BUILD SUCCESSFUL`, 0 errors) across both `github` and `playstore` flavors.

### 6.12 Release Versioning Unification, Auto-Updater Hardening & `v1.3.1` Release (2026-11-25)
- **Root Cause Fixed:** Pushing commits to `main` alongside semver release tags (`v1.3.0`) previously triggered two parallel GitHub Actions runs (`push.branches: [main]` + `push.tags: ["v*"]`). The `main` push run finished later and published a synthetic `v1.0.<run_number>` release (e.g. `v1.0.21` with `versionCode = 31`) with `make_latest: true`, overwriting `Latest` over `v1.3.0` (`versionCode = 42`) and causing installed `v1.2.0` (`versionCode = 40`) / `v1.1.2` (`versionCode = 36`) builds to ignore `/releases/latest` as older.
- **Single Source of Truth (`android-app/app/build.gradle.kts`, `.github/workflows/android-release.yml`):**
  - Promoted `defaultVersionCode = 43` (strictly greater than all prior CI releases including `v1.3.0`'s `42` and `v1.2.0`'s `40`) and `defaultVersionName = "1.3.1"` in `android-app/app/build.gradle.kts`.
  - Restricted `.github/workflows/android-release.yml` to `push.tags: ["v*.*.*"]` and `workflow_dispatch` with a single serialized `concurrency: android-release-publish` group so `main` pushes never mint synthetic `v1.0.xx` releases or clobber `Latest`.
  - Updated the workflow to parse `defaultVersionCode` and `defaultVersionName` directly from `build.gradle.kts`, enforce exact tag == `defaultVersionName` parity, verify `versionCode` is strictly greater than all existing published GitHub Releases before building, and write exact matching values to both the signed APK and `release-meta.json`.
- **In-App Updater Hardening (`GitHubReleaseUpdater.kt`, `ReleaseVersionComparatorTest.kt`):**
  - Enforced `CacheControl.FORCE_NETWORK`, `Cache-Control: no-cache, no-store`, and `.cache(null)` on `/releases/latest` and `release-meta.json` requests to eliminate stale update checks.
  - Added exact `releaseMeta.apkName` asset preference and defensive `parseReleaseMetaJson(...)` parsing, plus unit tests in `ReleaseVersionComparatorTest.kt` covering numeric `versionCode` upgrades/downgrade prevention (`25 > 24`, `25 > 21`, `21 <= 23`, `43 > 42`, `43 > 40`, `31 <= 40`) and malformed `release-meta.json` handling.
- **Build & Test Verification:** `$env:JAVA_HOME='C:\Users\moham\.jdks\jbr-21.0.11'; .\gradlew.bat testGithubDebugUnitTest assembleGithubDebug assemblePlaystoreDebug --no-daemon` passed (`BUILD SUCCESSFUL`, 0 errors) across both `github` and `playstore` flavors.
