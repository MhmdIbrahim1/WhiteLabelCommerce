# Nova Store implementation progress

| Phase | Status | Scope |
| --- | --- | --- |
| 0 | Complete | Monorepo scaffold, shared brand tokens, database bootstrap and Next.js starter |
| Pre-Phase 1 security hardening | Complete | Profile-based roles, guest submission permissions, order ownership and product-image storage policies |
| 1 | Complete (verified live) | Secured RTL merchant dashboard, catalog, orders, support and settings |
| 2 | Complete (live checkout verified) | Customer storefront, trusted COD checkout, order tracking and contact |
| 3 | Complete (verified live) | Shopify-style Visual Theme & Page Customizer (`store_settings.ui_config` JSONB) + dynamic per-page storefront theming |
| 4 | Complete (verified live) | Zero-contract shipping workflow, one-tap driver delivery confirmation (`/delivery/[token]`), automatic stock restoration on cancel, storefront audit polish & motion |
| 5 | Complete (verified live) | Dynamic Home Sections Builder (`ui_config.homeSections`), strict role-based Admin header guard, and GIN-indexed instant product search (`search_products_fast`) |
| 6 | Complete (verified live) | Multi-tenant customer auth (`/login`, `/register`, `/account`), store-scoped CRM (`/admin/customers`), Executive Profit Analytics (`/admin`), `cost_price`, & coupons (`/admin/coupons`) |
| 7 | Complete (verified live) | Product Technical Specifications JSONB (`products.specifications`), Size Guide modal, Admin 1-click Category Variant/Spec Presets, & Full Bilingual Support (`AR` RTL / `EN` LTR + bilingual GIN search) |
| 14 (Milestone 1) | Complete (verified live) | Critical & High Database, RLS, Storage, Paymob, Proxy, Upload, Notification & CI APK Workflow Security Hardening (`shared/phase-14-security-hardening.sql`, `web-store/`, `.github/workflows/`) |

## Phase 0 handoff

1. Run the entire [schema script](../shared/supabase-schema.sql) in the Supabase SQL Editor. It supports a fresh project or the original Phase 0 schema and preserves existing order ownership when renaming `orders.customer_id` to `user_id`.
2. Create `web-store/.env.local` with the project’s public connection settings.

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   ```

3. From `web-store/`, run `npm run dev` to start the web app.

The [brand configuration](../shared/brand-config.json) and SQL seed start with matching settings. The shipping fee is EGP 50, and the radius is 12 logical pixels. Supply the store’s WhatsApp number and replace the example support address before launch.

## Pre-Phase 1 security hardening

- Signup creates a customer profile. The first backfill carries forward existing administrators identified by server-managed Auth metadata. Subsequent access checks use the current profile role. To promote an account, update its verified user ID’s role in `public.profiles` through the SQL Editor.
- Store settings, categories and active products are publicly readable. Signed-in customers can read their own orders, line items and tickets and open their own tickets.
- Guest clients can submit an order with `shipping_address` or a ticket with `subject` and `message`. Use Supabase `.insert(...)` without chaining `.select()`. Guest orders start pending with a null subtotal and total. Trusted checkout code must record the items and calculate prices before confirmation.
- The public `product-images` bucket allows image reads. Administrators can upload a new object or delete one.
- Local PostgreSQL tests covered signup, profile permissions, order ownership migration, repeat execution, guest submissions and storage policies using stand-ins for Supabase Auth and Storage. Phase 0 and security hardening are live in Supabase, as confirmed by the project owner.

## Phase 1 merchant dashboard

Run the [Phase 1 migration](../shared/phase-1-admin.sql) in the project's Supabase SQL Editor. For fresh projects, apply the base schema first. The migration adds catalog images, variants, previous prices, ticket replies and order links, store banners, and the revenue calculation. It preserves the existing access policies and limits staff-only ticket fields during customer submissions.

Start the app from `web-store/` with `npm run dev` and open `/login` with an existing email/password account whose profile has the admin role. The app uses the publishable key and the signed-in user's session. Every admin page and mutation checks the role, and the database enforces RLS.

- Overview shows exact order, active-product and open-ticket counts, delivered-order revenue in the configured currency, and recent orders.
- Products supports catalog and category CRUD, image uploads, size and color lists, current and previous prices, stock, and publication state.
- Orders supports status filtering, item detail and guarded transitions. The existing `stock` column stores stock quantity, `confirmed` represents processing and `closed` represents a resolved ticket.
- Tickets supports linked order details, replies and status changes. Settings supports store name, shipping fee, WhatsApp and an ordered list of HTTPS banner image URLs.
- Local verification passed for production build, TypeScript, lint with zero warnings, the RTL login page, and unauthenticated redirects across all six admin paths. PostgreSQL tests covered migration reapplication, ticket field protection, admin updates and revenue.
- Phase 1 is verified live by the project owner.

## Phase 2 handoff

### Theme & Layout — implemented
- Files: `shared/brand-config.json`, `src/app/(shop)/layout.tsx`, `shop.css`, `src/components/shop/navigation.tsx`, `cart-store.ts`, and `src/lib/shop.ts` (web paths relative to `web-store/`).
- Contract: singleton `store_settings.id=true` supplies colors, radius, currency, fee, banners and WhatsApp. Profile checks reuse Phase 1 auth. Storefront styling is scoped away from admin routes.
- RTL IBM Plex Sans Arabic, persisted theme, responsive navigation, and cart subscriptions implemented. Build pending integrated routes. Next: catalog/search endpoint, checkout, orders and support.
### Home & Catalog — implemented
- Files: `src/app/(shop)/page.tsx`, `products/page.tsx`, `products/[id]/page.tsx`, `src/app/api/catalog-search/route.ts`, `src/components/shop/{hero,cards,buy}.tsx`, `public/store-collection.jpg` and storefront CSS.
- Contract: public active products and categories, public bucket `image_path`, `price/old_price`, `stock`, `sizes/colors`, and ordered HTTPS banners. Latest sorts on Phase 2 `created_at`; Phase 1 databases show featured products by name.
- Build pending checkout integration. Next: transactional SQL, persistent cart UI, checkout, tracking and contact.
### Cart & Server-Side Checkout — implemented
- Files: `src/components/shop/cart-store.ts`, `src/components/shop/basket.tsx`, `src/app/(shop)/cart/page.tsx`, `checkout/{page.tsx,action.ts}`, `src/lib/phone.ts`, `shared/phase-2-storefront.sql`.
- Contract: the action passes product IDs, variants, quantity, address, phone, COD and a retry key to `store_checkout`. The SQL function uses `auth.uid()`, locks products in ID order, validates active stock and variants, prices from products/settings, writes snapshot lines and decrements stock atomically. CARD is disabled. Existing orders and tickets retain RLS.
- Integrated build and SQL verification pending. Next: order tracking, customer sessions, contact, final checks.
### Orders & Contact Us — implemented
- Files: `src/app/(shop)/orders/{page.tsx,actions.ts}`, `src/components/shop/tracking.tsx`, `src/app/(shop)/contact/{page.tsx,action.ts}`.
- Contract: account reads explicitly filter `orders.user_id` under RLS. Guest tracking calls a narrowly scoped RPC with the full UUID and normalized phone and returns only ID, status and date. Contact inserts only `subject/message`; WhatsApp appears when configured.
- First production compilation succeeded; type checking found stale Next dev route declarations for the replaced starter page. Remaining: regenerate route types, lint, production build, PostgreSQL checks and handoff.

### Phase 2 verification and deployment handoff

- Build: `npm run build` completed with TypeScript checks and all storefront and admin routes. `npm run lint -- --max-warnings 0` passed. The stale dev route declarations were regenerated by starting Next dev.
- Browser checks against the local app and hosted public catalog passed for RTL, theme persistence, product detail, adding to cart, cart persistence after reload, COD form and disabled CARD option, mobile navigation, and viewport width on home/catalog/orders/contact.
- Local PostgreSQL checks applied all migrations and re-applied Phase 2. Checks covered database-derived price and shipping, variant validation, rollback after insufficient stock, idempotent retry, conflicting retry rejection, CARD rejection, guest tracking with the correct and incorrect phone, and account order visibility. Live order and ticket data were not modified during verification.
- Integration files: `src/proxy.ts` refreshes customer sessions; `src/app/admin/orders/[id]/page.tsx` displays the recorded phone and variant snapshots for fulfillment.
- Deployment: the Phase 2 migration is installed in the hosted Supabase project. New projects should apply [shared/phase-2-storefront.sql](../shared/phase-2-storefront.sql) after Phase 1. Phase 3 remains pending.

### Live checkout repair — 2026-11-23

- Reproduced the reported failure with the storefront publishable key. PostgREST returned HTTP 404 / `PGRST202` for `store_checkout`, and the same project's catalog lacked the Phase 2 timestamp column. Applied the repository's Phase 2 migration in the production SQL Editor and refreshed the PostgREST schema cache.
- Updated `web-store/src/app/(shop)/checkout/action.ts` to trim and validate the address, normalize the phone before checking the database's 8–15 digit rule, distinguish cart/input errors from service failures, and log the RPC error code without customer details.
- Verified the live RPC as both `anon` and `authenticated`, using the canvas bag, COD and a transaction-scoped test account. Checked guest tracking, customer ownership, receipt totals and item visibility. Rolled back the test orders, stock changes and test account. A separate publishable-key API check accepted the reported address and normalized phone, reached empty-cart validation, and confirmed stock was still 10.
- Follow-up browser verification at `http://localhost:3000` used the production build alongside the existing dev server. Navigated from the catalog through cart, submitted COD checkout and tracked the returned receipt. Fixed a missing favicon found on the first run. The repeat run had zero browser console or network errors and both form POSTs returned HTTP 200. Verified the two persisted test orders and their line items, removed both by exact receipt and QA marker, and restored the two inventory units in one transaction. SQL confirmed zero matching orders and line items.


## Phase 3: Visual Theme & Page Customizer (`store_settings.ui_config`)

- **Migration:** [shared/phase-3-customizer.sql](../shared/phase-3-customizer.sql) adds `ui_config jsonb not null default '{}'::jsonb` (checked with `jsonb_typeof(ui_config) = 'object'`) on `public.store_settings` while preserving Phase 2 `theme_template` and `border_radius` columns.
- **Web Store Engine & Admin Studio:**
  - `web-store/src/lib/ui-config.ts` integrates the 4 existing base templates (`modern-minimal`, `luxury-boutique`, `vibrant-pop`, `tech-grid`) as one-click starter presets (`uiConfigFromTemplate`) and validates/normalizes arbitrary JSONB (`resolveUiConfig`).
  - `/admin/customizer` (`web-store/src/app/admin/customizer/`) provides an RTL split-screen studio with Quick-Start Base Presets, 6 customization tabs (`عام`, `الرئيسية`, `المنتجات`, `تفاصيل المنتج`, `السلة والدفع`, `تتبع الطلبات`), color pickers, layout/animation controls, a live interactive Desktop/Mobile preview, and Server Action `saveUiConfig` (which also syncs legacy `theme_template`, `primary_color`, `secondary_color`, `surface_color`, `border_radius`).
  - Dynamic storefront integration reads `store_settings.ui_config` in `web-store/src/lib/shop.ts` and applies global + per-page CSS custom properties, layouts, hover effects, variant selector styles, checkout progress bar, order tracking badge/elevation styles, and entrance animations across `(shop)/layout.tsx`, `shop.css`, `hero.tsx`, `cards.tsx`, `gallery.tsx`, `buy.tsx`, `basket.tsx`, and `tracking.tsx`.
- **Verification:**
  - Executed `shared/phase-3-customizer.sql` in the hosted Supabase SQL Editor (`Success. No rows returned`) and verified `ui_config` (`jsonb`, default `'{}'::jsonb`), `theme_template`, and `border_radius` on `public.store_settings`.
  - Passed `eslint --max-warnings 0`, `tsc --noEmit`, and `npm run build` with zero errors.
  - Verified `/admin/customizer` and live storefront routes (`/`, `/products`, `/orders`) at `http://localhost:39177` with zero console errors and zero HTTP `>= 400` responses: confirmed instant live preview updates (Quick-Start presets, all 6 tabs, Desktop/Mobile toggle), Supabase persistence across reload, dynamic live storefront reflection, and clean restoration to `tech-grid`.

### Shared `store_settings.ui_config` JSON Schema Contract (Web & Android)

Both `web-store/` and `android-app/` consume the same JSON object stored in `public.store_settings.ui_config` (row `id = true`). When `ui_config` is `{}` or missing optional fields, clients should derive defaults from `theme_template` (`modern-minimal` | `luxury-boutique` | `vibrant-pop` | `tech-grid`) and legacy columns (`primary_color`, `secondary_color`, `surface_color`, `border_radius`).

```json
{
  "version": 1,
  "baseTemplate": "modern-minimal",
  "global": {
    "primaryButtonBg": "#164E63",
    "primaryButtonText": "#FFFFFF",
    "pageBg": "#F6F8F9",
    "cardSurface": "#FFFFFF",
    "accentBadge": "#C2410C",
    "borderRadius": 12,
    "motionIntensity": "smooth"
  },
  "pages": {
    "home": {
      "heroLayout": "split",
      "heroBg": "#164E63",
      "heroText": "#FFFFFF",
      "bannerSpeedMs": 5000,
      "categoryCardStyle": "pills",
      "entranceAnimation": "fade-up"
    },
    "products": {
      "gridColumns": 4,
      "cardHoverEffect": "zoom",
      "priceBadgeColor": "#164E63",
      "addToCartStyle": "solid"
    },
    "product_details": {
      "galleryStyle": "thumbnails-bottom",
      "ctaButtonColor": "#164E63",
      "variantSelectorStyle": "pills"
    },
    "cart_checkout": {
      "summaryCardBg": "#FFFFFF",
      "progressBarAccent": "#C2410C",
      "checkoutButtonColor": "#164E63"
    },
    "orders": {
      "timelineActiveColor": "#164E63",
      "statusBadgeStyle": "pill",
      "cardElevation": "subtle"
    }
  }
}
```

#### Allowed Field Values & Constraints

| Field | Type / Allowed Values |
| --- | --- |
| `version` | `1` |
| `baseTemplate` | `"modern-minimal" \| "luxury-boutique" \| "vibrant-pop" \| "tech-grid"` |
| All color fields (`*Bg`, `*Text`, `*Color`, `*Accent`, `cardSurface`, `accentBadge`) | 6-digit hex string `^#[0-9A-Fa-f]{6}$` |
| `global.borderRadius` | Integer `0`–`24` (logical px / dp) |
| `global.motionIntensity` | `"none" \| "subtle" \| "smooth" \| "bouncy"` |
| `pages.home.heroLayout` | `"split" \| "full-bleed" \| "bento"` |
| `pages.home.bannerSpeedMs` | Integer `0` (disabled) or `500`–`15000` (milliseconds) |
| `pages.home.categoryCardStyle` | `"pills" \| "rounded-cards" \| "minimal"` |
| `pages.home.entranceAnimation` | `"fade-up" \| "zoom-in" \| "slide-rtl" \| "none"` |
| `pages.products.gridColumns` | `2 \| 3 \| 4` |
| `pages.products.cardHoverEffect` | `"zoom" \| "lift" \| "glow" \| "none"` |
| `pages.products.addToCartStyle` | `"solid" \| "outline" \| "pill" \| "soft"` |
| `pages.product_details.galleryStyle` | `"thumbnails-bottom" \| "side-stack"` |
| `pages.product_details.variantSelectorStyle` | `"pills" \| "boxed"` |
| `pages.orders.statusBadgeStyle` | `"pill" \| "rounded" \| "outline"` |
| `pages.orders.cardElevation` | `"flat" \| "subtle" \| "elevated"` |


## Phase 4: Zero-Contract Shipping, Order Fulfillment & Motion Polish

- **Migration:** [shared/phase-4-orders-shipping.sql](../shared/phase-4-orders-shipping.sql) extends `public.orders` with zero-contract shipping & delivery columns, adds the `nova_restore_order_stock_on_cancel` trigger (atomically restoring `products.stock` when an order transitions to `cancelled`), upgrades `public.track_guest_order(uuid, text)` to return shipping fields, and adds RLS-safe `public.get_delivery_by_token(text)` and `public.confirm_delivery_by_token(text)` RPCs.
- **Admin Fulfillment (`/admin/orders`, `/admin/orders/[id]`):**
  - Rich order listing with Order ID, Date, Customer/Phone, Address summary, Items summary, Total, Status badge, carrier/tracking info, quick status transitions, and responsive mobile order cards.
  - Shipping drawer when transitioning to `shipped`: carrier presets (`بوسطة (Bosta)`, `أرامكس (Aramex)`, `مايلرز (Mylerz)`, `البريد المصري`, `مندوب خاص`, or custom), optional tracking number/AWB, automatic public tracking URL generation (or custom URL override), and optional courier note.
  - One-tap WhatsApp driver delivery link (`/delivery/[token]`) with copy & WhatsApp share actions.
- **Customer Tracking (`/orders`) & Storefront Audit Fixes:**
  - Displays live status stepper, copyable order ID, shipping info card (carrier, copyable tracking number, courier note, external **"تتبع الشحنة ↗"** link).
  - Fixed dark-mode contrast on `/cart` & `/checkout` summary panels, added `/support` -> `/contact` redirect, eliminated mobile horizontal overflow, restored `/products/[id]` section spacing, and refined admin mobile navigation/email truncation.
  - Added subtle motion micro-interactions (gentle `350ms` fade-up with `40ms` stagger, hover lift/zoom, tactile button press, cart badge pop, and smooth timeline transitions) honoring `ui_config` motion settings and `prefers-reduced-motion`.

### Shared `public.orders` Shipping & Delivery Columns Contract (Web & Android)

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `shipping_carrier` | `text` | Yes | Display name of carrier or courier (e.g. `بوسطة (Bosta)`, `مندوب خاص`, custom) |
| `tracking_number` | `text` | Yes | Carrier AWB / tracking code (copyable on `/orders` and Android) |
| `tracking_url` | `text` | Yes | Safe `http(s)://` public tracking link (auto-built for known carriers or custom) |
| `courier_note` | `text` | Yes | Optional courier note (e.g. driver phone or delivery window) |
| `delivery_token` | `text` | Yes (unique) | 48-char hex token powering one-tap `/delivery/[token]` driver confirmation |
| `shipped_at` | `timestamptz` | Yes | Recorded automatically when transitioning to `shipped` |
| `delivered_at` | `timestamptz` | Yes | Recorded automatically when marked `delivered` (via admin or `/delivery/[token]`) |

#### Related RPC Contracts
- `public.track_guest_order(order_number uuid, customer_phone text)` now returns `(id, status, created_at, shipping_carrier, tracking_number, tracking_url, courier_note, shipped_at, delivered_at)`.
- `public.get_delivery_by_token(p_token text)` returns safe driver card fields for `/delivery/[token]`.
- `public.confirm_delivery_by_token(p_token text)` marks a `confirmed` or `shipped` order as `delivered` and sets `delivered_at`.


## Phase 5: Dynamic Home Sections Builder, Role-Based Admin Guard & GIN-Indexed Search

- **Migration:** [shared/phase-5-search-index.sql](../shared/phase-5-search-index.sql) enables `pg_trgm`, adds a stored generated `search_vector tsvector` column on `public.products` combining `name` (A), `slug` (B), and `description` (C), creates GIN indexes (`idx_products_search_vector`, `idx_products_name_trgm`, `idx_products_description_trgm`), and defines `public.search_products_fast(p_query text, p_category_id uuid default null, p_limit int default 20)` ranked by `ts_rank + similarity`.
- **Dynamic Home Sections (`ui_config.homeSections`):**
  - Added `homeSections: HomeSection[]` to `StoreUiConfig` in `web-store/src/lib/ui-config.ts`.
  - Built the interactive Sections Manager (`الأقسام` tab) inside `/admin/customizer` (`sections-builder.tsx`) with one-click Show/Hide, Move Up/Move Down reordering, `+ إضافة قسم` block picker (5 block types), inline block configuration, and real-time preview sync.
  - Updated `/` (`web-store/src/app/(shop)/page.tsx`) to render visible `homeSections` dynamically in exact merchant-configured order.
- **Role-Based Admin Guard:** Enforced `export const dynamic = "force-dynamic"` in `(shop)/layout.tsx` and explicit `profiles.role === 'admin'` verification in `access.ts` so the **"الإدارة"** shortcut is strictly hidden for guests and non-admin customers.
- **Instant Indexed Search UI:** Upgraded `/api/catalog-search` and `/products?q=...` to call `search_products_fast` and upgraded the header expandable search pill (`200ms` debounce, `2+` chars) with instant thumbnail/title/price dropdown results.
- **Verification:**
  - Executed `shared/phase-5-search-index.sql` in Supabase SQL Editor (`Success. No rows returned`), verified `search_products_fast('حقيبة')` (`rank: 1.90816`), and confirmed `EXPLAIN ANALYZE` uses dual `Bitmap Index Scan` on `idx_products_search_vector` (`0.008ms`) and `idx_products_name_trgm` (`0.011ms`, total `0.178ms`).
  - Passed `eslint --max-warnings 0`, `tsc --noEmit`, and `npm run build` (all 17 routes) with zero errors.
  - Verified `/admin/customizer` (`الأقسام` tab: add `promo_banner`, reorder up, hide `categories_grid`, publish, live `/` sync, and clean restore) and instant header search dropdown + `/products?q=حقيبة` in Chrome at `http://localhost:39177` with `0` console errors and `0` HTTP `>= 400` failures.

### Shared `ui_config.homeSections` JSON Contract (Web & Android)

Stored as `store_settings.ui_config.homeSections` (ordered array, up to 15 items; defaults to `[hero_banner, categories_grid, featured_products, trust_features]` when omitted):

```json
{
  "homeSections": [
    {
      "id": "sec-hero",
      "type": "hero_banner",
      "visible": true
    },
    {
      "id": "sec-categories",
      "type": "categories_grid",
      "visible": true,
      "title": "تسوّق حسب القسم"
    },
    {
      "id": "sec-featured",
      "type": "featured_products",
      "visible": true,
      "title": "أحدث المنتجات",
      "categoryId": "",
      "limit": 8
    },
    {
      "id": "sec-promo-1",
      "type": "promo_banner",
      "visible": true,
      "badge": "عرض لفترة محدودة",
      "headline": "خصومات تصل إلى 30٪ على التشكيلة الجديدة",
      "subtext": "شحن سريع لجميع المحافظات مع إمكانية الدفع عند الاستلام.",
      "ctaLabel": "تسوّق العرض الآن",
      "ctaHref": "/products",
      "accentColor": "#164E63"
    },
    {
      "id": "sec-trust",
      "type": "trust_features",
      "visible": true,
      "title": "لماذا تتسوّق معنا؟"
    }
  ]
}
```

### Shared Search RPC Contract (`public.search_products_fast`)

- **Signature:** `public.search_products_fast(p_query text, p_category_id uuid default null, p_limit int default 20)` (granted to `anon, authenticated`; `security invoker` so RLS `is_active = true` still applies).
- **Returns:** `(id uuid, name text, category_id uuid, description text, price numeric, old_price numeric, stock integer, sizes text[], colors text[], image_path text, rank real)` ordered by `rank desc, name asc`.
- **Android / Web Usage:** Call via Supabase `.rpc("search_products_fast", { p_query, p_category_id, p_limit })` for instant debounced search (2+ chars) and catalog search pages.


## Phase 6: Multi-Tenant Customer Auth, Store-Scoped CRM, Executive Profit Analytics & Coupons

- **Migration:** [shared/phase-6-crm-analytics.sql](../shared/phase-6-crm-analytics.sql) adds multi-tenant `store_id` scoping (`is_store_admin(store_id)` RLS), `products.cost_price` + `order_items.unit_cost`, `public.store_customers` (with automatic checkout upsert and guest-order linking on signup/login via `sync_customer_profile`), `public.coupons` + `public.validate_coupon(p_code, p_subtotal)`, and upgrades `store_checkout` to snapshot `unit_cost`, upsert `store_customers`, and apply promo coupons atomically.
- **Customer Auth & Account Portal:**
  - Unified RTL glassmorphic `/login` and `/register` pages capturing phone numbers to automatically link prior guest orders in the active store.
  - `/account` customer portal displaying personal purchase summary (orders, delivered, total spent), saved shipping profile (`sync_customer_profile`), and recent order tracking.
  - Storefront Navbar shows **"تسجيل الدخول"** for guests, a clean User Menu (**"حسابي"**, **"طلباتي"**, **"تسجيل الخروج"**) for signed-in users, and keeps **"الإدارة"** strictly visible only to `profiles.role === 'admin'`.
- **Admin CRM, Coupons & Executive Analytics:**
  - `/admin/customers`: store-scoped customer directory with search, smart badges (`عميل VIP`, `عميل متكرر`, `عميل جديد`, `مرتجعات مرتفعة`), LTV/AOV/return metrics, UTF-8 CSV export, slide-over customer detail drawer with order history, editable internal notes, and one-click WhatsApp link.
  - `/admin/coupons`: create/toggle/delete store-scoped promo coupons (`percent` / `fixed`, minimum order, max uses, expiry) + live coupon validation in `/checkout`.
  - `/admin`: redesigned **Executive Profit & Sales Analytics Dashboard** with quick date-range filters (`اليوم`, `آخر 7 أيام`, `آخر 30 يوم`, `هذا الشهر`, `الكل`), 4 Hero KPI cards with sparklines (Gross Revenue, Net Profit & Margin, Pending COD, AOV & Delivery Rate), pure SVG Revenue vs. Net Profit Area/Line chart with hover tooltips, Order Status Donut Ring, Top 5 Products, and Low Stock Alerts (`stock <= 5`), plus `cost_price` in `/admin/products`.

### Shared Phase 6 Multi-Tenant & RPC Contracts (Web & Android)

- **Multi-Tenant Scope:** `store_settings.store_id`, `profiles.store_id`, `products.store_id`, `orders.store_id`, `store_customers.store_id`, and `coupons.store_id` default to `'00000000-0000-0000-0000-000000000001'::uuid` for the primary tenant and enforce strict `is_store_admin(store_id)` RLS.
- **Customer Profile Sync & Guest Order Linking:**
  - `public.sync_customer_profile(p_full_name text, p_phone text, p_city text, p_address text)` -> upserts `store_customers` for `(store_id, auth.uid())` and attaches any prior guest orders in the same store matching normalized `phone`.
- **Coupon Validation & Checkout:**
  - `public.validate_coupon(p_code text, p_subtotal numeric)` -> returns `(valid, reason, code, discount_type, discount_value, discount_amount, min_order_amount)` (`reason`: `'ok' | 'invalid_code' | 'not_found' | 'expired' | 'max_uses_reached' | 'min_order_not_met'`).
  - `public.store_checkout(request_key uuid, address text, customer_phone text, payment text, lines jsonb, p_coupon_code text default null, p_customer_name text default null)` -> validates & applies optional coupon atomically, snapshots `unit_cost`, upserts `store_customers`, and returns `(order_number, amount, order_currency)`.

---

## Full Storefront Data Seed & Section-by-Section End-to-End QA Audit — 2026-11-24

### 1. Realistic Arabic Catalog & Coupons Seeded (`store_id = 00000000-0000-0000-0000-000000000001`)
- **Categories (4 added, 5 total):** `أزياء رجالي`, `أحذية رياضية`, `ساعات وإكسسوارات`, `حقائب جلدية` (alongside existing `إكسسوارات`).
- **Products (12 added, 13 active total):** Realistic Arabic titles, descriptions, verified high-resolution Unsplash photography (visually inspected, zero broken URLs), selling `price`, wholesale `cost_price`, `old_price`, sizes/colors, and varied stock counts including 2 low-stock items (`سنيكرز كاجوال جلد وشمواه` stock `3`, `ساعة كلاسيك بسوار جلد طبيعي` stock `4`) to trigger `/admin` Low Stock Alerts. Also polished existing `canvas-tote` with a verified image and `cost_price = 135`.
- **Promo Coupons (2 active):** `NOVA10` (`10%` percent discount, min `0`) and `WELCOME50` (`50 EGP` fixed discount, min `300 EGP`).
- **Storefront Home Sections:** Added a `promo_banner` section advertising `NOVA10` into `store_settings.ui_config.homeSections` between `featured_products` and `trust_features`.

### 2. Bugs Discovered & Fixed During Audit
1. **Critical `store_checkout` SQL Bug (`shared/phase-6-crm-analytics.sql`):** Fixed PostgreSQL `42702` (`column reference "address" is ambiguous`) in `update public.store_customers` when any existing/signed-in customer checked out, by introducing `v_address` and aliasing `store_customers sc`. Re-applied in Supabase SQL Editor and verified via rolled-back SQL test (`851.00 EGP`).
2. **Arabic Typo Search Tolerance (`shared/phase-5-search-index.sql`):** Upgraded `public.search_products_fast` to use `pg_trgm` `word_similarity` (`>= 0.35` on `name`, `>= 0.45` on `description`) alongside `ts_rank`, fixing single-word Arabic typos (`سنيكرس` -> `سنيكرز`, `قميس` -> `قميص`) that previously returned `0` results. Re-applied in Supabase SQL Editor and verified live.
3. **HTTPS Product Image URL Support (`web-store/src/lib/shop.ts`, `web-store/src/app/admin/products/page.tsx`, `web-store/src/app/admin/mutations.ts`):** Updated `photo()` and `/admin/products` to support direct `https://` URLs alongside Supabase Storage `product-images` paths, and guarded `storage.remove` to only delete bucket paths (`products/...`).
4. **Customer Auth Profile Sync & Error Clarity (`web-store/src/app/login/actions.ts`, `web-store/src/app/login/page.tsx`):** Passed registration `user_metadata` (`full_name`, `phone`) into `sync_customer_profile` on login (essential when email confirmation defers first login) and added dedicated Arabic messaging for unconfirmed email addresses.
5. **Checkout Profile Prefill (`web-store/src/app/(shop)/checkout/page.tsx`, `web-store/src/components/shop/basket.tsx`):** Prefilled saved `phone`, `address`, and `full_name` for signed-in customers on `/checkout`.
6. **Mobile `390px` & Accessibility Polish (`web-store/src/app/(shop)/shop.css`, `web-store/src/components/shop/navigation.tsx`, `web-store/src/components/shop/hero.tsx`, `web-store/src/app/admin/customizer/customizer.css`, `web-store/src/app/admin/customers/customers-client.tsx`):**
   - Tightened `<= 650px` storefront header spacing so `.cart-nav-btn` never clips on `390px` mobile screens (`left: 12 >= 0`, `right: 74 <= 390`).
   - Added `aria-label="تسجيل الدخول"` on the mobile login icon link and `loading="eager"` on Bento secondary hero image.
   - Added `<= 600px` responsive stacking/2-column rules in `customizer.css` eliminating inner clipping on preset cards and page tabs at `390px`.
   - Normalized Egyptian local phone numbers (`01XXXXXXXXX` -> `201XXXXXXXXX`) for `/admin/customers` `https://wa.me/...` links.
   - Added `allowedDevOrigins: ["127.0.0.1"]` in `web-store/next.config.ts`.

### 3. Section-by-Section Live Browser QA Results (Desktop `1440px` & Mobile `390px`)

| # | Section / Routes | Desktop (`1440px`) | Mobile (`390px`) | Notes & Verification |
| --- | --- | --- | --- | --- |
| 1 | **Storefront Home (`/`)** | Pass | Pass | Verified RTL, Hero Bento, all 5 `homeSections` (Hero, Categories, Featured Products, `NOVA10` Promo Banner, Trust Bar), zero broken images, zero overflow, and **"الإدارة"** strictly hidden for guests & regular customers. |
| 2 | **GIN Search (`/products`, Header Search)** | Pass | Pass | Verified instant header dropdown + `/products?q=...` across exact (`ساعة` -> 2), partial (`كرونو` -> 1), and Arabic typos (`سنيكرس` -> 2, `قميس` -> 2). All 13 product images loaded (`200 OK`). |
| 3 | **Customer Auth & Portal (`/register`, `/login`, `/account`)** | Pass | Pass | Registered & signed in test customer, confirmed profile metadata auto-synced into `/account`, User Menu visible, **"الإدارة"** hidden (`0` links), zero overflow. |
| 4 | **Cart & Checkout with Coupon (`/cart`, `/checkout`)** | Pass | Pass | Added `قميص كتان مصري فاخر` (`890 EGP`), applied `NOVA10` (`-89 EGP` + `50` shipping = `851 EGP`), completed COD order, and verified automatic stock decrement (`24 -> 23`). |
| 5 | **Orders & Zero-Contract Shipping (`/admin/orders`, `/orders`, `/delivery/[token]`)** | Pass | Pass | Moved order `pending -> confirmed -> shipped` with `بوسطة (Bosta)` + `BOSTA-QA-987654`; verified live stepper, carrier badge & tracking link on `/orders`; verified mobile one-tap delivery on `/delivery/[token]` marked order `delivered`. |
| 6 | **Executive Analytics, CRM & Coupons (`/admin`, `/admin/customers`, `/admin/coupons`)** | Pass | Pass | Verified accurate Gross Revenue (`851 EGP`), Net Profit (`291 EGP`, `34.2%` margin), SVG charts, date-range filter pills, Top Products, Low Stock Alerts (both `stock <= 4` items), CRM LTV/badge/drawer + normalized `wa.me/20...` link, and `NOVA10` usage count (`1`). |
| 7 | **Visual Customizer (`/admin/customizer`)** | Pass | Pass | Reordered `promo_banner` above `featured_products`, published, verified live `/` sync immediately, then cleanly restored original order. Zero inner or page overflow at `390px`. |

### 4. Cleanup & Build Verification
- **QA Cleanup:** Removed the exact QA test order (`9f23386e-60b0-4e93-88ed-e23a4838aefb`), QA customer CRM record, and QA auth user; restored `قميص كتان مصري فاخر` stock back to `24` and reset `NOVA10` `used_count` back to `0`. Verified via SQL (`0` remaining QA records, `13` active products, `2` low-stock products, `2` active coupons).
- **Quality Gates:** `eslint --max-warnings 0`, `tsc --noEmit`, and `npm run build` (all 23 routes) passed with zero errors and zero warnings.

---

## Phase 7: Product Technical Specifications, Admin Category Presets & Full Bilingual Support (`AR` RTL / `EN` LTR)

- **Migration:** [shared/phase-7-specs-bilingual.sql](../shared/phase-7-specs-bilingual.sql) adds `name_en text`, `description_en text`, and `specifications jsonb` (array constraint) on `public.products`, adds `name_en text` on `public.categories`, rebuilds the stored generated `search_vector` + GIN trigram indexes (`idx_products_name_en_trgm`, `idx_products_description_en_trgm`) to index both Arabic and English fields, and upgrades `public.search_products_fast` to search and return bilingual columns and `specifications`.
- **Admin Category Variant & Spec Presets (`/admin/products`):**
  - Built `AdminProductForm` (`web-store/src/app/admin/products/product-form.tsx`) with 1-click presets (`تيشيرت / قميص` Shirts `S–XXL`, `بناطيل` Pants `30–38`, `أحذية` Shoes `40–45`, and `ساعات وإكسسوارات` Watches with strap options & technical specs), interactive color swatches, optional `name_en` / `description_en` inputs, and a dynamic bilingual Specifications Table Editor (`key_ar`, `key_en`, `value_ar`, `value_en`).
  - Added optional `name_en` to Category create/edit forms and updated `saveCategory` / `saveProduct` mutations.
- **Product Details (`/products/[id]`) & Variant Clarity:**
  - Added Apple/Zara-styled `ProductSpecsTable` (`المواصفات والتفاصيل` / `Specifications`) and interactive `SizeGuideModal` (`دليل المقاسات` / `Size Guide` with Apparel, Pants, and Shoes tabs auto-selected by product sizes) alongside existing Size/Color chips.
  - Upgraded `/cart`, `/checkout`, `/orders`, `/account`, `/admin/orders`, and `/admin/orders/[id]` to render selected Size & Color variant badges clearly.
- **Full Bilingual Engine (`AR` RTL / `EN` LTR):**
  - Implemented `web-store/src/lib/i18n.ts`, `i18n-server.ts`, and `LanguageProvider` + `LanguageToggle` (`EN` / `عربي`) persisted via `localStorage` + `nova_lang` cookie + `ui_config.defaultLanguage`, dynamically updating `<html lang="ar-EG|en" dir="rtl|ltr">`.
  - Placed `EN` / `عربي` toggle in Storefront Navbar, Auth pages (`/login`, `/register`, `/account`), Admin topbar (`/admin/**`), and Courier page (`/delivery/[token]`), plus added a `defaultLanguage` setting in `/admin/customizer`.
- **Nova Store Catalog Enrichment:** Enriched all 5 categories and all 13 active products in `Nova Store` with `name_en`, `description_en`, and 3–5 structured `specifications` rows each (watches, sneakers, bags, shirts, jackets, polos, sunglasses, wallet, tote).
- **Verification:**
  - Applied `shared/phase-7-specs-bilingual.sql` and bilingual/specs enrichment in Supabase SQL Editor (`5/5` categories, `13/13` active products enriched, `search_products_fast('Chronograph')` → `Luxury Stainless Steel Chronograph Watch`, rank `3.27665`).
  - Verified live in Chrome across Desktop (`1440px`) and Mobile (`390px`) with zero horizontal overflow, zero mobile header clipping, bilingual persistence across reloads, English instant header search (`Chronograph`), bilingual Specifications table on Watch & Shirt pages, Size Guide modal tabs, Cart variant badges, Admin English Analytics & 1-click Category Presets (`Shirts & Tops`, `Watches & Accessories`), and `Default Storefront Language` control in `/admin/customizer`.
  - **100% Pure Single-Language Sweep:** Audited all `web-store/src/` components and eliminated every remaining mixed-language UI label across `/admin/customizer` (`customizer-studio.tsx`, `sections-builder.tsx`, `preview-frame.tsx`, `theme-templates.ts`), `/admin` (Top Products & Low Stock Alerts now use `name_en`), `/admin/settings`, `/admin/orders` & `order-status-form.tsx`, `/admin/tickets`, `/admin/products`, `/admin/customers`, `/products/[id]` (added `translateColor` for bilingual color variant labels while preserving DB values), `gallery.tsx`, and checkout/order server actions. Re-verified `/admin/customizer`, `/admin`, `/admin/settings`, `/`, and `/products/[id]` in Chrome in both `EN` (LTR) and `AR` (RTL) with zero leaked strings, zero console errors, and zero HTTP `>= 400` responses.
  - Passed `eslint --max-warnings 0`, `tsc --noEmit`, and `npm run build` with zero errors.

### Shared Phase 7 Bilingual & Specifications Contract (Web & Android)

- **Categories:** `categories.name` (Arabic), `categories.name_en` (English fallback to `name` when empty).
- **Products:** `products.name`, `products.name_en`, `products.description`, `products.description_en`, and `products.specifications`:
  ```json
  [
    {
      "key_ar": "مقاومة الماء",
      "key_en": "Water Resistance",
      "value_ar": "حتى 50 متر (5 ATM)",
      "value_en": "Up to 50m (5 ATM)"
    }
  ]
  ```
- **Default Store Language:** `store_settings.ui_config.defaultLanguage`: `"ar" | "en"` (defaults to `"ar"` when omitted).
- **Upgraded Search RPC (`public.search_products_fast`):** Now returns `(id, name, name_en, category_id, description, description_en, price, old_price, stock, sizes, colors, image_path, specifications, rank)` and matches across Arabic and English names/descriptions with full-text + trigram `word_similarity`.

---

## Phase 7b: Hybrid Smart Bilingual Fuzzy Search (AR/EN) & Bilingual Product Specs Audit

- **Migration:** [shared/phase-7b-smart-search.sql](../shared/phase-7b-smart-search.sql) applied in Supabase SQL Editor:
  - Enables `pg_trgm` and `fuzzystrmatch` (`levenshtein`, `dmetaphone`, `dmetaphone_alt`).
  - Adds SQL helpers `public.normalize_arabic_text(text)` (unifies `أ/إ/آ -> ا`, `ة -> ه`, `ى -> ي`, strips tashkeel & tatweel), `public.arabic_consonant_skeleton(text)` (strips long vowels `ا/و/ي` so `تشرت` == `تيشيرت` and `كتشي` == `كوتشي`), `public.normalize_english_text(text)` (lowercases and strips hyphens/punctuation so `T-Shirt`/`t-shrt`/`tshirt` unify), and `public.product_specs_text(jsonb)`.
  - Adds GIN trigram indexes on normalized `name` (`idx_products_name_norm_trgm`) and `name_en` (`idx_products_name_en_norm_trgm`), plus composite `(store_id, is_active)` index (`idx_products_store_active_idx`).
  - Upgrades `public.search_products_fast(p_store_id uuid, p_query text, p_limit int default 20, p_category_id uuid default null)` with strict `p_store_id` multi-tenant isolation, searching across `name`, `name_en`, `description`, `description_en`, JSONB `specifications`, and `sizes`/`colors` options using 4 weighted relevance layers:
    1. Exact / prefix / substring normalized match (`exact` / `spec`)
    2. Arabic consonant skeleton match (`skeleton`)
    3. English phonetic match via `dmetaphone` (`phonetic`)
    4. Fuzzy typo tolerance via `pg_trgm` `word_similarity >= 0.15` + token `levenshtein <= 2` (`fuzzy`)
- **Hybrid Instant Storefront Search UI (`Fuse.js` + `search_products_fast`):**
  - Added `fuse.js` and `web-store/src/lib/smart-search.ts` implementing `<10ms` client-side Arabic/English normalization, consonant skeleton matching, and Fuse.js weighted fuzzy search over `name`, `name_en`, `description`, `description_en`, `specifications`, and options.
  - Upgraded `web-store/src/lib/shop.ts` (`settings()` now exposes `storeId`), `web-store/src/app/api/catalog-search/route.ts` (supports `?mode=index` scoped by `store_id` for instant Fuse.js hydration and `?q=...` backed by `search_products_fast(p_store_id, ...)` returning `match_type` & `rank`), `web-store/src/components/shop/navigation.tsx` (instant dropdown merged with RPC results + 100% localized closest-match/spec-match banners & badges), and `web-store/src/app/(shop)/products/page.tsx` (full catalog search with `p_store_id`, closest-match/spec-match banner, and localized empty-state hint).
- **Bilingual Product Specs & Options Polish:**
  - Localized the remaining category `name_en` placeholder (`admin/products/page.tsx`), `adminCategoryNameEn` / `adminSpecsHeading` Arabic labels (`i18n.ts`), preset color `label_en` (`specs.ts` & `product-form.tsx`), and added storefront `revalidatePath("/", "layout")` on product/category mutations (`admin/mutations.ts`) so newly saved specs/options are immediately reflected and searchable.
- **Verification (SQL & Live Chrome):**
  - **SQL Verification (10/10):** Verified `تشرت` → `تيشيرت بولو قطن بيكيه كحلي` (`skeleton`), `كتشي` → `كوتشي سنيكرز رياضي أبيض كلاسيكي` (`skeleton`), `tshrt` & `t-shrt` → `Egyptian Cotton Pique Polo T-Shirt` (`phonetic`), `sneekers` → `Classic White Air Runner Sneakers` (`phonetic`), `jaket` → `Casual Suede Bomber Jacket` (`phonetic`), `قطن` / `cotton` (`exact`), `waterproof` → `Luxury Stainless Steel Chronograph Watch` (`spec`), and wrong `store_id` → `0` rows (strict multi-tenant isolation).
  - **Live Chrome Verification (16/16 checks, AR RTL & EN LTR):** Verified instant header search dropdown, `/products?q=...`, `/products/[id]` specs table, `/admin/products`, `/login`, and `/register` with `0` console errors, `0` failed network responses (`HTTP >= 400`), `0` broken images, and `0` mixed-language UI strings.

### Shared Phase 7b Smart Search Contract (Web & Android Sync)

- **RPC Signature:**
  ```sql
  public.search_products_fast(
    p_store_id uuid,
    p_query text,
    p_limit int default 20,
    p_category_id uuid default null
  )
  ```
- **Return Columns:** `(id, name, name_en, category_id, description, description_en, price, old_price, stock, sizes, colors, image_path, specifications, rank, match_type)` where `match_type ∈ {'exact', 'spec', 'skeleton', 'phonetic', 'fuzzy'}`.
- **Android Integration Note (`android-app/`):** Pass the tenant's active `storeId` as `p_store_id` when invoking `search_products_fast` via PostgREST RPC; display a localized "Showing closest matches" / "عرض أقرب النتائج الذكية" banner when results are non-empty and none has `match_type == "exact"`.

---

## Phase 7c: High-Precision Search Tuning & 15-Category Bilingual Synonym Dictionary

- **Migration:** [shared/phase-7c-complete-search.sql](../shared/phase-7c-complete-search.sql) applied in a fresh Supabase SQL Editor tab:
  - Created `public.search_synonyms` (`id uuid`, `store_id uuid null references public.store_settings(store_id) on delete cascade`, `terms text[]`, `category_tag text`) with GIN index on `terms`, RLS policies (public `SELECT` for global `store_id IS NULL` or store-scoped rows; admin `ALL` via `is_store_admin(store_id)`), and explicit `GRANT SELECT` to `anon, authenticated` + `GRANT INSERT, UPDATE, DELETE` to `authenticated`.
  - Seeded **15 global bilingual & Egyptian dialect synonym groups** (`store_id = NULL`): Footwear, Tops & Shirts, Outerwear & Winter, Pants & Sets, Bags & Wallets, Watches & Accessories, Mobile & Tablets, Audio, Computers & Gaming, Home & Kitchen, Home Decor & Bedding, Perfumes & Care, Sports & Fitness, Kids & Baby, and Automotive.
  - Added `public.strip_arabic_al(text)` and GIN trigram indexes on normalized `categories.name` and `categories.name_en`.
  - Upgraded `public.search_products_fast(p_store_id uuid, p_query text, p_limit int default 20, p_category_id uuid default null)` to join `categories`, expand matching synonym groups using whole-word/phrase matching on `name`, `name_en`, `categories.name`, and `categories.name_en`, and eliminate false positives via:
    - Raising `pg_trgm` `word_similarity` threshold from `0.15` to **`0.35`** (applied ONLY on product name and category, never descriptions/specs).
    - Restricting `levenshtein <= 1` and Arabic consonant skeleton matching strictly to product `name`, `name_en`, and `category` tokens of `length >= 4` (with initial-char & length-diff `<= 2` guard on Arabic skeletons so `"قميص"` never collides with `"قماشية"`), while descriptions & JSONB specs require exact/normalized substring matching only.
    - Enforcing a strict minimum relevance cutoff (`score >= 25`) plus high-confidence noise suppression (suppressing scores `< 40` whenever any hit scores `>= 60`).
- **Client & API Precision Alignment:**
  - Tuned [smart-search.ts](../web-store/src/lib/smart-search.ts) (`Fuse.js` `threshold: 0.25`, `minMatchCharLength: 3`, heavier `name`/`name_en`/`category` weights, 15-category synonym expansion, identical `>= 25` / `< 40` cutoffs).
  - Updated [catalog-search/route.ts](../web-store/src/app/api/catalog-search/route.ts) (`?mode=index` now returns `{ items, synonyms }` with category names + active `search_synonyms` rows), [navigation.tsx](../web-store/src/components/shop/navigation.tsx) (uses authoritative server `search_products_fast` hits once returned to prevent client noise), and [products/page.tsx](../web-store/src/app/(shop)/products/page.tsx) (handles `match_type = 'synonym'` cleanly).
- **Verification (SQL & Live Chrome):**
  - **SQL & `anon`-Role Verification:** Confirmed `15` seeded global synonym groups, strict `store_id` isolation (`0` hits for another tenant), `anon` role permissions (`anon_syn_count = 15`), and exact zero-noise results for all 12 test queries.
  - **Live Chrome Verification (`http://localhost:3000`, AR RTL & EN LTR):** Verified `/api/catalog-search?mode=index` (`13` items, `15` synonym groups), navbar dropdown, and `/products?q=...` across `كوتشي` (only 3 sneakers/running shoes), `قميص` (only 2 shirts/polos; zero `حقيبة قماشية`), `تشرت` (`تيشيرت بولو قطن بيكيه كحلي` #1), `جزمة` (only 3 sneakers/running shoes), `شنطة` (only 4 bags/wallets), `sneekers`, `jaket`, `tshrt`, and `waterproof` with **0 console errors**, **0 HTTP ≥ 400 responses**, and **0 broken images**.
  - **Shared Contract Update (`android-app/`):** `search_products_fast` `match_type` now includes `'synonym'` (`'exact' | 'synonym' | 'spec' | 'skeleton' | 'phonetic' | 'fuzzy'`); treat both `'exact'` and `'synonym'` as direct matches and display the closest-match banner only when all hits are `'skeleton'`, `'phonetic'`, or `'fuzzy'`.

---

## Phase 7d: Enterprise Two-Stage Scalable Search Architecture (100k+ Products/Store)

- **Migration:** [shared/phase-7d-scalable-search.sql](../shared/phase-7d-scalable-search.sql) applied in a fresh Supabase SQL Editor tab:
  - Added precomputed columns `search_text_norm text` and `search_skeleton_norm text` on `public.products`, backed by pure SQL builders `compute_product_search_text(...)` and `compute_product_search_skeleton(...)`.
  - Added automatic `BEFORE INSERT OR UPDATE` trigger on `public.products` (`products_sync_search_norms_trg`) and `AFTER UPDATE` trigger on `public.categories` (`categories_sync_products_search_norms_trg`) to keep both columns synchronized automatically, and backfilled `13/13` existing rows.
  - Added GIN trigram indexes `idx_products_store_search_trgm` on `search_text_norm`, `idx_products_store_skeleton_trgm` on `search_skeleton_norm`, and composite B-tree index `idx_products_store_active_cat_idx (store_id, is_active, category_id)`.
  - Refactored `public.search_products_fast` into a **Two-Stage Retrieval Pipeline** with pagination (`p_limit int default 24`, `p_offset int default 0`, preserving backward compatibility with 4-arg callers):
    - **Stage 1 ($O(\log N)$ Indexed Candidate Pruning, `LIMIT 150`):** Strictly scoped by `p.store_id = p_store_id` and `p.is_active = true`, pruning candidates via GIN-indexable `%` / `<%` / `LIKE ANY` predicates against `search_text_norm` and `search_skeleton_norm` capped at `<= 150` materialized rows.
    - **Stage 2 ($O(150)$ Constant-Time Precision Reranking):** Applies exact/prefix bonuses, multi-token match bonus (`+14` per matching token when 2+ query tokens), `levenshtein <= 1` on title/category tokens `>= 4`, 15-category synonyms, and Phase 7c strict cutoffs (`>= 25`, suppressing `< 40` when `>= 60` exists), followed by `LIMIT p_limit OFFSET p_offset`.
- **Zero-Bloat Server-First Autocomplete & Client LRU Cache (`web-store/`):**
  - Removed the `?mode=index` full-catalog download from [catalog-search/route.ts](../web-store/src/app/api/catalog-search/route.ts) and [navigation.tsx](../web-store/src/components/shop/navigation.tsx) so initial browser payload stays tiny regardless of store catalog size.
  - Refactored [smart-search.ts](../web-store/src/lib/smart-search.ts) with a bounded **50-entry / 60s TTL client-side LRU cache** keyed by normalized query (`normalizeSearchCacheKey`) so repeated/backspaced queries resolve in **0ms** with zero network traffic.
  - Created [searchSynonyms.ts](../web-store/src/lib/searchSynonyms.ts) providing **0ms** local bilingual synonym/category hint chips (`أقسام مقترحة` / `Suggested categories`) while the 180ms-debounced `AbortController`-managed RPC resolves (`p_limit: 8`).
  - Updated [products/page.tsx](../web-store/src/app/(shop)/products/page.tsx) to use database-level `p_limit` / `p_offset` pagination directly.
- **Verification (SQL `EXPLAIN ANALYZE` & Live Chrome):**
  - **SQL & `EXPLAIN ANALYZE`:** Confirmed `13/13` backfilled rows, Stage-1 `Bitmap Index Scan` (`0.617 ms` execution time on `idx_products_store_active_cat_idx`, with GIN trigram indexes `idx_products_store_search_trgm` and `idx_products_store_skeleton_trgm` indexed), exact `p_limit`/`p_offset` pagination (`pagination_exact: true`), 4-arg backward compatibility under `anon` role, and 12/12 precision checks with strict `store_id` isolation (`0` rows for another tenant).
  - **Live Chrome (`http://localhost:3000`, AR RTL & EN LTR):** Confirmed `0` calls to `?mode=index`, `1` network call for repeated `كوتشي` (proving 0ms LRU cache hit on re-entry), 0ms localized hint chips, and exact zero-noise results for `كوتشي`, `قميص`, `تشرت`, `jaket`, and `waterproof` with **0 console errors**, **0 HTTP ≥ 400 responses**, and **0 broken images**.

### Shared Phase 7d Scalable Search Contract (Web & Android Sync)

- **RPC Signature (Backward-Compatible):**
  ```sql
  public.search_products_fast(
    p_store_id uuid,
    p_query text,
    p_limit int default 24,
    p_category_id uuid default null,
    p_offset int default 0
  )
  ```
- **Android Integration Note (`android-app/`):**
  - Do NOT download the full catalog to memory for search autocomplete; call `search_products_fast` with `p_limit = 8` (autocomplete) or `p_limit = 24, p_offset = page * 24` (catalog pagination), using a 180ms coroutine `debounce` + job cancellation (`collectLatest`) and an in-memory `LruCache(maxSize = 50)` with 60s TTL keyed by normalized query.

---

## Phase 8: Enterprise Multi-Tenant Paymob Payment Gateway Integration

- **Migration:** [shared/phase-8-paymob.sql](../shared/phase-8-paymob.sql) applied in a fresh Supabase SQL Editor tab:
  - **Public Payment Flags (`public.store_settings`):** Added `cod_enabled boolean not null default true`, `paymob_enabled boolean not null default false`, `paymob_card_enabled boolean not null default false`, `paymob_wallet_enabled boolean not null default false`.
  - **Isolated Payment Secrets (`public.store_payment_secrets`):** Created with `store_id uuid primary key references public.store_settings(store_id) on delete cascade`, `paymob_api_key`, `paymob_card_integration_id`, `paymob_wallet_integration_id`, `paymob_iframe_id`, `paymob_hmac_secret`, `updated_at`. Enabled RLS, executed `REVOKE ALL ON public.store_payment_secrets FROM public, anon, authenticated;`, granted access strictly to `authenticated` admins matching `is_store_admin(store_id)` and `service_role` (verified `anon_can_select_secrets: false`).
  - **Order Payment Tracking (`public.orders`):** Added/normalized `payment_method` (`'cod' | 'paymob_card' | 'paymob_wallet'`), `payment_status` (`'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded'`), `paymob_order_id`, `payment_transaction_id`, indexes (`idx_orders_paymob_order_id`, `idx_orders_payment_transaction_id`), and upgraded `store_checkout` & `track_guest_order` RPCs to validate store flags and expose payment status.
- **Hardened Server Paymob Endpoints (`web-store/`):**
  - [src/lib/supabase/admin.ts](../web-store/src/lib/supabase/admin.ts): Server-only Service Role client using `SUPABASE_SERVICE_ROLE_KEY`.
  - [src/lib/paymob.ts](../web-store/src/lib/paymob.ts): 3-step Paymob REST flow (`auth/tokens` → `ecommerce/orders` with retry-safe `${order.id}__${Date.now()}` → `acceptance/payment_keys` with safe fallback billing data + optional `payments/pay` for Egyptian wallets) and constant-time (`crypto.timingSafeEqual`) 20-field alphabetical `HMAC-SHA512` verifier.
  - `POST /api/payments/paymob/initiate`: Validates `order_id` UUID, `method` (`card` | `wallet`), and Egyptian wallet phone (`/^01[0125][0-9]{8}$/`), locks `amount_cents = Math.round(Number(order.total) * 100)` strictly from DB, prevents double-charging (`409` if already `paid`), and returns `{ redirect_url }` (plus `pending_wallet_prompt: true` for wallets).
  - `POST /api/payments/paymob/webhook`: Authoritative confirmation endpoint — resolves tenant HMAC secret via `store_id`, verifies 20-field `HMAC-SHA512` (`401` if invalid), enforces idempotency (`200` if already `paid`), validates `currency === 'EGP'` and exact `amount_cents` (`400` if tampered), and atomically records `payment_status` and `payment_transaction_id`.
  - `GET /api/payments/paymob/callback`: Verifies query HMAC when present without trusting unverified query strings to mark orders `paid`, and redirects strictly to relative internal `/orders?payment=success|pending|failed&order=<uuid>`.
- **Bilingual Admin Settings, Checkout & Orders UI:**
  - Added 100% bilingual **Payment Gateways / بوابات الدفع** card in `/admin/settings` with secret masking (`محفوظ ومشفّر ••••••` / `Configured ••••••`) — raw `paymob_api_key` and `paymob_hmac_secret` are never rendered in client HTML and only overwritten when a new non-empty value is submitted.
  - Upgraded `/checkout` (`basket.tsx`) to render only enabled store payment options (COD, Visa/Mastercard, Egyptian Mobile Wallets) with pure AR/EN inline validation for 11-digit Egyptian wallet numbers.
  - Upgraded `/orders` (`orders/page.tsx`, `tracking.tsx`) with localized payment status badges (`مدفوع / Paid`, `قيد الدفع / Pending`, `فشل الدفع / Failed`, `عند الاستلام / COD`) and callback return banner.
- **Live E2E Verification & Cleanup:**
  - Configured Nova Store test credentials through `/admin/settings`, confirmed reload masking and zero raw secrets in HTML/DOM.
  - Verified live Paymob Card checkout (`POST /api/payments/paymob/initiate` → HTTP `200`, redirect to `https://accept.paymob.com/api/acceptance/iframes/1102311?payment_token=...`).
  - Verified `POST /api/payments/paymob/webhook`: invalid HMAC → `401`, tampered amount → `400`, valid 20-field `HMAC-SHA512` → `200` (`payment_status: "paid"`), replay → `200` (`idempotent: true`).
  - Verified `/api/payments/paymob/callback` redirect banner and `مدفوع` / `Paid` badge on `/orders` in both AR and EN (`0` console errors, `0` HTTP `>= 400`), then removed the test order and restored product stock.

### Shared Phase 8 Paymob Contract (Web & Android Sync)

- **Public Store Payment Flags (`store_settings`):** `cod_enabled`, `paymob_enabled`, `paymob_card_enabled`, `paymob_wallet_enabled`.
- **Order Columns (`orders`):** `payment_method` (`'cod' | 'paymob_card' | 'paymob_wallet'`), `payment_status` (`'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded'`), `paymob_order_id`, `payment_transaction_id`.
- **Android Online Checkout Flow:**
  1. Call `store_checkout` RPC with `payment = 'paymob_card'` or `'paymob_wallet'` to create the order with `payment_status = 'pending'`.
  2. Call `POST /api/payments/paymob/initiate` with JSON body:
     ```json
     {
       "order_id": "<uuid>",
       "method": "card",
       "wallet_phone": "010xxxxxxxx"
     }
     ```
     (`wallet_phone` required only when `method === "wallet"` and must match `/^01[0125][0-9]{8}$/`).
  3. Open returned `{ "redirect_url": "https://accept.paymob.com/..." }` in Chrome Custom Tabs / WebView and observe order `payment_status` updates (confirmed authoritatively by `POST /api/payments/paymob/webhook`).

---

## Phase 8b: Online Checkout Cart Preservation, Retry UX & Bilingual Hero Banner CMS

- **Online Checkout Cart Preservation & Retry UX (`web-store/`):**
  - Updated [cart-store.ts](../web-store/src/components/shop/cart-store.ts) with `clearCart()` and pending online order tracking (`nova.pending_online_order`).
  - Updated [basket.tsx](../web-store/src/components/shop/basket.tsx):
    - `cod` orders immediately clear the cart and redirect to `/orders?placed=cod&order=<id>`.
    - Online orders (`paymob_card` / `paymob_wallet`) **do not** clear the cart during order creation or `/api/payments/paymob/initiate`; instead they render a full-screen bilingual redirecting screen (`جاري تحويلك إلى بوابة الدفع الآمنة...` / `Redirecting to secure payment gateway...`) preventing any empty-cart flash.
  - Added [orders-payment-sync.tsx](../web-store/src/components/shop/orders-payment-sync.tsx) in `/orders`: clears the cart ONLY on `?payment=success` or when the pending online order reaches `payment_status === 'paid'`, rendering a prominent bilingual confirmation banner (`تم الشراء والدفع بنجاح!` / `Purchase & Payment Confirmed!`). On `?payment=failed`, keeps the cart intact.
  - Upgraded [tracking.tsx](../web-store/src/components/shop/tracking.tsx): renders a bilingual **"إعادة محاولة الدفع / Retry Payment"** button on `pending` or `failed` online orders (calling `POST /api/payments/paymob/initiate`, with inline 11-digit Egyptian wallet validation for wallet orders).
- **Full Bilingual Hero Banner CMS & Visibility Controls (`store_settings.ui_config.pages.home`):**
  - Extended [ui-config.ts](../web-store/src/lib/ui-config.ts) with backward-compatible Hero CMS fields (`hero_visible`, `hero_badge_visible`, `hero_badge_ar`, `hero_badge_en`, `hero_title_ar`, `hero_title_en`, `hero_subtitle_ar`, `hero_subtitle_en`, `hero_cta_visible`, `hero_cta_text_ar`, `hero_cta_text_en`, `hero_cta_link`, `hero_image_url`, `hero_overlay_opacity`), with graceful fallbacks to localized defaults when unset.
  - Added `uploadHeroBannerImage` server action in [mutations.ts](../web-store/src/app/admin/mutations.ts) uploading PNG/JPG/WEBP banners (`<= 5 MB`) to Supabase Storage `product-images` under `banners/<store_id>/<uuid>.<ext>`.
  - Added the 100% bilingual **"محتوى البانر الرئيسي / Hero Banner Content"** card inside `/admin/customizer` (`الرئيسية / Home` tab) in [customizer-studio.tsx](../web-store/src/app/admin/customizer/customizer-studio.tsx) with master show/hide toggle, badge/headline/subtitle/CTA controls + route preset buttons, image upload/URL/remove, and overlay darkness slider (`0–80%`), reflected live in [preview-frame.tsx](../web-store/src/app/admin/customizer/preview-frame.tsx) across Desktop/Mobile and AR/EN.
  - Updated [hero.tsx](../web-store/src/components/shop/hero.tsx) and [page.tsx](../web-store/src/app/(shop)/page.tsx) to render nothing (zero spacer gap) when `hero_visible === false`, hide empty subtitles, conditionally render badge/CTA, and display `hero_image_url` + dark overlay scrim.
- **Verification & Cleanup:**
  - Verified live in Chrome (`Nova Store`, AR & EN, `0` console errors, `0` HTTP `>= 400`): online checkout redirecting screen with zero empty-cart flash, failed return keeping cart at `1` + working `إعادة محاولة الدفع / Retry Payment` (`HTTP 200` Paymob initiation), success return clearing cart to `0` + confirmation banner, Hero Banner bilingual editing + individual element hiding + master hide/show toggle (`0` hero elements when hidden) + restored defaults (`hero_visible: true`).
  - Removed test order `cddb8534-badd-4970-9626-5777f796c152` and restored product stock.

### Shared Phase 8b Hero Banner CMS Schema (`store_settings.ui_config.pages.home` — Android Sync)

```json
{
  "hero_visible": true,
  "hero_badge_visible": true,
  "hero_badge_ar": "",
  "hero_badge_en": "",
  "hero_title_ar": "",
  "hero_title_en": "",
  "hero_subtitle_ar": "قطع منتقاة بعناية تجمع بين الأناقة الهادئة وجودة التفاصيل اليومية.",
  "hero_subtitle_en": "Curated pieces blending quiet elegance with everyday craftsmanship.",
  "hero_cta_visible": true,
  "hero_cta_text_ar": "",
  "hero_cta_text_en": "",
  "hero_cta_link": "/products",
  "hero_image_url": null,
  "hero_overlay_opacity": 45
}
```

- **Android Rendering Rules (`android-app/`):**
  - If `hero_visible == false` (or `homeSections` hero item `visible == false`), omit the Hero Banner composable completely with zero vertical spacer.
  - If `hero_badge_visible == false`, omit the badge chip; if `hero_subtitle_ar`/`hero_subtitle_en` for the active language is empty (`""`), omit the subtitle text; if `hero_cta_visible == false`, omit the CTA button.
  - When `hero_image_url` is non-null, render it as the Hero background with a dark scrim alpha of `hero_overlay_opacity / 100f` (clamped `0f..0.8f`).
  - On Paymob online checkout in Android, keep the local cart intact until order `payment_status == "paid"` is confirmed, and expose a Retry Payment action on `pending`/`failed` online orders calling `POST /api/payments/paymob/initiate`.

## Android synchronization through Phase 8b — 2026-11-24

- **Configuration.** The app module reads `SUPABASE_URL`, `SUPABASE_ANON_KEY` (publishable client credential), `STORE_ID` and `WEB_STORE_BASE_URL` from Android local.properties or the environment. Local values take precedence. The default tenant UUID is `00000000-0000-0000-0000-000000000001`. The emulator uses `http://10.0.2.2:3000` to reach the host web app. Set an HTTPS web origin for physical devices and release builds. Keep Paymob and Supabase service credentials on the web server.
- **Database.** Applied `shared/android-phase-8-sync.sql` in the project's Supabase SQL Editor. Mobile checkout locks the configured settings and product rows before calling the existing transactional checkout. The coupon and support entry points check the active store, guest tracking matches tenant, order UUID and phone, and account orders filter by tenant and user. Categories use a tenant-filtered inner join to products. The original checkout still relies on one active settings row per database. Local cart and receipt storage are tenant-specific.
- **Storefront.** Android refreshes settings on resume. The theme reads published colors and radius and the hero consumes `ui_config.pages.home`. Hidden sections occupy no grid item. The top-bar language switch overrides `ui_config.defaultLanguage` per tenant and applies RTL/LTR. Catalog models expose English merchant translations where supplied.
- **Payments.** Checkout uses merchant flags, wallet validation and server-calculated coupon discounts. COD settles purchased lines on confirmation. Card and wallet preserve the cart, initiate payment through the web API, and show the hosted page in a WebView. An Orders redirect triggers verification. Only a paid database status settles online purchases. Settlement is idempotent per local receipt. Orders display payment, fulfillment and carrier/tracking information, with retry on eligible online orders.
- **Database verification.** The live SQL Editor reported success for the migration and for a rolled-back transaction creating COD, card and wallet orders. The transaction asserted initial payment statuses and that a foreign store could not track each guest order. Test changes to stock, payment flags, customers and orders were rolled back. Public-client reads returned HTTP 200 for scoped settings and categories.
- **Build verification.** Gradle ran with JBR 21. Both `assembleDebug` and `testDebugUnitTest` passed. JUnit reported 11 tests, zero failures and zero errors. Hosted Paymob payment completion and webhook delivery remain unverified on Android.
- **Emulator verification.** Opened the live catalog in Arabic, switched to English, opened a translated product, selected a size, added it to the cart and reached checkout. Confirmed that all three enabled methods appeared and selecting Mobile wallet displayed the Egyptian phone requirement. No order was submitted from this emulator run.

### Android Audit & Full Phase 8b Storefront Parity Completion — 2026-11-24

- **Audit & Surgical Fixes:** Audited Codex's partial Android edits and `shared/android-phase-8-sync.sql` against `web-store/` (Phases 1–8b). Confirmed `web-store/src/app/api/payments/paymob/{initiate,callback,webhook}` required zero changes. Scoped all Android DataStore preference keys (`cart`, `saved_local_orders`, `local_support_tickets`, `theme_mode`, and idempotent settlement markers) by `BuildConfig.STORE_ID` for strict multi-tenant local isolation.
- **Dynamic Theme & Bilingual Hero Banner CMS (`HomeScreen.kt`, `StoreSettingsDto.kt`):** Enforced zero empty spacer gap whenever `hero_visible == false` or `ui_config.homeSections` hides `hero_banner`; resolved `hero_image_url` (HTTPS or Storage path) via Coil with `hero_overlay_opacity` scrim (`0–80%`, default `45%`) and `heroBg`/theme gradient fallback; hid empty subtitles and toggled badge/CTA visibility cleanly with route deep-linking (`/products`, `/products?category=...`, `/orders`, `/contact`).
- **Smart Bilingual Search (`CatalogRepositoryImpl.kt`, `CatalogViewModel.kt`, `CatalogScreen.kt`, `SearchSynonyms.kt`):** Replaced single-column `ilike` with `public.search_products_fast(p_store_id, p_query, p_limit, p_category_id, p_offset)` backed by a bounded 50-entry / 60s TTL in-memory LRU cache, 180ms coroutine debounce, 0ms 15-category bilingual synonym hint chips, and a localized closest-match banner.
- **Size & Measurements Guide, Stock Clarity & Specs (`ProductDetailScreen.kt`, `SizeGuideSheet.kt`, `ProductDto.kt`):** Added `products.specifications` JSONB parsing and Apple/Zara-style bilingual Specifications table, interactive Material 3 `SizeGuideSheet` (`دليل المقاسات والقياسات` / `Size & Measurements Guide` with auto-detected Apparel, Pants, and Shoes tabs), and clear low-stock / out-of-stock indicators on variant chips.
- **Paymob WebView & Cart Protection (`PaymentFlow.kt`, `CheckoutScreen.kt`, `CheckoutViewModel.kt`, `OrdersScreen.kt`, `CarrierLocalizer.kt`):**
  - Fixed a critical `WebViewClient.shouldOverrideUrlLoading` bug that previously blocked debug `http://10.0.2.2:3000/api/payments/paymob/callback` redirects and added debug `localhost`/`127.0.0.1` -> `10.0.2.2` rewriting.
  - Added bilingual loading overlay, normalized Egyptian wallet phone validation (`^01[0125][0-9]{8}$`), styled Payment Methods & Promo Code cards, and cart preservation for online orders until `/orders?payment=success` or DB `payment_status == "paid"` is confirmed.
  - Added prominent top emerald **"تم الشراء والدفع بنجاح / Purchase & Payment Confirmed"** banner (and failure/cancellation retry banners), embedded payment/carrier badges + Bosta/Aramex/Mylerz/Egypt Post localization & external tracking links + **"إعادة محاولة الدفع / Retry Payment"** actions directly inside order cards, and removed remaining mixed-language leaks (`(Order Number)`, `(UUID)`, raw carrier names).
- **Verification:** `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon` passed with **0 errors and 0 Kotlin compiler warnings** (`app-debug.apk`, `21.8 MB`); **15 / 15 JUnit unit tests passed** across 7 suites (`PhoneNormalizerTest`, `BrandColorParserTest`, `ColorSwatchMapperTest`, `ProductModelTest`, `PublishedSettingsTest`, `CatalogSortingTest`, `SearchSynonymsTest`). `web-store/` was not modified.


### GitHub Releases In-App Self-Updater, CI/CD Release Pipeline & Security Audit — 2026-11-24

- **Security Audit & `.gitignore` Hardening:**
  - Audited `web-store/`, `android-app/`, `shared/`, and `docs/` for leaked credentials (zero real `sb_secret_`, JWT, or Paymob API secrets found outside local ignored files).
  - Created root `.gitignore` and hardened `web-store/.gitignore` & `android-app/.gitignore` to strictly ignore `.env`, `.env.*`, `web-store/.env*`, `android-app/local.properties`, `keystore.properties`, `*.jks`, `*.keystore`, `*.log`, `node_modules/`, `.next/`, `.gradle/`, `.kotlin/`, and `**/build/`, while explicitly keeping `!.env.example` and `!local.properties.example`.
  - Added `web-store/.env.example` (documenting `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and per-tenant Paymob storage in `store_payment_secrets`) and updated `android-app/local.properties.example` with `STORE_ID`, `WEB_STORE_BASE_URL`, and `GITHUB_REPO`.
- **Android Release Signing & Dynamic Versioning (`android-app/app/build.gradle.kts`, `proguard-rules.pro`):**
  - Added conditional `release` `signingConfig` reading `KEYSTORE_FILE`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, and `KEY_PASSWORD` from environment variables or `android-app/keystore.properties`, gracefully falling back to `debug` signing when release keystore credentials are absent.
  - Added `-PVERSION_CODE` and `-PVERSION_NAME` Gradle property overrides plus `BuildConfig.ENABLE_GITHUB_UPDATER` (default `true`) and `BuildConfig.GITHUB_REPO` (resolved from Gradle property -> `local.properties` -> `GITHUB_REPO` env -> `"OWNER/WhiteLabelCommerce"`).
  - Declared explicit `com.squareup.okhttp3:okhttp:4.12.0` in `libs.versions.toml` and added Kotlinx Serialization keep rules for `com.whitelabel.commerce.core.updater.**` in `proguard-rules.pro`.
- **GitHub Releases In-App Self-Updater (`android-app/app/src/main/java/com/whitelabel/commerce/core/updater/`):**
  - Added `REQUEST_INSTALL_PACKAGES` permission, `androidx.core.content.FileProvider` (`${applicationId}.fileprovider` backed by `res/xml/file_paths.xml`), and `PackageReplacedReceiver` (`ACTION_MY_PACKAGE_REPLACED` auto-relaunching `MainActivity`) in `AndroidManifest.xml`.
  - Implemented `GitHubReleaseUpdater` (queries `https://api.github.com/repos/${BuildConfig.GITHUB_REPO}/releases/latest` with `Accept: application/vnd.github+json`, compares semantic/run versions via `ReleaseVersionComparator`, streams `.apk` download via OkHttp into `cacheDir/updates/` with `0f..1f` progress + size integrity checks, handles Android 8+ `ACTION_MANAGE_UNKNOWN_APP_SOURCES`, and fires `Intent.ACTION_VIEW` with `FileProvider` URI + `FLAG_GRANT_READ_URI_PERMISSION`).
  - Implemented `AppUpdateViewModel` and Material 3 bilingual (`AR` RTL / `EN` LTR) `AppUpdateDialog` wired into `MainActivity`, automatically resuming installation when returning from Android's unknown-sources permission screen.
- **GitHub Actions CI/CD Release Workflow (`.github/workflows/android-release.yml`):**
  - Triggers on `push` to `main`/`master` (and `workflow_dispatch`), sets up JDK 17 + Android SDK + Gradle cache, decodes optional `secrets.ANDROID_KEYSTORE_BASE64` to `android-app/release.keystore`, computes `VERSION_CODE = github.run_number + 10` and `VERSION_NAME = 1.0.<run_number>`, runs `./gradlew assembleRelease -PVERSION_CODE=... -PVERSION_NAME=...`, and publishes a GitHub Release (`softprops/action-gh-release@v2`) tagged `v$VERSION_NAME` with the built `.apk` attached and auto-generated release notes.
- **Verification:** `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon` passed with **0 errors and 0 Kotlin compiler warnings**; **22 / 22 JUnit unit tests passed** across 9 test suites (including 3 new tests in `ReleaseVersionComparatorTest` and 4 in `PaymobPostPayTest`). `web-store/` runtime code was untouched.


### Phase 9 & 10: Unified Customer Auth, Release Payment Config, Cascading Egypt Addresses, Home Search, COD Retry Fallback, Animated Order Tracker & Promo Banner Carousel — 2026-11-24

- **Unified Customer Auth & Account Sync (`shared/phase-9-unified-auth.sql`, `web-store/`, `android-app/`):**
  - Applied `shared/phase-9-unified-auth.sql` in Supabase SQL Editor (`store_customers.governorate` column + upgraded 5-arg `sync_customer_profile` claiming guest orders matching Egyptian phone variants `01x`/`201x` or case-insensitive email).
  - Hardened `web-store` `/account` & `/login` with `HybridAuthPanel` (6-digit Email OTP with 60s resend cooldown + Email/Password Sign In & Sign Up) and `/checkout` auto-fill while preserving Guest Checkout.
  - Added tenant-scoped persistent `DataStoreSessionManager`, `AuthRepositoryImpl`, bilingual `AuthScreen`, `AccountScreen` (`حسابي / My Account`), TopAppBar Account button, Checkout auto-fill, and reactive `OrdersViewModel` sync in `android-app/`.
- **Release Payment Gateway URL, Flavor LAN Config & 15s Timeout (`android-app/`, `.github/workflows/android-release.yml`):**
  - Uploaded `WEB_STORE_BASE_URL` to GitHub Actions Secrets and wired `${{ secrets.WEB_STORE_BASE_URL || vars.WEB_STORE_BASE_URL }}` in CI.
  - Added flavor-specific `res/xml/network_security_config.xml` (`github` allows local LAN HTTP with strict runtime host allowlist in `PaymentFlow.kt`; `playstore` enforces strict HTTPS-only).
  - Upgraded `PaymentFlow.kt` to 15-second OkHttp connect/read/write timeouts + 15-second WebView load watchdog + main-frame error handling with localized Retry and Switch-to-COD actions.
- **27-Governorate Cascading Egypt Addresses (`web-store/src/lib/egypt-locations.ts`, `egypt-address-fields.tsx`, `EgyptLocations.kt`, `EgyptAddressPicker.kt`):**
  - Added complete bilingual (`AR`/`EN`) dataset of all 27 Egyptian governorates and comprehensive cities/districts, wired into Checkout and Account saved profiles on both web and Android with searchable picker & automatic city reset on governorate change.
- **Home Screen Search Bar (`HomeViewModel.kt`, `HomeScreen.kt`):**
  - Added prominent bilingual search bar at top of Android `HomeScreen` with 0ms local fuzzy Arabic/English filtering + 180ms debounced `search_products_fast` full-catalog search and inline results grid.
- **Cash on Delivery (`COD`) Retry Fallback (`shared/phase-10-cod-fallback.sql`, `orders/actions.ts`, `tracking.tsx`, `OrdersScreen.kt`, `PaymentFlow.kt`):**
  - Applied `shared/phase-10-cod-fallback.sql` widening `orders_payment_status_check` with `'cod_pending'` and adding secure `public.switch_order_to_cod` RPC.
  - Upgraded Retry Payment sheets on both web and Android to offer all 3 options (**Bank Card**, **Mobile Wallet**, **Cash on Delivery**) updating `payment_method = 'cod'`, `payment_status = 'cod_pending'`, and `status = 'confirmed'`.
- **Animated Order Status Tracker (`StatusComponents.kt`, `tracking.tsx`, `globals.css`):**
  - Upgraded `OrderTimelineStepper` (Android) with `animateFloatAsState` progress rail, `rememberInfiniteTransition` active-stage pulsing halo, `AnimatedContent` checkmarks, and carrier/Bosta tracking pill; matched with smooth CSS progress fill and pulsing active halo on web `/orders`.
- **Multi-Campaign Promotional Banner Carousel (`ui-config.ts`, `promo-banners-editor.tsx`, `hero.tsx`, `StoreSettings.kt`, `HomeScreen.kt`):**
  - Added `promo_banners` list to `ui_config.pages.home` (backward-compatible with single Hero Banner) with full Admin Customizer CRUD/reorder/toggle editor, web animated carousel (hover/touch pause, swipe/arrow controls, indicator pills), and Android `HorizontalPager` carousel (`graphicsLayer` scale/alpha transition, touch-pausing auto-scroll, expanding dot indicators, category/product deep-link navigation).
- **Verification:**
  - `web-store/`: `npx tsc --noEmit`, `npm run lint -- --max-warnings 0`, and `npm run build` passed with **0 errors and 0 warnings**; live browser verification on `http://localhost:3000` passed across `/checkout`, `/`, `/orders`, `/account`, and `/login` with 0 console errors.
  - `android-app/`: `.\gradlew.bat testGithubDebugUnitTest assembleGithubDebug assemblePlaystoreDebug --no-daemon` passed (`BUILD SUCCESSFUL`, **27 / 27 JUnit unit tests passed** across 11 suites).


### Phase 9 (Unified Smart Notification Engine — FCM + Web Push + Supabase Realtime + `/admin/notifications`) — 2026-11-24

- **Database Schema, Strict Multi-Tenant RLS & Realtime (`shared/phase-9-notifications.sql`):**
  - Applied idempotently in the live Supabase SQL Editor (`zpabcnskkbpplurngtle`) and verified via rolled-back transaction (`tables_count: 5`, `realtime_enabled: 1`, `rpc_push_ok: true`).
  - **Tables created (all scoped by `store_id` referencing `store_settings(store_id)` with RLS enabled):**
    1. `public.push_subscriptions` (`store_id`, `user_id`, `guest_session_id`, `phone`, `platform` in `('android','web')`, `token`, `locale` in `('ar','en')`, `is_active`, `last_seen_at`, `created_at`; unique on `(store_id, platform, token)`). Policies: `admin_manage_push_subscriptions` (`is_store_admin(store_id)`), `user_manage_own_push_subscriptions` (`user_id = auth.uid()`).
    2. `public.notifications` (`store_id`, `user_id`, `target_role` in `('customer','admin')`, `category` in `('order_update','payment_recovery','abandoned_cart','back_in_stock','promo_campaign','admin_alert')`, `title_ar`, `title_en`, `body_ar`, `body_en`, `deep_link`, `data jsonb`, `dedupe_key text unique`, `is_read`, `sent_push`, `created_at`; `REPLICA IDENTITY FULL` + added to `supabase_realtime` publication). Policies: `admin_manage_notifications`, `customer_read_own_notifications`, `anon_read_public_promo_notifications`, `customer_mark_own_notifications_read`.
    3. `public.back_in_stock_subscriptions` (`store_id`, `product_id`, `variant_key`, `user_id`, `phone`, `push_token`, `notified_at`, `created_at`; partial unique indexes for pending per-user and per-phone subscriptions). Policies: `admin_manage_back_in_stock`, `user_read_own_back_in_stock`.
    4. `public.notification_preferences` (`user_id`, `store_id`, `order_updates`, `promotions`, `restock_alerts`, `quiet_hours_start` default `'23:00'`, `quiet_hours_end` default `'09:00'`). Policies: `admin_read_notification_prefs`, `user_manage_own_notification_prefs`.
    5. `public.cart_sessions` (`store_id`, `user_id`, `guest_session_id`, `phone`, `push_token`, `locale`, `item_count`, `subtotal`, `abandoned_notified_at`, `updated_at`) for abandoned cart tracking.
  - **`SECURITY DEFINER` RPCs:** `public.register_push_subscription(...)` and `public.subscribe_back_in_stock(...)` granted to `anon, authenticated` for safe guest + logged-in device/restock registration without exposing direct table writes.
- **Backend Dispatch Engine (`web-store/src/lib/notifications/dispatcher.ts`):**
  - Native Node `crypto` RS256 OAuth2 JWT token exchange + **FCM HTTP v1** (`https://fcm.googleapis.com/v1/projects/{projectId}/messages:send`) for both Android (`orders_channel` / `promotions_channel`) and Web Push (`webpush.fcm_options.link`).
  - Gracefully stores in-app Supabase Realtime notifications when Firebase credentials are absent in local dev; automatically deactivates expired/unregistered tokens (`UNREGISTERED` / HTTP 404).
  - Enforces `dedupe_key` idempotency, per-user `notification_preferences`, and **Africa/Cairo Quiet Hours (`23:00–09:00`)** suppressing non-urgent push notifications (`promo_campaign`, `abandoned_cart`) while allowing urgent transactional/restock alerts (plus optional admin flash-drop override).
  - Includes `notifyStoreAdmins(...)` helper targeting all store admins for a tenant `store_id`.
- **Automated Event Triggers (`web-store/src/lib/notifications/events.ts`) & API Routes:**
  - **Checkout (`(shop)/checkout/action.ts`):** Fires `notifyOrderCreated` (customer COD confirmation, store admin new-order alert, and admin low-stock alerts whenever ordered product `stock <= 3`).
  - **Paymob Webhook (`api/payments/paymob/webhook/route.ts`):** Fires `notifyPaymentOutcome` on verified HMAC-SHA512 `'paid'` or `'failed'` payment status updates.
  - **Admin Order & Product Mutations (`admin/mutations.ts`):** `updateOrder` fires `notifyOrderStatusChanged` (`confirmed`, `shipped` with carrier/Bosta tracking number, `delivered`, `cancelled`); `saveProduct` detects `previousStock <= 0 && stock > 0` transitions and fires `notifyBackInStock` to all waiting subscribers.
  - **Recovery Cron (`api/notifications/cron/recovery/route.ts`):** `GET`/`POST` endpoint (protected by optional `CRON_SECRET`) scanning `cart_sessions` inactive `> 1h` (abandoned cart reminder) and unpaid online `orders` `> 20m` (payment recovery alert).
  - **Notification APIs:** `/api/notifications/register`, `/api/notifications/back-in-stock`, `/api/notifications/inbox` (`GET` & `PATCH`), `/api/notifications/cart-heartbeat`, and `/api/notifications/cron/recovery`.
- **Storefront & Admin UI (`web-store/`):**
  - **Web Push Service Worker:** `web-store/public/firebase-messaging-sw.js` handling background push display and `notificationclick` deep-link navigation.
  - **Live Realtime Notification Bell & Drawer (`src/components/notifications/notification-bell.tsx`, `src/lib/supabase/browser.ts`):** Mounted in both Storefront topbar (`navigation.tsx`) and Admin topbar (`admin/layout.tsx`, `scope="admin"`), subscribed via Supabase Realtime (`postgres_changes` on `public.notifications` filtered by `store_id`), with live unread badge, browser Push subscription flow (`NEXT_PUBLIC_FIREBASE_VAPID_KEY`), mark-read / mark-all-read, and deep-link navigation in pure `AR` (RTL) / `EN` (LTR).
  - **Back-in-Stock Widget (`src/components/shop/buy.tsx`) & Cart Heartbeat (`src/components/shop/cart-store.ts`):** Out-of-stock product detail pages render a bilingual **"نبّهني عند التوفر / Notify Me When Available"** form calling `/api/notifications/back-in-stock`; cart mutations sync debounced heartbeats to `/api/notifications/cart-heartbeat`.
  - **Admin Campaign Studio (`/admin/notifications` — `page.tsx`, `campaign-studio.tsx`, `admin/nav.tsx`):** Bilingual KPI dashboard (Android FCM vs Web Push active subscribers, read rate, pending restock alerts), targeted broadcast composer (`all` / `registered` / `buyers`), Arabic & English title/body inputs, deep-link route picker (Home / Products / Specific Product / Category / Cart / Orders / Custom), live AR/EN push preview mock, quiet-hours bypass toggle, one-click Recovery Scan trigger, and sent campaigns & automated trigger log table.
- **Required `.env.local` Keys (Documented in `web-store/.env.example`; never committed):**
  - Server-only: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `CRON_SECRET`.
  - Public Web Push (optional): `NEXT_PUBLIC_FIREBASE_VAPID_KEY`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`.
- **Verification:**
  - `npx tsc --noEmit` (0 errors), `npm run lint -- --max-warnings 0` (0 errors, 0 warnings), and `npm run build` (21/21 routes compiled cleanly).
  - Supabase SQL migration applied & rolled-back verification returned `tables_count: 5`, `realtime_enabled: 1`, `rpc_push_ok: true`.
  - Live Chrome check at `http://localhost:3000` verified storefront Notification Bell, pure AR/EN slide-over Notification Drawer, cart heartbeat sync, and `/admin/notifications` auth guard with 0 console errors and 0 5xx responses.


### Phase 9b (Complete Firebase Web Push Setup, Notification Drawer Portal Fix & Android `v1.1.0` Release) — 2026-11-25

- **Firebase Web App & Web Push SDK (`web-store/src/lib/notifications/web-push.ts`, `web-store/.env.example`, `web-store/package.json`):**
  - Registered `NovaSaas Web Store` Web App inside Firebase project `novasaas-4c25d` and populated all client/server keys in local gitignored `web-store/.env.local` (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_FIREBASE_VAPID_KEY`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`).
  - Installed `firebase` Web SDK in `web-store/` and created `syncWebPushSubscription(lang)` using `firebase/messaging` (`getToken` with `vapidKey` and `/firebase-messaging-sw.js`, plus PushManager fallback) so browsers with granted notification permission automatically register and refresh their Web Push subscription via `POST /api/notifications/register` on mount and language/user change.
- **Full-Viewport Notification Drawer Portal Fix (`web-store/src/components/notifications/notification-bell.tsx`, `web-store/src/app/globals.css`):**
  - Portaled the Notification Drawer and backdrop to `document.body` via `createPortal(..., document.body)` (SSR-safe `useSyncExternalStore` client gate) with `fixed inset-0 z-[100] h-dvh` and body scroll lock so the sticky `<header>` (`backdrop-filter: blur`) never clips the slide-over drawer.
- **Verification:** `npx tsc --noEmit`, `npm run lint -- --max-warnings 0`, and `npm run build` passed with **0 errors and 0 warnings**; verified full-viewport portaled drawer and live Web Push subscription registration (`platform = 'web'`) on `http://localhost:3000`.


### Phase 9c & 9d (Admin Notification Deletion, Broadcast `read_at` RPC, External Push Read Sync, Table Overflow Fix & AR Copy Polish) — 2026-11-25

- **Supabase Migrations Applied & Verified Live (`shared/phase-9-notifications-delete.sql`, `shared/phase-9-notifications-read-rpc.sql`):**
  - Added `read_at timestamptz` column to `public.notifications` with `trg_sync_notification_read_fields` keeping `is_read` and `read_at` synchronized, enforced `REPLICA IDENTITY FULL` for Realtime `DELETE` old-record payloads, and added explicit `DELETE` & `UPDATE` RLS policies (`admin_delete_notifications`, `customer_delete_own_notifications`, `admin_update_notifications`, `customer_mark_own_notifications_read`). Verified: `has_read_at: true`, `delete_policies_count: 2`, `update_policies_count: 2`, `replica_identity: "f"`.
  - Added `SECURITY DEFINER` RPC `public.mark_notifications_read(p_store_id uuid, p_notification_ids uuid[] default null, p_mark_all boolean default false)` granted to `anon, authenticated` so personal notifications, admin alerts, and public broadcast campaigns (`user_id IS NULL`) reliably persist `is_read = true` and `read_at = coalesce(read_at, now())`. Rolled-back verification on a broadcast row returned `updated_count: 1`, `is_read: true`, `has_read_at: true`.
- **Admin Deletion & Inbox API (`web-store/src/app/admin/mutations.ts`, `web-store/src/app/api/notifications/inbox/route.ts`, `web-store/src/app/admin/notifications/`):**
  - Added `deleteAdminNotifications({ ids?, mode: "single" | "selected" | "read" | "all" })` strictly scoped to `store_id`.
  - Upgraded `/api/notifications/inbox`: `PATCH` calls `mark_notifications_read` RPC (supporting `id`, `ids`, `markAll`, `mark_all`); added `DELETE` handler supporting `?id=<uuid>` and `?clearAll=true`.
  - Upgraded `/admin/notifications` log table with per-row Delete buttons, Select All + per-row checkboxes, bulk **"حذف المحدد (N) / Delete Selected (N)"**, header **"مسح المقروء / Clear Read"** & **"مسح الكل / Clear All"** with inline confirmation bar, and clearly separated Delivery Channel (`Push مرسل` / `داخل التطبيق`) vs Read State (`مقروء` / `غير مقروء`) columns.
  - Fixed horizontal table overflow on long UUID deep-link URLs by enforcing `min-w-0 max-w-full` across `.workspace`/`.content`/`.card`/`.notif-studio`, `w-full max-w-full overflow-x-auto` on `.scroll`, `max-w-[170px] truncate block` (`dir="ltr"` + tooltip) on the Deep Link column, and `min-w-[240px] max-w-[340px]` wrapping on Title & Message.
- **Realtime `DELETE` Sync, External Push Tap Mark-Read & AR Copy Polish (`notification-bell.tsx`, `firebase-messaging-sw.js`, `dispatcher.ts`, `events.ts`):**
  - Subscribed `NotificationBell` to Supabase Realtime `DELETE` and `UPDATE` events (vanishing admin-deleted rows immediately and updating unread counts), added per-item delete and header Clear All buttons, and added `?notif_id=<uuid>` URL listener to auto-mark external Web Push clicks as read.
  - Updated `dispatcher.ts` (`webpush.fcm_options.link`) and `public/firebase-messaging-sw.js` (`notificationclick`) to pass `notif_id=<notification_id>` and call `PATCH /api/notifications/inbox` on click.
  - Polished Arabic notifications in `events.ts` to format `EGP` as `ج.م` and wrap short order codes in Unicode LTR isolates (`\u2066#xxxxxxxx\u2069`) so `#` renders naturally in RTL prose.
- **Verification:** `npx tsc --noEmit` (0 errors), `npm run lint -- --max-warnings 0` (0 errors, 0 warnings), `npm run build` (21/21 routes); live Chrome verification confirmed broadcast click -> `PATCH /api/notifications/inbox` HTTP 200 (`{"ok":true,"updatedCount":1}`), persisted `read_at` after reload, `?notif_id=` auto-read & URL cleanup, 0 console errors, and QA row cleanup verified (`0` remaining).


### Pre-Phase 10: Streamlined `/admin/customizer` Studio UX + Animated Multi-Slide Hero Carousel (Web & Compose Android) + Android `v1.1.1` — 2026-11-25

- **Streamlined `/admin/customizer` Studio UX (`customizer-studio.tsx`, `promo-banners-editor.tsx`, `preview-frame.tsx`, `customizer.css`):**
  - Replaced the stacked vertical sidebar + 7-tab wall with **3 Clean Top-Level Tabs** pinned at the top of the independently scrollable controls column:
    1. **المظهر والقوالب / Theme & Presets:** Compact 2×2 Quick-Start Templates (preserving `promo_banners`, `hero_*`, and `homeSections`), Default Storefront Language (`AR`/`EN`), global brand colors, corner border radius, motion intensity, and Reset Defaults.
    2. **البانرات والعروض / Banners & Carousel:** Elevated **«كاروسيل البانرات الترويجية / Promotional Banner Carousel»** directly to the top with collapsible slide cards (thumbnail preview, Add, Edit, Move Up/Down, Toggle Active, Delete, **Supabase Storage Image Upload** + URL input, bilingual AR/EN badge/title/subtitle/CTA, and deep-link route target + category quick-picks), with Hero Layout/Colors/Auto-Play Speed/Scrim Darkness and Fallback Single Hero Banner CMS cleanly tucked into collapsible sub-cards underneath.
    3. **تخصيص الصفحة / Page Settings:** Shows ONLY the active preview page's settings with a clear active-page indicator badge (`الرئيسية`, `الأقسام`, `المنتجات`, `التفاصيل`, `السلة`, `الطلبات`).
  - Removed the duplicate «الصفحة المستهدفة» page selector from the sidebar; kept **ONE synchronized 6-page switcher** in the preview toolbar that updates both the Live Preview and auto-syncs the «تخصيص الصفحة» tab.
  - Added **«توسيع المعاينة / Expand Preview»** toggle in the compact top action bar, sticky generous Live Preview (now rendering the live animated `PromoBannerCarousel` in real time), and single clean scroll without nested scrollbar traps.
- **Seeded 3 Rich Bilingual Carousel Slides in Supabase (`store_settings.ui_config.pages.home.promo_banners`):**
  - Populated Nova Store (`00000000-0000-0000-0000-000000000001`) with 3 bilingual slides (`bannerSpeedMs = 4500`):
    1. `slide-new-season`: **تشكيلة الموسم الجديدة / New Season Collection** (`/products?category=0af2454c-8e56-49d6-ba06-c624b758887c`)
    2. `slide-nova10-offer`: **خصم فوري 10% بكود NOVA10 / Instant 10% Off with NOVA10** (`/products`)
    3. `slide-footwear-essentials`: **أحذية وإكسسوارات يومية / Footwear & Everyday Essentials** (`/products?category=9b6f175f-b22f-4c23-901a-643b1f2b6093`)
- **Web Storefront Carousel Polish (`hero.tsx`, `globals.css`, `ui-config.ts`):**
  - Upgraded `PromoBannerCarousel` to layered crossfade/scale transitions without image flicker, hover/touch/focus auto-play pause, pointer & touch swipe support (RTL & LTR), subtle prev/next arrows with non-overlapping horizontal safe padding, expanding pill indicators, crisp dual-layer scrim with guaranteed white contrast, and full route normalization (`/category/...`, `/product/...`, `/cart`, `/offers`).
  - Preserved 100% backward compatibility with all existing `ui_config` fields (and added fallback support for `banner_autoplay_seconds`).
- **Verification:** Passed `tsc --noEmit`, `eslint --max-warnings 0`, and `next build` (21/21 routes); live Chrome verification across `http://localhost:3000` and `http://localhost:3000/admin/customizer` in AR (RTL) & EN (LTR) at Desktop (`1440px`) and Mobile (`390px`) confirmed 3-slide carousel rendering, 3-tab studio UX, single synced 6-page switcher, live reorder/toggle preview sync, expand-preview toggle, 0 console errors, 0 HTTP `>= 400` responses, and 0 horizontal overflow.


### Phase 10A: Quick Pre-Flight Polish, Gamified Free-Shipping Cart Progress Bar & Atomic Store Credit / Cashback Wallet — 2026-11-25

- **Quick Pre-Flight UI Polish (`web-store/src/app/(shop)/page.tsx`, `hero.tsx`, `shop.css`, `globals.css`):**
  - Wrapped rendered homepage `homeSections` in `.home-sections-stack` (`flex flex-col gap-6`), establishing clean `24px` vertical separation between the promo banner and Hero Carousel while eliminating phantom gaps when either section is hidden.
  - Added `justify-items: start` on `.promo-carousel-copy` and `inline-flex w-fit self-start` (`width: fit-content; justify-self: start`) on `.hero-eyebrow` so the carousel badge pill (`وصل حديثاً` / `New Arrivals`) hugs its text tightly in both RTL (`105.9px`) and LTR (`124.85px`).
- **Database Schema, Atomic Wallet Engine & Strict RLS (`shared/phase-10a-wallet-incentives.sql`, applied live & verified):**
  - Extended `public.store_settings` with `cart_incentive_enabled` (default `true`), `free_shipping_threshold` (default `1000`), `cashback_enabled` (default `true`), and `cashback_percentage` (default `5`, checked `0–50`).
  - Extended `public.orders` with `wallet_discount`, `cashback_earned`, `'wallet'` in `orders_payment_method_check`, and upgraded generated `total` to `greatest(0, subtotal + shipping_fee - wallet_discount)` when `subtotal` is non-null.
  - Created `public.wallet_transactions` ledger with `uidx_wallet_transactions_idempotent_order` unique partial index on `(store_id, order_id, type)` for `'cashback_earned'` & `'order_refund'` (strict idempotency), strict RLS (customer reads own rows, store admin reads store rows, direct client writes revoked).
  - Implemented advisory-locked `SECURITY DEFINER` RPCs: `get_customer_wallet_summary`, `admin_adjust_customer_wallet`, `redeem_wallet_for_order`, `refund_wallet_for_cancelled_order` (plus automatic `nova_refund_wallet_on_cancel` trigger), and `award_order_cashback` (wired into both Admin delivery transitions and `confirm_delivery_by_token`), and upgraded `store_checkout` & `mobile_checkout` with server-side Free Shipping (`shipping_fee = 0` when `gross_subtotal >= free_shipping_threshold`) and atomic `p_use_wallet` redemption (completing zero-remaining orders as Paid via Store Wallet, skipping Paymob).
- **Storefront & Admin Wallet + Incentive UX (`web-store/`):**
  - Created `CartIncentiveBar` (`cart-incentive-bar.tsx`) rendered across `/cart` and `/checkout`, animating smoothly from remaining-amount prompt to emerald Free Shipping Unlocked (`shipping_fee = 0`).
  - Upgraded `Basket` (`basket.tsx`), `/cart`, `/checkout`, `checkout/action.ts`, `/orders`, `orders-payment-sync.tsx`, and `tracking.tsx` with live free shipping, opt-in **"استخدام رصيد المحفظة / Use Wallet Credit"** checkout toggle, zero-remaining Store Wallet completion (`?placed=wallet`), and `"مدفوع بالمحفظة / Paid via Wallet"` order badges.
  - Created `WalletSection` (`wallet-section.tsx`) on `/account` showing available balance, cashback rate pill, and full bilingual transaction history.
  - Added **"الشحن المجاني ومحفظة الكاش باك / Free Shipping & Cashback Wallet"** card in `/admin/settings` (`saveWalletIncentiveSettings`), live wallet balance badges + **"إدارة المحفظة / Manage Wallet"** modal (`adjustCustomerWallet`) in `/admin/customers`, wallet/cashback breakdown in `/admin/orders/[id]`, and automatic `award_order_cashback` + Phase 9 `notifyWalletCashback` notification on `delivered` transitions.
- **Verification & Cleanup:**
  - Applied `shared/phase-10a-wallet-incentives.sql` in Supabase SQL Editor (`Success. No rows returned`); rolled-back check verified all schema columns, idempotent index, and all `5` wallet RPCs.
  - Live Chrome E2E verification at `http://localhost:3000` (AR RTL & EN LTR) passed with `0` console errors, `0` HTTP `>= 400` responses, and `0` horizontal overflow: verified `24px` banner-to-carousel gap, compact `105.9px` AR / `124.85px` EN badge pill, Cart Progress Bar transition (`89%` -> `100%` Free Shipping), Admin `+100 EGP` credit, live `-100 EGP` wallet checkout redemption (`940 -> 840 EGP`), and `+39.50 EGP` (`5%` of `790 EGP` eligible subtotal) cashback credited once upon delivery in `/account`.
  - Cleaned up QA test order `fde15201-29af-4d40-82a7-92313fad8e42`, restored product stock, and removed QA wallet transactions & notifications (`0` remaining).
  - Passed `tsc --noEmit` (0 errors), `eslint --max-warnings 0` (0 warnings), and `next build` (21/21 routes).


---

### Phase 10B: True Multi-Tenant SaaS Engine, Self-Serve Store Onboarding & Super-Admin Portal — 2026-11-25

- **Database SaaS Schema, Provisioning RPC & Super-Admin RLS ([shared/phase-10b-saas-multitenancy.sql](../shared/phase-10b-saas-multitenancy.sql), applied live):**
  - Created `public.stores` (`slug`, `custom_domain`, `plan` in `starter|growth|enterprise`, `status` in `active|trial|suspended`, `max_products`, `owner_user_id`, `subscription_expires_at`) and backfilled `Nova Store` (`00000000-0000-0000-0000-000000000001`, `slug = 'nova-store'`, `plan = 'enterprise'`, `status = 'active'`, `max_products = 10000`).
  - Converted `public.store_settings` from singleton boolean PK to multi-tenant `store_id` PK (preserving `id = true` strictly on Nova Store for backward compatibility), scoped `public.categories` by `store_id`, replaced global `categories`/`products` slug uniqueness with per-store `(store_id, slug)` unique indexes, and enforced `is_store_admin(store_id)` RLS across all tenant tables.
  - Added `public.platform_admins` (`is_platform_super_admin()`), `public.store_members` (`get_my_managed_stores()`, multi-store `is_store_admin()`), and `trg_enforce_store_max_products` trigger enforcing plan product caps atomically.
  - Created `SECURITY DEFINER` RPCs: `check_store_slug_available`, `provision_new_store` (validating slug regex & reserved system slugs, atomically creating store + owner membership + theme-matched `store_settings` with bilingual starter slides & wallet incentives), `super_admin_list_stores_overview`, and `super_admin_update_store_plan_and_status`.
  - Upgraded `store_checkout`, `mobile_checkout`, `validate_coupon`, `mobile_coupon`, `sync_customer_profile`, `mobile_support`, and `default_order_settings` with backward-compatible tenant `p_store_id` isolation and `store_suspended` rejection.
- **Dynamic Multi-Tenant Resolution & Admin Switcher (`web-store/`):**
  - Added [tenant-shared.ts](../web-store/src/lib/tenant-shared.ts), [tenant.ts](../web-store/src/lib/tenant.ts) (`resolveActiveStore()`), upgraded [proxy.ts](../web-store/src/proxy.ts), [access.ts](../web-store/src/lib/access.ts), [db.ts](../web-store/src/lib/db.ts), and [shop.ts](../web-store/src/lib/shop.ts) supporting custom domains, subdomains (`<slug>.localhost:3000`), path-based `/s/[slug]` rewriting with `storeHref` prefixing, and zero-regression fallback to `Nova Store` on bare `localhost:3000`.
  - Scoped all storefront routes, server actions, search/notification APIs, and `/admin/*` pages & mutations strictly by active `store_id`, added [store-switcher.tsx](../web-store/src/app/admin/store-switcher.tsx) (**Active Store Switcher** + **Create Store** / **View Store** pills), added bilingual `max_products` quota pill & limit-reached enforcement in `/admin/products`, and added [suspended-store.tsx](../web-store/src/components/shop/suspended-store.tsx) + admin suspension banner.
- **Self-Serve Merchant Onboarding (`/create-store`) & Super-Admin Portal (`/super-admin`):**
  - Built bilingual `/create-store` wizard ([page.tsx](../web-store/src/app/create-store/page.tsx), [wizard.tsx](../web-store/src/app/create-store/wizard.tsx), [actions.ts](../web-store/src/app/create-store/actions.ts)) with AR/EN names, live URL preview (`/s/your-slug`), real-time slug availability check, phone/currency inputs, visual 4-preset picker, auto-switching active admin store context, and dual success CTAs.
  - Built bilingual `/super-admin` control tower ([page.tsx](../web-store/src/app/super-admin/page.tsx), [portal-client.tsx](../web-store/src/app/super-admin/portal-client.tsx), [actions.ts](../web-store/src/app/super-admin/actions.ts)) strictly guarded by `is_platform_super_admin()` with 4 Platform KPI cards, searchable/filterable Tenants Directory, **Edit Plan & Limits Modal**, immediate **Activate / Suspend** toggle, and one-click **Manage in `/admin`** / **View Live** actions, plus Super-Admin-only quick links in storefront header and admin sidebar.
- **Verification & Cleanup:**
  - Applied `shared/phase-10b-saas-multitenancy.sql` live in Supabase SQL Editor and verified `nova-store` backfill, `platform_admins` & `store_members` seeding, and all 6 SaaS RPCs.
  - Live Chrome verification at `http://localhost:3000` passed across all 7 checks (`0` console errors, `0` HTTP `>= 400`, `0` horizontal overflow): Nova Store regression check, `/super-admin` KPIs + Edit Plan modal, `/create-store` provisioning `qa-demo-store` (`Vibrant Pop`), isolated `/s/qa-demo-store` theme & empty catalog, `/admin` Active Store Switcher, `/super-admin` Suspend toggle -> Suspended Store gate, and clean Nova Store restore.
  - Deleted temporary `qa-demo-store` and confirmed `0` leftover QA rows (`1` store remaining: `nova-store`).
  - Passed `npx tsc --noEmit` (0 errors), `npm run lint -- --max-warnings 0` (0 warnings), and `npm run build` (23/23 routes).


### Phase 10B Polish: Merchant Admin Onboarding Checklist & Interactive Guided Tour — 2026-11-25

- **Per-Store Onboarding State ([onboarding-store.ts](../web-store/src/app/admin/onboarding-store.ts)):**
  - Zero-migration, zero-external-dependency reactive state persisted per `store_id` in `localStorage` (`nova.admin.onboarding.v1:<store_id>`) via `useSyncExternalStore`, plus `<OnboardingStepMarker>` and custom event triggers (`triggerAdminGuidedTour`).
- **Smart Store Launch Checklist ([launch-checklist.tsx](../web-store/src/app/admin/launch-checklist.tsx), [admin/page.tsx](../web-store/src/app/admin/page.tsx)):**
  - Collapsible & dismissible bilingual (**AR RTL / EN LTR**) **"دليل إطلاق متجرك / Store Launch Checklist"** card at the top of `/admin` with animated live progress bar (`X / 5 مكتمل`):
    1. **Add your first product** (`productsCount > 0`, auto-computed, CTA -> `/admin/products`)
    2. **Customize store theme & banners** (auto-completed on `saveUiConfig` in [customizer-studio.tsx](../web-store/src/app/admin/customizer/customizer-studio.tsx) or manual toggle, CTA -> `/admin/customizer`)
    3. **Configure shipping, cashback & payments** (auto-completed on `/admin/settings?result=ok` or manual toggle, CTA -> `/admin/settings`)
    4. **Create your first promo coupon** (`couponsCount > 0`, auto-computed, CTA -> `/admin/coupons`)
    5. **Share your live storefront** (one-click **Copy Link** for `/s/[activeStoreSlug]` auto-marking step complete + **Open Storefront** button)
  - Renders a crisp emerald celebratory banner when `5 / 5` are completed.
- **Interactive 6-Step Spotlight Guided Tour ([guided-tour.tsx](../web-store/src/app/admin/guided-tour.tsx), [admin/layout.tsx](../web-store/src/app/admin/layout.tsx), [admin/nav.tsx](../web-store/src/app/admin/nav.tsx), [store-switcher.tsx](../web-store/src/app/admin/store-switcher.tsx), [wizard.tsx](../web-store/src/app/create-store/wizard.tsx)):**
  - Custom portaled React + CSS spotlight walkthrough highlighting `data-tour` elements (`store-switcher`, `nav-products`, `nav-orders`, `nav-customers`, `nav-customizer`, `nav-settings`) with RTL/LTR-aware viewport-clamped popover positioning, safe narrow-viewport docking, **Next / Previous / Skip / Done**, step counter (`1 / 6`), and `Escape` / Arrow key support.
  - Updated `/create-store` success CTA (**"افتح لوحة تحكم متجرك / Open Store Admin"**) to route to `/admin?onboarding=1` so new merchants automatically launch the tour once per `store_id`.
  - Added compact **"جولة سريعة / Quick Tour"** (`?`) replay button in the `/admin` topbar that relaunches the tour anytime and reopens the Launch Checklist if dismissed.
- **Verification:**
  - Live Chrome check at `http://localhost:3000/admin?onboarding=1` in both EN (LTR) and AR (RTL) verified `?onboarding=1` auto-launch, all 6 tour steps + `Previous` / `Done` / `Escape`, live `2 / 5` -> `3 / 5` (Copy Link) -> `5 / 5` celebration state, Dismiss + Quick Tour reopen/relaunch, `0` console errors, `0` HTTP `>= 400`, and `0` horizontal overflow.
  - Passed `npx tsc --noEmit` (0 errors), `npm run lint -- --max-warnings 0` (0 warnings), and `npm run build` (23/23 routes).



---

### Phase 10C: Verified Product Reviews, Cloud Wishlist & Android `v1.2.0` — 2026-11-25

- **Database Schema, Rating Sync Trigger, Cloud Wishlist & Atomic RPCs ([shared/phase-10c-reviews-wishlist.sql](../shared/phase-10c-reviews-wishlist.sql), applied live):**
  - Added `avg_rating numeric(3,2) not null default 0` and `review_count integer not null default 0` (with bounds checks) to `public.products`.
  - Created `public.product_reviews` (unique on `(store_id, product_id, user_id)`, strict `store_id` scoping, `is_verified_purchase`, `status in ('published','hidden')`, `admin_reply`, `admin_replied_at`) with automatic `trg_sync_product_rating_stats` trigger recalculating `products.avg_rating` and `products.review_count` on published reviews across `INSERT`/`UPDATE`/`DELETE`, and strict RLS (public reads published, customers read own, `is_store_admin(store_id)` reads all store reviews; direct client writes revoked).
  - Created `public.wishlists` (unique on `(store_id, user_id, product_id)`, indexed on `(store_id, product_id)` for fast restock/price-drop lookups) with strict RLS (`user_id = auth.uid()`).
  - Created `SECURITY DEFINER` RPCs (`#variable_conflict use_column` + explicit `::text` casts): `can_review_product`, `submit_product_review`, `toggle_wishlist_item`, and `admin_moderate_review`.
  - Seeded 4 realistic bilingual verified reviews across Nova Store's top 3 products (including 1 merchant reply example) and reloaded PostgREST schema cache (`NOTIFY pgrst, 'reload schema'`).
  - Live Supabase verification confirmed `has_product_rating_cols: true`, `tables_exist: true`, `trigger_exists: true`, `rpcs_count: 4`, `seeded_reviews_count: 4`, and 3 populated `rated_products` (`avg_rating: 4.5 / 5.0 / 5.0`).
- **Storefront Reviews & Cloud Wishlist (`web-store/`):**
  - Added [reviews-wishlist.ts](../web-store/src/lib/reviews-wishlist.ts), [wishlist-provider.tsx](../web-store/src/components/shop/wishlist-provider.tsx), [wishlist-heart.tsx](../web-store/src/components/shop/wishlist-heart.tsx), [wishlist-grid.tsx](../web-store/src/components/shop/wishlist-grid.tsx), [wishlist/page.tsx](../web-store/src/app/(shop)/wishlist/page.tsx), [wishlist/actions.ts](../web-store/src/app/(shop)/wishlist/actions.ts), [product-reviews.tsx](../web-store/src/components/shop/product-reviews.tsx), and [products/[id]/actions.ts](../web-store/src/app/(shop)/products/[id]/actions.ts) strictly scoped by active `store_id` and `storeHref` across `/` and `/s/[slug]`.
  - Product cards ([cards.tsx](../web-store/src/components/shop/cards.tsx)) display compact warm-amber single-star badges (`★ 4.5 (2)`) only when `review_count > 0` and soft translucent circular Heart buttons (`#E11D48` active rose fill + spring pop micro-animation) mirrored in RTL/LTR; header ([navigation.tsx](../web-store/src/components/shop/navigation.tsx)) and `/account` link to `/wishlist` with a live badge counter.
  - Product detail pages ([products/[id]/page.tsx](../web-store/src/app/(shop)/products/[id]/page.tsx)) support UUID and slug lookup, render a rating jump pill + wishlist pill, and feature the full Reviews Summary Header (average score, 5 stars, clickable `5★`–`1★` distribution bars, star filter chips, Newest/Highest sort), verified purchase badges, indented Store Reply sub-cards (`border-inline-start`), tactile `46px` Write/Edit Review form, and calm neutral eligibility note for non-buyers.
- **Merchant Admin Review Moderation (`/admin/reviews`) & Wishlist Alerts (`web-store/`):**
  - Added **"التقييمات / Reviews"** to [admin/nav.tsx](../web-store/src/app/admin/nav.tsx) and built [admin/reviews/page.tsx](../web-store/src/app/admin/reviews/page.tsx) + [admin/reviews/reviews-client.tsx](../web-store/src/app/admin/reviews/reviews-client.tsx) with KPI strip (Average Rating, Total Reviews, Needs Reply, Hidden), filter tabs (`All / Needs Reply / Hidden`), one-click **Publish / Hide** pill toggle, and inline **Reply / Edit Reply** editor.
  - Wired `moderateReviewAction` in [admin/mutations.ts](../web-store/src/app/admin/mutations.ts) to dispatch Phase 9 `notifyReviewReply`, and upgraded `saveProduct` to dispatch non-blocking Phase 9 `notifyWishlistProductAlert` notifications to wishlisting customers on price drops (`price < previousPrice`) or restocks (`0 -> > 0`).
- **Verification:**
  - Live Chrome QA at `http://localhost:3000` (AR RTL & EN LTR, `1440px` Desktop & `390px` Mobile) passed across Storefront Home, Cloud Wishlist (`/` -> `/wishlist` + cleanup), Product Detail `#reviews` (summary, bars, filters, verified badges, store reply), and `/admin/reviews` (KPIs, Hide/Publish, Reply/Clear Reply restore) with `0` console errors, `0` HTTP `>= 400` responses, and `0` horizontal overflow.
  - Passed `npx tsc --noEmit` (0 errors), `npm run lint -- --max-warnings 0` (0 errors, 0 warnings), and `npm run build` (25/25 routes).

---

### Phase 11A: AOV Boost Engine (Smart Cart Upsells, Related Products & Flash Sale Countdown) + Android `v1.3.0` — 2026-11-25

- **Database Schema, Server-Safe Flash Pricing & Recommendation RPCs ([shared/phase-11a-aov-flash-sales.sql](../shared/phase-11a-aov-flash-sales.sql), applied live):**
  - Extended `public.products` with `flash_sale_price numeric(10,2)`, `flash_sale_starts_at timestamptz`, and `flash_sale_ends_at timestamptz`, check constraints (`products_flash_sale_price_check`, `products_flash_sale_window_check`), and partial index `idx_products_store_flash_deals`.
  - Added pure helper `public.get_effective_product_price(p_regular_price, p_flash_sale_price, p_flash_sale_starts_at, p_flash_sale_ends_at, p_at)` returning `flash_sale_price` strictly inside valid active windows and falling back to regular `price` once expired.
  - Upgraded `public.store_checkout` and `public.mobile_checkout` (preserving exact Phase 10B signatures) to compute line `unit_price` and `gross_subtotal` via `get_effective_product_price(...)` so expired flash deals can never be checked out at old promo prices.
  - Created strictly `store_id`-scoped `SECURITY DEFINER` RPCs (`#variable_conflict use_column`):
    - `public.get_related_products(p_store_id, p_product_id, p_limit default 6)`: ranked by historical co-purchases in `p_store_id`, same category by `avg_rating desc, review_count desc`, and top-rated store fallback.
    - `public.get_cart_upsell_products(p_store_id, p_cart_product_ids, p_gap_amount default 0, p_limit default 4)`: prioritizes active in-stock products outside the cart whose effective price closes the free-shipping gap or runs an active flash deal.
  - Seeded active 72-hour Flash Sales (`15%–25%` off) on 3 in-stock Nova Store products and reloaded PostgREST schema (`NOTIFY pgrst, 'reload schema'`).
  - Live Supabase verification confirmed `flash_cols_count: 3`, `rpcs_count: 3`, `eff_active: 750`, `eff_expired: 1000`, `seeded_flash_count: 3`, `related_count: 6`, `upsell_count: 4`.
- **Web Storefront & Merchant Admin (`web-store/`):**
  - Added pure shared flash utility [flash-sale.ts](../web-store/src/lib/flash-sale.ts) (`isFlashSaleActive`, `resolveEffectivePrice`, `getFlashSavingsPercent`, `formatFlashCountdown`, `filterActiveFlashDeals`) and isolated-ticker countdown/price components [flash-countdown.tsx](../web-store/src/components/shop/flash-countdown.tsx) using `font-variant-numeric: tabular-nums` and graceful client expiry fallback.
  - Added conditional **"عروض مؤقتة / Flash Deals"** section [flash-deals-section.tsx](../web-store/src/components/shop/flash-deals-section.tsx) inside `.home-sections-stack` on `/` & `/s/[slug]` (omitted with zero gap when no active flash deals exist).
  - Upgraded product cards ([cards.tsx](../web-store/src/components/shop/cards.tsx), [wishlist-grid.tsx](../web-store/src/components/shop/wishlist-grid.tsx)), cart state ([cart-store.ts](../web-store/src/components/shop/cart-store.ts), [buy.tsx](../web-store/src/components/shop/buy.tsx)), and Product Detail ([products/[id]/page.tsx](../web-store/src/app/(shop)/products/[id]/page.tsx)) with live flash pricing, `⚡ -XX%` badges, countdown pills, and the horizontal-snap **Related Products ("عملاء اشتروا أيضاً / Customers Also Bought")** carousel powered by `get_related_products`.
  - Added multi-tenant API route [api/cart-upsells/route.ts](../web-store/src/app/api/cart-upsells/route.ts) and [cart-upsell-strip.tsx](../web-store/src/components/shop/cart-upsell-strip.tsx) directly below `CartIncentiveBar` in [basket.tsx](../web-store/src/components/shop/basket.tsx) with one-click **`+ أضف / + Add`** advancing the Free-Shipping Progress Bar live.
  - Upgraded `/admin/products` ([page.tsx](../web-store/src/app/admin/products/page.tsx), [product-form.tsx](../web-store/src/app/admin/products/product-form.tsx), [mutations.ts](../web-store/src/app/admin/mutations.ts)) with `⚡ Flash` table pills, a collapsible **"عرض مؤقت / Flash Sale"** form card (live `% off` preview, client & server price/window validation, `24h/48h/72h` presets, and one-click **Clear Flash Sale**), and non-blocking Phase 9 `notifyWishlistProductAlert` triggers when a new active flash sale lowers a product's effective price.
- **Verification:**
  - Single-pass live Chrome QA at `http://localhost:3000` (AR RTL & EN LTR, `1440px` & `390px`) verified 3 Homepage Flash Deals with live ticking tabular countdowns, Product Detail flash countdown + 6 Related Products, Cart Upsell `+ Add` advancing Free Shipping from `52%` (`EGP 520.00`) to `100% Free` (`EGP 1,060.00`) with cart cleanup back to `0`, and `/admin/products` `⚡ Flash` pills + collapsible Flash Sale form with `0` console errors, `0` HTTP `>= 400` responses, and `0` horizontal overflow.
  - Passed `npx tsc --noEmit` (0 errors), `npm run lint -- --max-warnings 0` (0 errors, 0 warnings), and `npm run build` (26/26 routes).

---

### Phase 11B: Self-Serve White-Label APK Factory, Merchant Handover, Top Bar UX Declutter & Search Filters — 2026-11-25

- **Database Schema, Plan Gating, Merchant Handover & APK Build Tracking ([shared/phase-11b-mobile-app-factory.sql](../shared/phase-11b-mobile-app-factory.sql), applied live):**
  - Extended `public.stores` with `mobile_app_access text not null default 'plan'` (`'plan' | 'enabled' | 'disabled'`) and `pending_owner_email text null`, plus partial index `idx_stores_pending_owner_email` on `lower(pending_owner_email)`.
  - Added pure helper `public.store_has_mobile_app_access(p_store_id)` (`enabled` -> `true`, `disabled` -> `false`, `'plan'` -> `plan in ('growth', 'enterprise')`).
  - Added `public.claim_pending_store_ownership()` and `public.super_admin_assign_store_owner(p_store_id, p_owner_email)` supporting immediate handover for existing accounts and automatic auto-claim on first signup/login inside `VOLATILE` `public.get_my_managed_stores()`.
  - Upgraded `public.super_admin_list_stores_overview()` and `public.super_admin_update_store_plan_and_status(...)` with `mobile_app_access`, `mobile_app_unlocked`, and `pending_owner_email`.
  - Created `public.store_app_builds` with strict multi-tenant RLS (`is_store_admin(store_id)` for read; `is_store_admin(store_id) AND store_has_mobile_app_access(store_id)` for insert/update) and reloaded PostgREST schema (`NOTIFY pgrst, 'reload schema'`).
  - Live Supabase verification passed with `store_cols: 2`, `builds_table_exists: true`, `nova_unlocked: true`, `rpc_count: 6`, `leftover_test_rows: 0`, plus atomic assertions covering Starter locked, `enabled` override unlocked, and `disabled` override locked.
- **Storefront Mobile Header Declutter, Search Filters & Flash Deals Filtering (`web-store/`):**
  - Decluttered mobile header (`< 640px`) in [navigation.tsx](../web-store/src/components/shop/navigation.tsx) & [shop.css](../web-store/src/app/(shop)/shop.css) to show only Brand + Search + Cart + Menu (`☰`) button, moving Language, Theme, Wishlist, Account, Support, and Admin links into a responsive RTL/LTR slide-over drawer, and added quick filter links (`Flash Deals`, `In Stock`) inside the search overlay dropdown.
  - Updated [flash-deals-section.tsx](../web-store/src/components/shop/flash-deals-section.tsx) "View All" to link to `/products?flash=1`, and upgraded [products/page.tsx](../web-store/src/app/(shop)/products/page.tsx) & [flash-sale.ts](../web-store/src/lib/flash-sale.ts) (`filterAndSortCatalogProducts`) with interactive quick filter pills (`⚡ Flash Deals Only`, `✓ In Stock Only`, Categories, Reset) and effective-price sorting (`Relevance`, `Price Low-High`, `Price High-Low`, `Top Rated`, `Newest`).
- **Self-Serve White-Label APK Factory (`/admin/mobile-app`), Single-Store Isolation & Super-Admin Controls (`web-store/`, `.github/workflows/`):**
  - Updated [store-switcher.tsx](../web-store/src/app/admin/store-switcher.tsx) so single-store non-super-admin merchants see a clean static store identity card + `View Store` link only (hiding multi-store switcher and `Create Store`).
  - Added **"تطبيق الموبايل / Mobile App"** nav item with `PRO` lock badge when locked ([nav.tsx](../web-store/src/app/admin/nav.tsx), [layout.tsx](../web-store/src/app/admin/layout.tsx), [i18n.ts](../web-store/src/lib/i18n.ts)).
  - Built zero-dependency inline SVG QR encoder [qr-svg.ts](../web-store/src/lib/qr-svg.ts), server-gated API route [api/admin/mobile-builds/route.ts](../web-store/src/app/api/admin/mobile-builds/route.ts) (`GET` + `POST` with strict `403` plan guard, `409` concurrency guard, and graceful `503` setup message if `GITHUB_ACTIONS_TOKEN` is unset), and flagship studio [admin/mobile-app/page.tsx](../web-store/src/app/admin/mobile-app/page.tsx) + [mobile-app-studio.tsx](../web-store/src/app/admin/mobile-app/mobile-app-studio.tsx) (Locked Starter upsell with live phone mockup & upgrade modal; Unlocked Growth/Enterprise build studio with live phone preview, 10s build polling, APK download, and scannable SVG QR code).
  - Upgraded `/super-admin` ([page.tsx](../web-store/src/app/super-admin/page.tsx), [actions.ts](../web-store/src/app/super-admin/actions.ts), [portal-client.tsx](../web-store/src/app/super-admin/portal-client.tsx)) with `App On / Web Only` and `Pending Handover` directory pills, 3-way `Android App Builder Access` override (`Follow Plan`, `Force Enabled`, `Force Disabled`), and `Assign Store Owner` by email with one-click Copy `/login` link.
  - Added isolated GitHub Actions workflow [.github/workflows/build-store-apk.yml](../.github/workflows/build-store-apk.yml) (`workflow_dispatch`, optional Pillow icon resizing, custom `-PstoreId` / `-PstoreName` / `-PappIdSuffix`, isolated prerelease tag `store-<slug>-b<version_code>` with `prerelease: true` & `make_latest: false` so Nova Store's `Latest` release is never overwritten).
  - Documented `GITHUB_ACTIONS_TOKEN`, `GITHUB_REPO_OWNER`, and `GITHUB_REPO_NAME` in [web-store/.env.example](../web-store/.env.example).
- **Verification:**
  - Single-pass live Chrome QA at `http://localhost:3000` (AR RTL & EN LTR, `1440px` & `390px`) verified mobile header declutter + slide-over drawer, Homepage Flash Deals "View All" -> `/products?flash=1` (strictly 3 active flash deals + sort + in-stock pills), unlocked Nova Store APK Studio + live preview, Super-Admin 3-way override & handover modal, and locked Starter upsell + upgrade modal on an existing Starter store with `0` console errors, `0` HTTP `>= 400` responses, and `0` horizontal overflow.
  - Passed `npx tsc --noEmit` (0 errors), `npm run lint -- --max-warnings 0` (0 errors, 0 warnings), and `npm run build` (28/28 routes).
- **Phase 11B Polish — Cloud APK Wiring, Direct Device Icon Upload & Role-Aware Setup Banner:**
  - Configured local `web-store/.env.local` (`GITHUB_ACTIONS_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, gitignored) and uploaded encrypted GitHub Actions repository secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) on `MhmdIbrahim1/WhiteLabelCommerce` so `.github/workflows/build-store-apk.yml` is wired end-to-end.
  - Added authenticated multi-tenant icon upload route [api/admin/mobile-builds/icon/route.ts](../web-store/src/app/api/admin/mobile-builds/icon/route.ts) (`POST` + `DELETE` on Supabase Storage public `product-images` bucket under `app-icons/<storeId>/`, validating `PNG`/`JPG`/`WEBP` up to 2 MB).
  - Replaced the URL-only icon input in [mobile-app-studio.tsx](../web-store/src/app/admin/mobile-app/mobile-app-studio.tsx) with a `64x64` live rounded-square preview card, primary **"رفع صورة من الجهاز / Upload from Device"** picker, **"إزالة / Remove"** cleanup button, and collapsible **"أو استخدام رابط مباشر / Or paste image URL"** toggle; made the unconfigured-builder banner role-aware via `isSuperAdmin` from [admin/mobile-app/page.tsx](../web-store/src/app/admin/mobile-app/page.tsx).
  - Verified live on `http://localhost:3000/admin/mobile-app` (AR RTL & EN LTR): warning banner removed, `POST /api/admin/mobile-builds/icon` (`201`) updated both the `64x64` preview and live phone mockup immediately, `DELETE` (`200`) cleaned up the test image, with `0` console errors, `0` HTTP `>= 400`, and passing `tsc --noEmit`, `eslint --max-warnings 0`, and `next build`.
- **Phase 11B Polish — Service-Role APK Dispatch Fix & Customizer-Synced Android Preview:**
  - Fixed [api/admin/mobile-builds/route.ts](../web-store/src/app/api/admin/mobile-builds/route.ts) to perform `store_app_builds` `INSERT`/`UPDATE` writes via `adminDb()` (`service_role`) after verifying store-admin + mobile-app plan access, aligned exact table columns (`apk_download_url`, `updated_at`, `completed_at`), aligned `workflow_dispatch` payload keys (`app_name` instead of `store_name`, with every input cast via `String(...)`), added `User-Agent: WhiteLabelCommerce-CI/1.0` + `updated_at` in [.github/workflows/build-store-apk.yml](../.github/workflows/build-store-apk.yml), and surfaced actionable bilingual HTTP error messages to the UI.
  - Upgraded [admin/mobile-app/page.tsx](../web-store/src/app/admin/mobile-app/page.tsx) and [mobile-app-studio.tsx](../web-store/src/app/admin/mobile-app/mobile-app-studio.tsx) from a wireframe placeholder to a live scrollable customizer-synced Android preview powered by `store_settings.ui_config` (real primary/accent/surface palette, radius, announcement strip, real active Hero banner image/copy, up to 4 real active products with photos, EGP prices, `⚡ -XX%` flash badges, and `★` ratings), plus a Light/Dark preview toggle and direct `/admin/customizer` shortcut.
  - Verified live at `http://localhost:3000/admin/mobile-app` (`1440px`, EN LTR & AR RTL): Nova Store real hero + 4 real products + Light/Dark toggle + `0` horizontal overflow + `0` console errors; live dispatch test on `ملابس عمر` (`com.whitelabel.commerce.omara7a`) confirmed service-role DB insert and surfaced GitHub `HTTP 403` because the configured fine-grained PAT needs `Actions: Read and write` (failed test row cleaned up; passed `tsc --noEmit`, `eslint --max-warnings 0`, and `next build`).


---

### Phase 12: Self-Service Returns & Exchanges with Automated Store Wallet Refunds & Restock (Supabase + Web + Admin + Android `v1.4.0`) — 2026-11-25

- **Database Schema, Strict Multi-Tenant RLS & Atomic RPCs ([shared/phase-12-returns-wallet-refunds.sql](../shared/phase-12-returns-wallet-refunds.sql), applied live):**
  - Widened `public.wallet_transactions` `type` constraint to support `'credit'` and `'return_refund'` alongside Phase 10A ledger types so automated return credits flow directly into customer wallet balances (`get_customer_wallet_summary`, checkout redemption, and `/account` ledger).
  - Created `public.return_requests` (`store_id`, `order_id`, `user_id`, `request_type in ('return','exchange')`, `status in ('pending','approved','rejected','received','refunded')`, `refund_method in ('wallet','original_payment')`, `reason`, `customer_notes`, `admin_notes`, `refund_amount`, `items jsonb`, `restocked`, `wallet_credited`, `created_at`, `updated_at`), indexes on `(store_id, created_at desc)`, `(order_id)`, and `(store_id, status, created_at desc)`, plus partial unique index `uidx_return_requests_active_order` preventing duplicate active returns on the same order.
  - Enabled strict RLS (customers `SELECT` own rows; `is_store_admin(store_id)` / `is_platform_super_admin()` `SELECT` & `UPDATE`; direct client `INSERT`/`DELETE` revoked).
  - Implemented `SECURITY DEFINER` RPCs (`SET search_path = public`, `#variable_conflict use_column`):
    1. `public.submit_return_request(...)`: locks the order, verifies `auth.uid()` ownership, `orders.status = 'delivered'`, and no existing active return, validates item quantities against `order_items`, computes exact server-side `refund_amount` (proportionally honoring coupon discounts when present), and inserts the `pending` request.
    2. `public.admin_process_return_request(p_return_id, p_action, p_admin_notes, p_restock)`: verifies store admin / super admin, handles `'approve'`, `'reject'`, `'mark_received'`, and `'complete_refund'`, atomically restocks `public.products.stock` (and `product_variants.stock_qty` if present) once (`restocked = true`), atomically inserts an advisory-locked `'credit'` ledger row into `public.wallet_transactions` with bilingual order/return notes (`wallet_credited = true`), and dispatches an idempotent customer notification (`deep_link = '/orders/<order_id>'`).
  - Reloaded PostgREST schema (`NOTIFY pgrst, 'reload schema'`).
  - **Live Supabase Rolled-Back Verification:** Applied migration (`Success. No rows returned`) and ran atomic rolled-back E2E test (`submit_return_request` -> `admin_process_return_request('complete_refund')` -> idempotent retry): verified `status = 'refunded'`, `restocked = true`, `wallet_credited = true`, exact `products.stock + 1`, exact `wallet_transactions` credit, and zero double-credit/double-restock on retry (`table_exists: true`, `rpc_count: 2`, `policy_count: 3`, `leftover_rows: 0`).
- **Web Storefront Customer Order Detail & Returns UI (`web-store/`):**
  - Added shared returns library [returns.ts](../web-store/src/lib/returns.ts) (`RETURN_REASON_OPTIONS`, bilingual status/type/refund/reason helpers, normalizers), added `submitReturnRequestAction` in [orders/actions.ts](../web-store/src/app/(shop)/orders/actions.ts), updated [proxy.ts](../web-store/src/proxy.ts) matcher with `"/orders/:path*"`, and updated [wallet-section.tsx](../web-store/src/components/shop/wallet-section.tsx) to label `'credit'` / `'return_refund'` entries.
  - Built dedicated customer order detail route [orders/[id]/page.tsx](../web-store/src/app/(shop)/orders/[id]/page.tsx) (working on both `/orders/[id]` and `/s/[slug]/orders/[id]`) and bilingual portaled [order-return-panel.tsx](../web-store/src/components/shop/order-return-panel.tsx) with **"طلب إرجاع أو استبدال / Request Return or Exchange"** button on delivered orders (item & quantity selector, Return vs Exchange, Store Wallet Instant vs Original Payment, reason picker, notes, live refund estimate) and a calm **Return Request Status Card** once submitted.
  - Linked `/orders` ([orders/page.tsx](../web-store/src/app/(shop)/orders/page.tsx)), `/account` ([account/page.tsx](../web-store/src/app/(shop)/account/page.tsx)), and [tracking.tsx](../web-store/src/components/shop/tracking.tsx) directly to `/orders/[id]` with inline return controls and status cards.
- **Merchant Admin Returns Queue (`/admin/returns`, `web-store/`):**
  - Added **"المرتجعات والاستبدال / Returns & Exchanges"** to [admin/nav.tsx](../web-store/src/app/admin/nav.tsx) with a live pending count badge loaded in [admin/layout.tsx](../web-store/src/app/admin/layout.tsx) and `processReturnRequestAction` in [admin/mutations.ts](../web-store/src/app/admin/mutations.ts).
  - Built [admin/returns/page.tsx](../web-store/src/app/admin/returns/page.tsx) and [admin/returns/returns-client.tsx](../web-store/src/app/admin/returns/returns-client.tsx) with 4 KPI cards (`Pending`, `Approved`, `Refunded`, `Credited to Wallets`), 6 status filter tabs, customer/order/item cards, merchant response note input, restock checkbox (checked by default), and **Approve / Mark Received / Complete Refund & Restock / Reject** actions, plus a linked return summary banner on [admin/orders/[id]/page.tsx](../web-store/src/app/admin/orders/[id]/page.tsx).
- **Verification:**
  - Passed `npx tsc --noEmit` (0 errors), `npm run lint -- --max-warnings 0` (0 warnings), and `npm run build` (all routes including `/admin/returns` and `/orders/[id]`).
  - Live Chrome QA at `http://localhost:3000` (AR RTL & EN LTR, `1440px` & `390px`) verified `/admin/returns`, `/orders`, `/orders/[id]` (including bilingual Return/Exchange modal drawer), `/s/nova-store/orders/[id]`, and `/account` with `0` console errors, `0` HTTP `>= 400` responses, and `0` horizontal overflow.


---

### Phase 13: Multi-Tenant Ad Pixels (Meta / TikTok / GA4) & Omnichannel Abandoned Cart Recovery (Supabase + Web + Admin + Android `v1.4.1`) — 2026-11-25

- **Database Schema, Strict Multi-Tenant RLS & Atomic RPCs ([shared/phase-13-pixels-abandoned-carts.sql](../shared/phase-13-pixels-abandoned-carts.sql), applied live):**
  - Extended `public.store_settings` with per-tenant nullable columns `meta_pixel_id`, `tiktok_pixel_id`, and `ga4_measurement_id`.
  - Created `public.abandoned_carts` (`store_id`, `user_id`, `session_key`, `customer_name`, `customer_email`, `customer_phone`, `items jsonb`, `subtotal`, `currency`, `source in ('web','android')`, `status in ('open','reminded','recovered','dismissed')`, `recovery_coupon_code`, `reminder_count`, `last_reminded_at`, `recovered_order_id`, `created_at`, `updated_at`) with unique index `uidx_abandoned_carts_store_session` on `(store_id, session_key)`, index on `(store_id, status, updated_at desc)`, and strict RLS (`is_store_admin(store_id)` / `is_platform_super_admin()` `SELECT`/`UPDATE`; direct client `INSERT`/`DELETE` revoked).
  - Implemented `SECURITY DEFINER` RPCs (`SET search_path = public`, `#variable_conflict use_column`):
    1. `public.upsert_abandoned_cart(...)`: removes non-recovered rows when empty/zero; otherwise upserts the shopper's cart, enriches authenticated customer profile contact details (`store_customers` + `auth.users`), preserves existing non-null contact info, and resets `'recovered'`/`'dismissed'` sessions to `'open'` on a fresh cart.
    2. `public.mark_abandoned_cart_recovered(p_store_id, p_session_key, p_order_id)`: transitions matching `'open'`/`'reminded'` rows for the session or `auth.uid()` to `'recovered'` with `recovered_order_id`.
    3. `public.admin_update_abandoned_cart(p_cart_id, p_action, p_coupon_code)`: store-admin-guarded `'mark_reminded'` (increments `reminder_count`, stamps `last_reminded_at`, stores `recovery_coupon_code`) and `'dismiss'`.
  - Reloaded PostgREST schema (`NOTIFY pgrst, 'reload schema'`).
  - **Live Supabase Rolled-Back Verification:** Applied migration (`Success. No rows returned`) and ran atomic `BEGIN ... ROLLBACK` test verifying `upsert_abandoned_cart` → `admin_update_abandoned_cart('mark_reminded', 'NOVA10')` → `mark_abandoned_cart_recovered` (`pixel_cols_count: 3`, `table_exists: true`, `rpc_count: 3`, `policy_count: 2`, `leftover_rows: 0`).
- **Web Storefront Ad Pixels & Abandoned Cart Sync (`web-store/`):**
  - Added [marketing.ts](../web-store/src/lib/marketing.ts) (strict Meta/TikTok/GA4 sanitizers & validators, abandoned cart normalizers, bilingual WhatsApp recovery URL builder with Egyptian `01XXXXXXXXX -> 201XXXXXXXXX` normalization), [analytics.ts](../web-store/src/lib/analytics.ts) (`trackPageView`, `trackViewContent`, `trackAddToCart`, `trackInitiateCheckout`, and `sessionStorage`-deduplicated `trackPurchase`), [store-pixels.tsx](../web-store/src/components/shop/store-pixels.tsx) (per-tenant Meta/TikTok/GA4 loader mounted in [(shop)/layout.tsx](../web-store/src/app/(shop)/layout.tsx) covering both `/` and `/s/[slug]` with single-init guard & `?wlc_pixel_test=1` verification toast), and [product-view-tracker.tsx](../web-store/src/components/shop/product-view-tracker.tsx) on [products/[id]/page.tsx](../web-store/src/app/(shop)/products/[id]/page.tsx).
  - Updated [shop.ts](../web-store/src/lib/shop.ts) to expose `pixels` per store, added [api/abandoned-cart/route.ts](../web-store/src/app/api/abandoned-cart/route.ts) & added it to [proxy.ts](../web-store/src/proxy.ts), upgraded [cart-store.ts](../web-store/src/components/shop/cart-store.ts) with persistent `wlc_cart_session` + 1.5s debounced `upsert_abandoned_cart` sync & `markWebCartRecovered`, and wired `AddToCart` ([buy.tsx](../web-store/src/components/shop/buy.tsx)), `InitiateCheckout` + checkout phone/contact sync + `Purchase` ([basket.tsx](../web-store/src/components/shop/basket.tsx)), and online callback recovery/purchase ([orders-payment-sync.tsx](../web-store/src/components/shop/orders-payment-sync.tsx)).
- **Merchant Admin Marketing & Abandoned Cart Recovery Studios (`web-store/`):**
  - Added **"بكسلات الإعلانات / Ad Pixels"** (`/admin/marketing`) and **"السلات المتروكة / Abandoned Carts"** (`/admin/abandoned-carts`, with live open cart count badge) in [admin/nav.tsx](../web-store/src/app/admin/nav.tsx), [admin/layout.tsx](../web-store/src/app/admin/layout.tsx), and [i18n.ts](../web-store/src/lib/i18n.ts), plus `saveMarketingPixelsAction` & `updateAbandonedCartAction` in [admin/mutations.ts](../web-store/src/app/admin/mutations.ts).
  - Built [admin/marketing/page.tsx](../web-store/src/app/admin/marketing/page.tsx) & [marketing-client.tsx](../web-store/src/app/admin/marketing/marketing-client.tsx) (Meta, TikTok, GA4 cards with validation & active pills, 5-event conversion mapping table, and **"معاينة وإرسال حدث تجريبي / Test Pixel Events"** launcher).
  - Built [admin/abandoned-carts/page.tsx](../web-store/src/app/admin/abandoned-carts/page.tsx) & [abandoned-carts-client.tsx](../web-store/src/app/admin/abandoned-carts/abandoned-carts-client.tsx) (Open Carts / Recoverable Value / Recovered Carts KPIs, filter tabs, `Web` / `Android` source badges, active store coupon picker, Copy Cart Link, Dismiss, and 1-click prefilled **Send WhatsApp Reminder**).
- **Verification:**
  - Passed `npx tsc --noEmit` (0 errors), `npm run lint -- --max-warnings 0` (0 warnings), and `npm run build` (29/29 routes).
  - Live Chrome QA at `http://localhost:3000` (AR RTL & EN LTR, `1440px` & `390px`) verified `/admin/marketing`, live multi-tenant Meta (`123456789012345`) + GA4 (`G-QA12345678`) script injection & `PageView` network fire on both `/?wlc_pixel_test=1` and `/s/nova-store`, clean reset back to `0 / 3` active pixels, and `/admin/abandoned-carts` with `0` console errors, `0` `localhost:3000` HTTP `>= 400` responses, and `0` horizontal overflow.


---

### Phase 14 (Milestone 1): Critical & High Database, RLS, Paymob, Proxy, API & CI Security Hardening — 2026-11-25

- **Unified Database & RLS Security Hardening ([shared/phase-14-security-hardening.sql](../shared/phase-14-security-hardening.sql), applied live):**
  - **Dead `current_user` Auth Checks Removed (`CRIT-01`, `HIGH-11`):** Split internal trigger/RPC helpers into private `SECURITY DEFINER` functions (`_internal_refund_wallet_for_cancelled_order`, `_internal_award_order_cashback`) with `REVOKE ALL FROM PUBLIC, anon, authenticated` and locked `redeem_wallet_for_order`. Enforced strict `service_role` or `(auth.uid() IS NOT NULL AND (is_store_admin(store_id) OR is_platform_super_admin()))` checks across `admin_process_return_request`, `admin_update_abandoned_cart`, `refund_wallet_for_cancelled_order`, and `award_order_cashback`, with `SET search_path = public, pg_temp` and `#variable_conflict use_column` on all `SECURITY DEFINER` RPCs.
  - **Store-Scoped `storage.objects` (`product-images`) Policies (`CRIT-04`):** Replaced global `public.is_admin()` with folder-scoped `<store_id>/...` / `app-icons/<store_id>/...` / `banners/<store_id>/...` checks bound to `is_store_admin(store_id)` (plus super-admin override) and `..` traversal rejection.
  - **Returns, Wallet & Order Financial Integrity (`CRIT-05`, `HIGH-04`):** Added `store_settings.return_window_days` (default `14`), `orders.stock_restored`, `wallet_transactions.return_request_id` with unique partial index `uidx_wallet_transactions_return_request_id`, and `trg_guard_order_status_transitions` blocking `delivered -> cancelled` and cancelled order reopening. Hardened `submit_return_request` (strict `oi.id` deduplication, ambiguity rejection, server-only `variant_id`, return window check) and `admin_process_return_request` (store-scoped `product_variants` restock, proportional `cashback_earned` clawback, distinct bilingual notifications per status transition keyed on `(return_id, new_status)`), and revoked direct `UPDATE` on `return_requests` from `authenticated`.
  - **Account & Store Ownership Protection + Column Grants (`CRIT-06`, `CRIT-07`, `HIGH-05`, `M2`, `M5`):** Removed unverified phone claiming from `sync_customer_profile` and required `email_confirmed_at IS NOT NULL` for email claiming, `claim_pending_store_ownership`, and `super_admin_assign_store_owner` (demoting previous owners on reassignment). Restricted `anon` column-level `SELECT` on `stores` (`id, name_ar, name_en, slug, custom_domain, status, plan`), `products` (hiding `cost_price`), and `product_reviews` (hiding `order_id, user_id`). Restricted guest phone lookup in `store_checkout` to `user_id IS NULL` and stopped trusting caller-supplied `p_phone` in `register_push_subscription`.
  - **Locked Down Tables & RPCs (`CRIT-02`, `CRIT-08`, `HIGH-02`, `HIGH-03`, `HIGH-06`, `M3`–`M6`):** Added `public.payment_attempts` + `uidx_orders_store_payment_tx`; revoked direct `UPDATE` from `authenticated` on `abandoned_carts`, `notifications`, and `store_customers` (adding `admin_update_customer_notes` RPC); hardened `upsert_abandoned_cart` (`>= 24`-char `session_key`, `<= 50` items, non-PII JSONB return, `anon` ownership/recovered guards) and `mark_abandoned_cart_recovered`; added per-user `public.notification_reads` for broadcast promo read state and tightened `customer_read_own_notifications`; replaced global `is_admin()` with `is_store_admin(store_id)` on `support_tickets`; blocked non-owner admins from promoting to or deleting `owner` in `store_members`; fixed `switch_order_to_cod` for all non-Nova tenants and enforced online payment states; dropped legacy `anon` `orders` direct insert (`submit_guest_order`); hardened `get_delivery_by_token` / `confirm_delivery_by_token` (`status = 'shipped'`, token expiration, PII redaction).
- **Web API, Paymob, Proxy, Upload & CI Workflow Hardening (`web-store/`, `.github/workflows/`):**
  - **Proxy & Tenant Resolution (`CRIT-03`, `M9`):** Unconditionally stripped spoofable `x-store-host`, `x-store-subdomain`, `x-store-slug`, and `x-store-base-path` headers in [proxy.ts](../web-store/src/proxy.ts) and broadened `config.matcher` across all app, `/api/*`, and `/delivery/*` routes. Updated [tenant.ts](../web-store/src/lib/tenant.ts) and [access.ts](../web-store/src/lib/access.ts) to select only public `stores` columns and fail closed on unexpected RPC errors.
  - **Paymob Hardening (`CRIT-02`, `HIGH-01`):** Hardened [api/payments/paymob/initiate/route.ts](../web-store/src/app/api/payments/paymob/initiate/route.ts) with caller ownership/guest-phone verification, `order.store_id === activeStore.id`, closed/paid/non-online guards, and `payment_attempts` recording; removed the unsigned `merchant_order_id` fallback in [webhook/route.ts](../web-store/src/app/api/payments/paymob/webhook/route.ts) and [callback/route.ts](../web-store/src/app/api/payments/paymob/callback/route.ts) with voided/refunded/error rejection, currency match, and unique `payment_transaction_id` enforcement.
  - **Admin APIs, Uploads, Redirects & Headers (`HIGH-07`, `HIGH-08`, `HIGH-10`, `M7`–`M9`):** Added [security.ts](../web-store/src/lib/security.ts) (PNG/JPEG/WEBP magic-byte verification & `safeRelativePath`); hardened [api/notifications/inbox/route.ts](../web-store/src/app/api/notifications/inbox/route.ts) (`resolveActiveAdminStoreId`, `notification_reads` merge, `target_role = 'admin'` deletion guard), [api/notifications/cron/recovery/route.ts](../web-store/src/app/api/notifications/cron/recovery/route.ts) (`timingSafeEqual`, `POST`-only admin triggers scoped to `activeAdminStoreId`, all-active-stores cron scan), [api/admin/mobile-builds/icon/route.ts](../web-store/src/app/api/admin/mobile-builds/icon/route.ts) (`store_has_mobile_app_access`, magic bytes, strict UUID delete regex), [admin/mutations.ts](../web-store/src/app/admin/mutations.ts) (magic-byte + store-scoped uploads, `store_id` checks on return/abandoned-cart actions, `admin_update_customer_notes` RPC, `target_role = 'admin'` on bulk delete), [abandoned-cart/route.ts](../web-store/src/app/api/abandoned-cart/route.ts), [cart-heartbeat/route.ts](../web-store/src/app/api/notifications/cart-heartbeat/route.ts), [register/route.ts](../web-store/src/app/api/notifications/register/route.ts), redirect/deep-link sanitization across [login/actions.ts](../web-store/src/app/login/actions.ts), [notification-bell.tsx](../web-store/src/components/notifications/notification-bell.tsx), and [hero.tsx](../web-store/src/components/shop/hero.tsx), and HTTP security headers in [next.config.ts](../web-store/next.config.ts).
  - **APK Factory Workflow (`HIGH-09`):** Hardened [.github/workflows/build-store-apk.yml](../.github/workflows/build-store-apk.yml) with strict UUID/slug/version input validation, URL-encoded PostgREST queries, Supabase Storage host-locked `ICON_URL` downloads (3 MB cap + `Image.MAX_IMAGE_PIXELS = 16000000`), XML-escaped `APP_NAME`, and `apksigner verify`.
- **Verification:**
  - Applied [shared/phase-14-security-hardening.sql](../shared/phase-14-security-hardening.sql) live in Supabase (`Success. No rows returned`) and ran rolled-back verification (`BEGIN ... ROLLBACK`) returning `ALL_PHASE_14_SECURITY_CHECKS_PASSED` with `leftover_abandoned_carts = 0` and `leftover_test_orders = 0`.
  - Passed `npx tsc --noEmit` (0 errors), `npm run lint -- --max-warnings 0` (0 warnings), and `npm run build` (29/29 routes + proxy).
  - Verified live storefront/PDP/multi-tenant `/s/omar-a7a` rendering (`0` console errors, `0` HTTP `>= 400`) and probed the fresh production build confirming all 5 HTTP security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`), tenant header spoof stripping (`x-store-slug` / `x-store-host`), `GET /api/notifications/cron/recovery -> 401`, short `session_key` `POST /api/abandoned-cart -> 400`, and unowned `POST /api/payments/paymob/initiate -> 404`.
