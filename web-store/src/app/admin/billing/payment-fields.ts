export const paymentFlags = {
  manual_transfer_enabled: ["Accept manual transfers", "قبول التحويلات اليدوية"],
  paymob_enabled: ["Accept Paymob payments", "قبول مدفوعات باي موب"],
  paymob_card_enabled: ["Bank cards", "البطاقات البنكية"],
  paymob_wallet_enabled: ["Mobile wallets", "محافظ الهاتف"],
} as const;
export const receivingFields = {
  instapay_handle: { en: "InstaPay handle", ar: "عنوان إنستاباي", max: 120, dir: "ltr" },
  wallet_transfer_number: { en: "Wallet number", ar: "رقم المحفظة", max: 32, dir: "ltr" },
  bank_name: { en: "Bank name", ar: "اسم البنك", max: 120, dir: "auto" },
  bank_account_name: { en: "Account holder", ar: "اسم صاحب الحساب", max: 120, dir: "auto" },
  bank_iban: { en: "IBAN", ar: "رقم الحساب الدولي (IBAN)", max: 64, dir: "ltr" },
} as const;
export const credentialFields = {
  paymob_api_key: ["API key", "مفتاح الواجهة البرمجية"],
  paymob_hmac_secret: ["HMAC secret", "مفتاح توقيع HMAC"],
  paymob_card_integration_id: ["Card integration ID", "معرّف تكامل البطاقات"],
  paymob_card_iframe_id: ["Card iframe ID", "معرّف إطار الدفع بالبطاقة"],
  paymob_wallet_integration_id: ["Wallet integration ID", "معرّف تكامل المحافظ"],
} as const;
export type PaymentSettings = Record<keyof typeof paymentFlags, boolean> &
  Record<keyof typeof receivingFields | "manual_instructions_ar" | "manual_instructions_en", string | null> & { revision: number };
export type CredentialStatus = Record<keyof typeof credentialFields, boolean>;
