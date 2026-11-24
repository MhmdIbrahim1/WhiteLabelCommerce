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
      .select("full_name,phone,governorate,city,address")
      .eq("user_id", user.id)
      .maybeSingle<{
        full_name: string;
        phone: string;
        governorate: string;
        city: string;
        address: string;
      }>();
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
    const parts: string[] = [];
    const street = profile?.address?.trim() ?? "";
    const city = profile?.city?.trim() ?? "";
    const gov = profile?.governorate?.trim() ?? "";
    if (gov && !street.includes(gov)) parts.push(gov);
    if (city && !street.includes(city)) parts.push(city);
    if (street) parts.push(street);
    defaultAddress = parts.join(" - ");
  }
  return (
    <Basket
      order
      fee={s.fee}
      currency={s.currency}
      defaultName={defaultName}
      defaultPhone={defaultPhone}
      defaultAddress={defaultAddress}
      signedInEmail={user?.email ?? null}
      paymentOptions={s.payment}
    />
  );
}
