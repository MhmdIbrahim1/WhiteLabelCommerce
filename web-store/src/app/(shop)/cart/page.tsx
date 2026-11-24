import { Basket } from "@/components/shop/basket";
import { settings } from "@/lib/shop";
export default async function Cart() {
  const s = await settings();
  return <Basket fee={s.fee} currency={s.currency} />;
}
