import { Basket } from "@/components/shop/basket";
import { serverDb } from "@/lib/db";
import { settings } from "@/lib/shop";

export default async function Checkout() {
  const [s, db] = await Promise.all([settings(), serverDb()]);
  const {
    data: { user },
  } = await db.auth.getUser();
  let defaultName = "";
  let defaultPhone = "";
  let defaultAddress = "";
  if (user) {
    const { data: profile } = await db
      .from("store_customers")
      .select("full_name,phone,address")
      .eq("user_id", user.id)
      .maybeSingle<{ full_name: string; phone: string; address: string }>();
    defaultName =
      profile?.full_name ||
      (typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : "");
    defaultPhone =
      profile?.phone ||
      (typeof user.user_metadata?.phone === "string"
        ? user.user_metadata.phone
        : "");
    defaultAddress = profile?.address || "";
  }
  return (
    <Basket
      order
      fee={s.fee}
      currency={s.currency}
      defaultName={defaultName}
      defaultPhone={defaultPhone}
      defaultAddress={defaultAddress}
      paymentOptions={s.payment}
    />
  );
}
