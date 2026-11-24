import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { adminUser } from "./access";

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
  const db = await serverDb();
  const user = await adminUser(db);
  if (!user) redirect("/login");
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
