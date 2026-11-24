"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { serverDb } from "@/lib/db";
import { adminUser } from "@/lib/access";
import { normalizePhone } from "@/lib/phone";

function safeNext(raw: FormDataEntryValue | null): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s.startsWith("/") && !s.startsWith("//") && !s.includes("\r") && !s.includes("\n")) {
    return s;
  }
  return "";
}

export async function login(form: FormData) {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  const db = await serverDb();

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    const isUnconfirmed =
      error.code === "email_not_confirmed" ||
      /not confirmed/i.test(error.message ?? "");
    redirect(
      `/login?error=${isUnconfirmed ? "unconfirmed" : "credentials"}` +
        (next ? "&next=" + encodeURIComponent(next) : ""),
    );
  }

  // Sync customer CRM profile & attach prior guest orders silently
  const meta = data.user?.user_metadata ?? {};
  const metaName =
    typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  const metaPhone =
    typeof meta.phone === "string" ? normalizePhone(meta.phone) : "";
  await db
    .rpc("sync_customer_profile", {
      p_full_name: metaName,
      p_phone: metaPhone,
      p_city: "",
      p_address: "",
    })
    .then(
      () => {},
      () => {},
    );

  const isAdmin = Boolean(await adminUser(db));
  if (isAdmin) {
    redirect(next || "/admin");
  }
  if (next.startsWith("/admin")) {
    redirect("/account?notice=customer_only");
  }
  redirect(next || "/account");
}

export async function register(form: FormData) {
  const fullName = String(form.get("full_name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  const nextSuffix = next ? "&next=" + encodeURIComponent(next) : "";

  if (fullName.length < 2 || fullName.length > 100) {
    redirect("/register?error=name" + nextSuffix);
  }
  if (!/^[0-9]{8,15}$/.test(phone)) {
    redirect("/register?error=phone" + nextSuffix);
  }
  if (password.length < 6) {
    redirect("/register?error=password" + nextSuffix);
  }

  const db = await serverDb();
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone },
    },
  });

  if (error) {
    redirect("/register?error=signup" + nextSuffix);
  }

  if (data.session) {
    await db
      .rpc("sync_customer_profile", {
        p_full_name: fullName,
        p_phone: phone,
        p_city: "",
        p_address: "",
      })
      .then(
        () => {},
        () => {},
      );
    revalidatePath("/", "layout");
    redirect(next || "/account");
  }

  redirect("/login?registered=confirm" + nextSuffix);
}

export async function logout() {
  const db = await serverDb();
  const { error } = await db.auth.signOut({ scope: "local" });
  if (error) throw new Error("تعذر تسجيل الخروج.");
  revalidatePath("/", "layout");
  redirect("/");
}

export async function saveCustomerAccount(form: FormData) {
  const db = await serverDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login?next=/account");

  const fullName = String(form.get("full_name") ?? "").trim().slice(0, 100);
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  const city = String(form.get("city") ?? "").trim().slice(0, 80);
  const address = String(form.get("address") ?? "").trim().slice(0, 500);

  if (phone && !/^[0-9]{8,15}$/.test(phone)) {
    redirect("/account?result=phone_error");
  }

  const { error } = await db.rpc("sync_customer_profile", {
    p_full_name: fullName,
    p_phone: phone,
    p_city: city,
    p_address: address,
  });

  revalidatePath("/account");
  revalidatePath("/orders");
  redirect("/account?result=" + (error ? "error" : "saved"));
}
