import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import {
  ADMIN_STORE_COOKIE,
  DEFAULT_STORE_ID,
  getManagedStores,
  isPlatformSuperAdmin,
  type ManagedStoreSummary,
} from "./tenant";

export async function serverDb() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll(values) {
          try {
            for (const { name, value, options } of values)
              jar.set(name, value, options);
          } catch {
            /* Server Component reads use the refresh cookies written by proxy. */
          }
        },
      },
    },
  );
}

export const requireAdmin = cache(async () => {
  const [db, jar] = await Promise.all([serverDb(), cookies()]);
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) redirect("/login?next=/admin");

  const [managedStores, isSuperAdmin] = await Promise.all([
    getManagedStores(db),
    isPlatformSuperAdmin(db),
  ]);

  if (managedStores.length === 0) {
    redirect("/account?notice=customer_only");
  }

  const requestedStoreId = jar.get(ADMIN_STORE_COOKIE)?.value?.trim() || "";
  const activeStore: ManagedStoreSummary =
    managedStores.find((s) => s.store_id === requestedStoreId) ??
    managedStores.find((s) => s.store_id === DEFAULT_STORE_ID) ??
    managedStores[0];

  return {
    db,
    user,
    storeId: activeStore.store_id,
    activeStore,
    managedStores,
    isSuperAdmin,
  };
});

export const requireSuperAdmin = cache(async () => {
  const db = await serverDb();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) redirect("/login?next=/super-admin");

  const ok = await isPlatformSuperAdmin(db);
  if (!ok) redirect("/");

  return { db, user };
});

export function checked<T>(result: {
  data: T | null;
  error: { message: string } | null;
}): NonNullable<T> {
  if (result.error || result.data == null)
    throw new Error("تعذر تحميل بيانات المتجر.");
  return result.data;
}
