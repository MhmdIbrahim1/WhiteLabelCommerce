import assert from "node:assert/strict";
import test from "node:test";
import { directoryHref, orderFilters, paymentFilters } from "../src/lib/workspace-directory.ts";
import { orderAmounts, paymentStatusLabel } from "../src/lib/order-payment.ts";

test("order directory validates Gregorian dates and normalizes reversed ranges", () => {
  assert.deepEqual(orderFilters({ from: "2024-03-01", to: "2024-02-29", payment: "refund_pending" }), {
    from: "2024-02-29", to: "2024-03-01", payment: "refund_pending",
  });
  for (const date of ["", "0000-02-29", "1900-02-29", "2024-04-31", "2024-1-01", "2024-01-01Z", ["2024-01-01"]]) {
    assert.deepEqual(orderFilters({ from: date, to: "2024-11-30", payment: "__proto__" }),
      { from: "", to: "2024-11-30", payment: "" });
  }
});

test("every payment filter has both labels and survives pagination and inspection", () => {
  for (const payment of paymentFilters) {
    const filters = orderFilters({ payment, from: "2024-01-01", to: "2024-02-29" });
    assert.equal(filters.payment, payment);
    assert.notEqual(paymentStatusLabel(payment, true), "Unknown");
    assert.notEqual(paymentStatusLabel(payment, false), "غير معروف");
    for (const inspect of ["id", undefined]) {
      const url = new URL(directoryHref("/admin/orders", { q: "Ali & Co", status: "pending", page: 2, inspect, ...filters }), "https://example.test");
      assert.deepEqual(Object.fromEntries(url.searchParams), { q: "Ali & Co", status: "pending", ...filters, page: "2", ...(inspect ? { inspect } : {}) });
    }
  }
});

test("recorded net subtotals, full coupons and wallet credits are never deducted twice", () => {
  const couponOrder = { subtotal: 80, discount_amount: 20, shipping_fee: 0, wallet_discount: 10, total: 70,
    order_items: [{ unit_price: 50, quantity: 2 }] };
  assert.deepEqual(orderAmounts(couponOrder), { subtotal: 80, couponIncluded: true, total: 70 });
  assert.equal(orderAmounts({ ...couponOrder, total: null }).total, 70);
  assert.deepEqual(orderAmounts({ ...couponOrder, subtotal: "0.00", discount_amount: 100, wallet_discount: 0, total: 0 }),
    { subtotal: 0, couponIncluded: true, total: 0 });
});

test("legacy subtotals use item snapshots in cents and apply shipping, coupon and wallet once", () => {
  for (const subtotal of [null, "", "  ", "broken", -1, Infinity]) {
    const order = { subtotal, order_items: [{ unit_price: 2.30, quantity: 3 }, { unit_price: .10, quantity: 1 }],
      discount_amount: 2, wallet_discount: .50, shipping_fee: 3, total: null };
    assert.deepEqual(orderAmounts(order), { subtotal: 7, couponIncluded: false, total: 7.50 });
  }
  assert.equal(orderAmounts({ subtotal: null, shipping_fee: 0, total: null, order_items: [], wallet_discount: 0, discount_amount: 0 }).total, null);
});
