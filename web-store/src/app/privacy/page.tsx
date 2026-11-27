import { LegalPage, type LegalCopy } from "@/components/legal-page";
import { getServerLang } from "@/lib/i18n-server";
import type { Lang } from "@/lib/i18n";

const privacy: Record<Lang, LegalCopy> = {
  en: {
    title: "Privacy Policy",
    introduction: "ShopStage operates the platform that independent merchants use to run their stores. This policy explains what happens to your information when you sign in, shop or manage a store.",
    sections: [
      ["Signing in", "We use your email address to identify your account and send verification codes. If you continue with Google, our sign-in provider receives your Google account identifier, email address, verification status and available profile information. We use these details to authenticate you and can suggest your Google name when you complete a store profile. You can edit the name before saving it."],
      ["Your profile at each store", "You choose whether to complete a profile with each merchant. The name and optional mobile number you submit belong to that store’s customer record. A merchant can access the profile, orders and support conversations associated with its own store. A profile you complete with one merchant is not copied into another merchant’s store."],
      ["Orders, payments and support", "When you place an order, the store uses the products, delivery name, address, phone number and order instructions you provide to arrange fulfilment. If you choose online payment, Paymob processes the payment and returns transaction references and a payment status. We use these records for receipts, refunds and resolving payment issues. Support keeps your messages and the merchant’s replies together so you can refer back to the conversation."],
      ["Service providers and browser storage", "Supabase provides account authentication and database hosting. Resend delivers account emails. We share the information needed for each provider to carry out its service. Session cookies keep you signed in. Browser storage remembers your cart and preferences. If you enable notifications, a delivery token routes store updates to your device."],
      ["Retention and security", "We keep account and store records for as long as needed to provide the service, fulfil orders, resolve disputes and meet legal obligations. Access is limited by store and team permissions. Some transaction records may need to be retained after an account is closed for accounting, fraud prevention or legal purposes."],
      ["Access, correction and deletion", "You can update your contact details and saved addresses in the relevant store account. To request a copy, correction or deletion, contact that merchant for store records or contact ShopStage for your platform account. Tell us which store and email the request concerns. We may verify control of the account before acting. You can also remove the Google connection in your Google Account settings. To delete stored ShopStage data, send us a separate deletion request."],
    ],
    contact: "For privacy questions or a data deletion request, use the store’s support page or email ShopStage.",
  },
  ar: {
    title: "سياسة الخصوصية",
    introduction: "تدير شوب ستيدج المنصة التي يستخدمها التجار المستقلون لتشغيل متاجرهم. توضح هذه السياسة كيف نستخدم بياناتك عند تسجيل الدخول أو التسوق أو إدارة متجر.",
    sections: [
      ["تسجيل الدخول", "نستخدم بريدك الإلكتروني للتعرّف على حسابك وإرسال رموز التحقق إليك. عند المتابعة باستخدام Google، يتلقّى مزوّد تسجيل الدخول معرّف حسابك لدى Google وبريدك الإلكتروني وحالة التحقق منه وبيانات الملف الشخصي المتاحة. نستخدم هذه البيانات للتحقق من هويتك، وقد نقترح اسمك المسجّل لدى Google عند استكمال ملفك في متجر. يمكنك تعديله قبل الحفظ."],
      ["ملفك في كل متجر", "تختار بنفسك إن كنت تريد إكمال ملفك لدى كل تاجر. يُحفظ الاسم ورقم الهاتف الاختياري اللذان تقدمهما في سجلّك لدى ذلك المتجر. يمكن للتاجر الاطلاع على ملفك وطلباتك ومحادثات الدعم الخاصة بمتجره. لا تُنسخ بيانات ملفك من متجر إلى متجر آخر."],
      ["الطلبات والمدفوعات والدعم", "يستخدم المتجر تفاصيل المنتجات واسم المستلم وعنوانه ورقم هاتفه وتعليمات الطلب لترتيب التوصيل. إذا اخترت الدفع الإلكتروني، تعالج باي موب عملية الدفع وتعيد مرجع المعاملة وحالتها. نستخدم هذه السجلات لإصدار الإيصالات ورد المبالغ ومعالجة مشكلات الدفع. تُحفظ رسائلك وردود التاجر في محادثة الدعم لتتمكن من الرجوع إليها."],
      ["مقدّمو الخدمة والتخزين في المتصفح", "توفّر Supabase خدمات التحقق من الحسابات واستضافة قاعدة البيانات، وترسل Resend رسائل الحساب إلى بريدك. نشارك مع كل مزوّد المعلومات اللازمة لأداء خدمته. تُبقي ملفات تعريف ارتباط الجلسة حسابك مسجّلاً، ويحفظ المتصفح سلّة التسوق وتفضيلاتك. إذا فعّلت الإشعارات، يُستخدم رمز خاص بجهازك لإيصال تحديثات المتجر."],
      ["الاحتفاظ بالبيانات وحمايتها", "نحتفظ ببيانات الحساب والمتجر للمدة اللازمة لتقديم الخدمة وتنفيذ الطلبات ومعالجة النزاعات والوفاء بالالتزامات القانونية. يخضع الوصول إلى البيانات لصلاحيات المتجر وفريقه. قد يلزم الاحتفاظ ببعض سجلات المعاملات بعد إغلاق الحساب لأغراض المحاسبة أو منع الاحتيال أو الوفاء بمتطلبات قانونية."],
      ["الاطلاع والتصحيح والحذف", "يمكنك تحديث بيانات الاتصال والعناوين المحفوظة من حسابك في المتجر المعني. لطلب نسخة من بياناتك أو تصحيحها أو حذفها، تواصل مع التاجر بشأن سجلات متجره أو مع شوب ستيدج بشأن حسابك على المنصة. اذكر المتجر والبريد المعنيين بالطلب. قد نتحقق من ملكيتك للحساب قبل التنفيذ. يمكنك أيضاً إلغاء ربط حسابك من إعدادات Google، ولحذف البيانات المحفوظة لدى شوب ستيدج أرسل إلينا طلب حذف منفصلاً."],
    ],
    contact: "للاستفسار عن الخصوصية أو طلب حذف بياناتك، استخدم صفحة دعم المتجر أو راسل شوب ستيدج عبر البريد الإلكتروني.",
  },
};

export async function generateMetadata() {
  const copy = privacy[await getServerLang()];
  return { title: { absolute: copy.title + " · ShopStage" }, description: copy.introduction };
}

export default async function PrivacyPage() {
  const lang = await getServerLang();
  return <LegalPage lang={lang} copy={privacy[lang]} related="/terms" />;
}
