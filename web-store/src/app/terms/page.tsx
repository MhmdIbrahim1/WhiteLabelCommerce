import { LegalPage, type LegalCopy } from "@/components/legal-page";
import { getServerLang } from "@/lib/i18n-server";
import type { Lang } from "@/lib/i18n";

const terms: Record<Lang, LegalCopy> = {
  en: {
    title: "Terms of Service",
    introduction: "These terms govern your use of ShopStage as a shopper, merchant or team member. By using the platform you agree to these terms. If you act for a business, you must have authority to act on its behalf.",
    sections: [
      ["The platform and the seller", "ShopStage provides the storefront, account, checkout and management software. The merchant identified on the storefront offers the products and is responsible for their descriptions, prices, availability, delivery and after-sales service. Check that store’s shipping, cancellation and return policies before placing an order."],
      ["Your account", "Provide accurate contact details, keep control of your sign-in methods and protect your verification codes. Only use accounts and merchant workspaces you are authorised to access. Tell the relevant merchant or ShopStage promptly if you suspect someone else has used your account."],
      ["Purchases and payments", "Review the items, currency, total, delivery fees and payment method at checkout. A submitted order is subject to the merchant’s fulfilment and applicable consumer rights. Paymob handles online payment authorisation where offered. Contact the seller about changes, delivery, returns or refunds and include the order reference so the seller can locate the purchase."],
      ["Merchant services", "Merchants must have the right to sell their goods and publish their product content. They are responsible for lawful listings, taxes, customer communications, refunds and the access they give team members. Review a plan’s displayed price, limits and billing period before purchasing or upgrading. Use shopper information only for authorised purposes connected with the store."],
      ["Acceptable use and content", "Use the platform lawfully. You may not impersonate other people, publish deceptive listings, send unsolicited messages, interfere with the service or attempt to access another store’s data. You retain your rights in the content you provide and permit ShopStage to host and display it as needed to run your store or fulfil your requests."],
      ["Service changes and account access", "Features and availability may change during maintenance or as the platform develops. ShopStage may restrict access to address fraud, a security risk, a legal requirement or a breach of these terms. Contact support to ask about a restriction or to request account closure. Outstanding orders, payment obligations and rights provided by applicable law continue to apply."],
      ["Updates to these terms", "The date on this page identifies the current version. Changes apply from their stated effective date. These terms preserve any rights and remedies that applicable consumer law makes mandatory."],
    ],
    contact: "For an order, contact the merchant through its store support page. For a question about these terms or your platform account, email ShopStage.",
  },
  ar: {
    title: "شروط الخدمة",
    introduction: "تنظّم هذه الشروط استخدامك لشوب ستيدج بصفتك متسوّقاً أو تاجراً أو عضواً في فريق متجر. باستخدام المنصة توافق على هذه الشروط. إذا كنت تمثّل منشأة، يجب أن تكون مخوّلاً بالتصرف نيابة عنها.",
    sections: [
      ["المنصة والبائع", "توفّر شوب ستيدج برمجيات واجهة المتجر والحسابات وإتمام الطلبات والإدارة. يعرض التاجر المحدّد في واجهة المتجر المنتجات ويتحمّل مسؤولية وصفها وتسعيرها وتوافرها وتوصيلها وخدمة ما بعد البيع. راجع سياسات الشحن والإلغاء والإرجاع لدى المتجر قبل الطلب."],
      ["حسابك", "قدّم بيانات اتصال صحيحة، واحتفظ بالسيطرة على وسائل تسجيل الدخول واحمِ رموز التحقق الخاصة بك. استخدم فقط الحسابات ومساحات عمل التجار التي لديك صلاحية دخولها. أبلغ التاجر المعني أو شوب ستيدج سريعاً إذا اشتبهت في استخدام شخص آخر لحسابك."],
      ["المشتريات والمدفوعات", "راجع المنتجات والعملة والإجمالي ورسوم التوصيل ووسيلة الدفع قبل تأكيد الطلب. يخضع الطلب لتنفيذ التاجر ولحقوق المستهلك السارية. تتولى باي موب معالجة طلب تفويض الدفع الإلكتروني عند توفّر هذا الخيار. تواصل مع البائع لتعديل الطلب أو الاستفسار عن التسليم أو الإرجاع أو استرداد المبلغ، واذكر مرجع الطلب ليتسنى له العثور عليه."],
      ["خدمات التجار", "يجب أن يملك التاجر الحق في بيع السلع ونشر المحتوى المتعلّق بمنتجاته. وهو مسؤول عن مشروعية العروض والضرائب والتواصل مع العملاء ورد المبالغ والصلاحيات الممنوحة لأعضاء فريقه. راجع السعر والحدود ودورة الفوترة المعروضة للباقة قبل الشراء أو الترقية. استخدم بيانات العملاء للأغراض المصرّح بها والمتصلة بالمتجر."],
      ["الاستخدام المقبول والمحتوى", "استخدم المنصة بصورة مشروعة. يُحظر انتحال الشخصية أو نشر عروض مضلّلة أو إرسال رسائل غير مرغوبة أو تعطيل الخدمة أو محاولة الوصول إلى بيانات متجر آخر. تحتفظ بحقوقك في المحتوى الذي تقدمه وتسمح لشوب ستيدج باستضافته وعرضه بالقدر اللازم لتشغيل متجرك أو تلبية طلباتك."],
      ["تغييرات الخدمة والوصول إلى الحساب", "قد تتغيّر المزايا أو يتأثر توافرها أثناء الصيانة أو تطوير المنصة. يمكن لشوب ستيدج تقييد الوصول لمعالجة احتيال أو خطر أمني أو للوفاء بمتطلب قانوني أو لمعالجة مخالفة لهذه الشروط. تواصل مع الدعم للاستفسار عن تقييد الوصول أو لطلب إغلاق الحساب. تظل الطلبات القائمة والتزامات الدفع والحقوق المقرّرة قانوناً سارية."],
      ["تحديث الشروط", "يشير التاريخ الوارد في هذه الصفحة إلى النسخة الحالية. تسري التغييرات اعتباراً من التاريخ المحدد لنفاذها. تظل حقوق المستهلك ووسائل الانتصاف التي يكفلها القانون الساري محفوظة."],
    ],
    contact: "للاستفسار عن طلب، تواصل مع التاجر من صفحة الدعم في متجره. للأسئلة المتعلقة بهذه الشروط أو بحسابك على المنصة، راسل شوب ستيدج عبر البريد الإلكتروني.",
  },
};

export async function generateMetadata() {
  const copy = terms[await getServerLang()];
  return { title: { absolute: copy.title + " · ShopStage" }, description: copy.introduction };
}

export default async function TermsPage() {
  const lang = await getServerLang();
  return <LegalPage lang={lang} copy={terms[lang]} related="/privacy" />;
}
