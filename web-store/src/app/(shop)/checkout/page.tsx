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
  let defaultGovernorate = "";
  let defaultCity = "";
  let defaultAddress = "";
  let walletBalance = 0;
  if (user) {
    const [profileRes, walletRes] = await Promise.all([
      db
        .from("store_customers")
        .select("full_name,phone,governorate,city,address")
        .eq("store_id", s.storeId)
        .eq("user_id", user.id)
        .maybeSingle<{
          full_name: string;
          phone: string;
          governorate: string;
          city: string;
          address: string;
        }>(),
      db.rpc("get_customer_wallet_summary", {
        p_store_id: s.storeId,
        p_user_id: user.id,
      }),
    ]);
    const profile = profileRes.data;
    defaultName = profile?.full_name ?? "";
    defaultPhone = profile?.phone ?? "";
    defaultGovernorate = profile?.governorate?.trim() ?? "";
    defaultCity = profile?.city?.trim() ?? "";
    defaultAddress = profile?.address?.trim() ?? "";
    const walletData = walletRes.data as { balance?: number } | null;
    if (!walletRes.error && walletData && Number.isFinite(Number(walletData.balance))) {
      walletBalance = Math.max(0, Number(walletData.balance));
    }
  }
  return (
    <Basket
      order
      fee={s.fee}
      currency={s.currency}
      defaultName={defaultName}
      defaultPhone={defaultPhone}
      defaultGovernorate={defaultGovernorate}
      defaultCity={defaultCity}
      defaultAddress={defaultAddress}
      signedInEmail={user?.email ?? null}
      paymentOptions={s.payment}
      incentives={s.incentives}
      walletBalance={walletBalance}
      basePath={s.basePath}
    />
  );
}
