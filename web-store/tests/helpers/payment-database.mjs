import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

export const nova = "00000000-0000-0000-0000-000000000001";
export const omar = "b3c5f5d9-1e15-40c8-9057-bcadbbbdfb1c";
const read = path => readFileSync(new URL("../../../"+path,import.meta.url),"utf8").replaceAll("\r\n","\n");
export const migration=read("supabase/migrations/20261127110000_payment_and_order_integrity.sql");
export const contract=read("qa/payment_and_order_integrity_rollback.sql");

// Use the repository's installed checkout, pricing, redemption and cancellation functions.
// This isolated schema contains the tables those functions access. No credentials or fetch.
function definition(file,name) {
  const sql=read("shared/"+file+".sql");
  const start=sql.indexOf("create or replace function public."+name+"(");
  const end=sql.indexOf("$$;",start);
  if (start<0 || end<0) throw Error("Missing SQL function "+name);
  return sql.slice(start,end+3);
}
export async function paymentDatabase() {
  const db=new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function public.is_store_admin(uuid) returns boolean language sql as $$select false$$;
    create table stores(id uuid primary key,slug text,status text default 'active');
    create table store_settings(store_id uuid primary key,currency text default 'EGP',shipping_fee numeric default 0,
      cod_enabled boolean default true,paymob_enabled boolean default true,paymob_card_enabled boolean default true,
      paymob_wallet_enabled boolean default true,cart_incentive_enabled boolean,free_shipping_threshold numeric,cashback_enabled boolean);
    create table store_customers(id uuid primary key default gen_random_uuid(),store_id uuid,user_id uuid,phone text,
      full_name text,email text,address text,updated_at timestamptz default now());
    create table categories(id uuid primary key default gen_random_uuid(),store_id uuid);
    create table products(id uuid primary key,store_id uuid,category_id uuid,slug text,name text,price numeric,stock integer,
      sizes text[],colors text[],unassigned_stock integer default 0,is_active boolean,cost_price numeric default 0,
      flash_sale_price numeric,flash_sale_starts_at timestamptz,flash_sale_ends_at timestamptz);
    create table product_variants(store_id uuid,product_id uuid,color text,size text,stock integer,listed boolean default true,
      primary key(store_id,product_id,color,size));
    create table orders(id uuid primary key default gen_random_uuid(),store_id uuid,user_id uuid,customer_id uuid,
      created_at timestamptz default now(),shipping_address text,phone text,currency text default 'EGP',shipping_fee numeric default 0,subtotal numeric,
      wallet_discount numeric default 0,total numeric generated always as (greatest(0,subtotal+shipping_fee-wallet_discount)) stored,
      payment_method text,payment_status text,status text default 'pending',guest_tracking boolean,stock_restored boolean default false,
      coupon_code text,discount_amount numeric default 0,delivery_token text,paymob_order_id text,payment_transaction_id text,
      checkout_key uuid unique,checkout_fingerprint text);
    create table order_items(id uuid primary key default gen_random_uuid(),order_id uuid,product_id uuid,quantity integer,
      product_name text,unit_price numeric,unit_cost numeric,size text,color text);
    create table coupons(id uuid primary key default gen_random_uuid(),store_id uuid,code text,discount_type text,discount_value numeric,
      created_at timestamptz default now(),used_count integer default 0,max_uses integer,min_order_amount numeric default 0,is_active boolean default true,expires_at timestamptz);
    create table wallet_transactions(id uuid primary key default gen_random_uuid(),store_id uuid,user_id uuid,order_id uuid,
      type text,amount numeric,balance_after numeric,note_ar text,note_en text,created_by uuid);
    create table payment_attempts(id uuid primary key default gen_random_uuid(),store_id uuid,order_id uuid,
      paymob_order_id text not null unique,payment_method text,created_at timestamptz default now());
    create table store_subscriptions(admin_notes text);
    create table store_invitations(token_hash text);
    insert into stores(id,slug) values('${nova}','nova-store'),('${omar}','omar-a7a');
    insert into categories(store_id) values('${nova}');
    insert into store_settings(store_id) values('${nova}'),('${omar}');
  `);
  const hardened="phase-14-security-hardening";
  for(const [file,name] of [
    ["phase-11a-aov-flash-sales","get_effective_product_price"],["phase-10b-saas-multitenancy","validate_coupon"],
    ["phase-10a-wallet-incentives","redeem_wallet_for_order"],[hardened,"_internal_refund_wallet_for_cancelled_order"],
    [hardened,"trigger_refund_wallet_on_cancel"],["product-variant-inventory","adjust_product_inventory"],
    ["product-variant-inventory","restore_order_stock_on_cancel"],[hardened,"store_checkout"],[hardened,"switch_order_to_cod"],
    ["customer-addresses","checkout_delivery"],
  ]) await db.exec(definition(file,name));
  const variants=read("shared/product-variant-inventory.sql");
  const patch=variants.indexOf("do $migration$");
  await db.exec(variants.slice(patch,variants.indexOf("end $migration$;",patch)+16));
  await db.exec(`create trigger restore_stock after update of status on orders for each row execute function restore_order_stock_on_cancel();
    create trigger refund_credit after update of status on orders for each row execute function trigger_refund_wallet_on_cancel();`);
  await db.exec(migration);
  return db;
}
