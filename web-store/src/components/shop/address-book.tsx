"use client";

import { showToast } from "@/components/floating-toast";
import { useRef, useState } from "react";
import { LocateFixed, MapPin } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { changeAddress } from "@/app/(shop)/account/address-actions";
import { EGYPT_GOVERNORATES, findEgyptGovernorate } from "@/lib/egypt-locations";
import { emptyAddress, addressLine, type DeliveryAddress, type SavedAddress } from "@/lib/customer-address";
import { normalizePhone } from "@/lib/phone";
import "./address-book.css";

type Props = {
  storeId: string;
  initial: SavedAddress[];
  profile?: Partial<DeliveryAddress>;
  checkout?: boolean;
  signedIn?: boolean;
  onGovernorate?: (id: string) => void;
  onPhone?: (value: string) => void;
};

export function AddressBook({ storeId, initial, profile, checkout = false, signedIn = true, onGovernorate, onPhone }: Props) {
  const { lang } = useLanguage();
  const en = lang === "en";
  const first = initial.find(a => a.is_default);
  const blank = { ...emptyAddress, ...profile, governorate: findEgyptGovernorate(profile?.governorate)?.id || "" };
  const [rows, setRows] = useState(initial);
  const [chosen, setChosen] = useState(checkout ? first?.id : undefined);
  const [draft, setDraft] = useState<DeliveryAddress>(checkout && first ? first : blank);
  const [editor, setEditor] = useState(checkout && !first);
  const [editing, setEditing] = useState<string>();
  const [working, setWorking] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  function setNotice(message: string, kind: "error" | "info" | "success" = "info") {
    if (message) showToast({ message, kind });
  }
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const fields = useRef<HTMLFieldSetElement>(null);
  const pending = useRef(false);
  const draftId = useRef("");
  const locVersion = useRef(0);
  const gov = findEgyptGovernorate(draft.governorate);
  const labelName = (key: DeliveryAddress["label"]) => ({
    home: en ? "Home" : "المنزل", work: en ? "Work" : "العمل", other: en ? "Other" : "آخر",
  })[key];

  function selectAddress(address: DeliveryAddress, selected?: string) {
    locVersion.current++;
    setDraft(address);
    setChosen(selected);
    setTouched({});
    onGovernorate?.(address.governorate);
    onPhone?.(address.phone);
    setNotice("");
    setConfirmDelete(undefined);
  }

  function update(key: keyof DeliveryAddress, value: string | boolean) {
    locVersion.current++;
    const moved = key === "governorate" || key === "city" || key === "street";
    setDraft(old => ({ ...old, ...(moved ? { lat: null, lng: null } : {}), [key]: value,
      ...(key === "governorate" ? { city: "" } : {}) }));
    if (key === "governorate") onGovernorate?.(String(value));
    if (key === "phone") onPhone?.(String(value));
  }

  function startEdit(row?: SavedAddress) {
    selectAddress(row ?? { ...blank, governorate: "", city: "", street: "" });
    draftId.current = crypto.randomUUID();
    setEditing(row?.id);
    setEditor(true);
  }

  async function mutate(action: "add" | "edit" | "default" | "delete", id: string) {
    if (pending.current) return;
    if (action === "add" || action === "edit") {
      for (const el of fields.current?.querySelectorAll("input, select") ?? []) {
        if (!(el as HTMLInputElement).reportValidity()) return;
      }
      if (draft.recipient_name.trim().length < 2 || !/^[0-9]{8,15}$/.test(normalizePhone(draft.phone)) || addressLine(draft, en).length > 500) {
        setNotice(en ? "Check the recipient name, phone and address length (500 characters maximum)." : "تحقق من اسم المستلم والهاتف وطول العنوان (٥٠٠ حرف بحد أقصى)."); return;
      }
    }
    pending.current = true;
    setWorking(true);
    try {
      const result = await changeAddress(storeId, action, id, draft);
      if (!result) throw Error();
      setRows(result);
      setConfirmDelete(undefined);
      setEditor(false);
      if (checkout) {
        const selection = result.find(row => row.id === id) ?? result.find(row => row.is_default);
        if (selection) selectAddress(selection, selection.id);
        else startEdit();
      }
      setNotice(en ? "Address book updated." : "تم تحديث العناوين.", "success");
    } catch {
      setNotice(en ? "Could not save this change. Check your connection and try again." : "تعذر حفظ التغيير. تحقق من الاتصال وأعد المحاولة.", "error");
    } finally { pending.current = false; setWorking(false); }
  }

  async function locate() {
    if (pending.current) return;
    const version = ++locVersion.current;
    pending.current = true;
    setWorking(true);
    setNotice(en ? "Finding your address…" : "جارٍ تحديد عنوانك…");
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {timeout: 10000, maximumAge: 30000, enableHighAccuracy: true}));
      const { latitude: lat, longitude: lng } = pos.coords;
      const response = await fetch("/api/reverse-geocode", { method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({lat,lng,lang}), signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw Error();
      const found = await response.json();
      if (version !== locVersion.current) return;
      setDraft(old => ({...old, governorate: found.governorate, city: found.city, street: found.street, lat, lng}));
      onGovernorate?.(found.governorate);
      setNotice(en ? "Check the detected address and add your building details." : "راجع العنوان وأضف تفاصيل المبنى.");
    } catch (error) {
      if (version === locVersion.current) setNotice(error && typeof error === "object" && "code" in error && error.code === 1
        ? (en ? "Location permission denied. Enter your address below." : "تم رفض إذن الموقع. أدخل عنوانك أدناه.")
        : (en ? "Location unavailable. Enter your address or try again." : "تعذر تحديد الموقع. أدخل عنوانك أو أعد المحاولة."));
    } finally { pending.current = false; setWorking(false); }
  }

  function visitField(target: EventTarget) {
    if ((target instanceof HTMLInputElement || target instanceof HTMLSelectElement) && target.name) {
      const name = target.name;
      setTouched(prev => prev[name] ? prev : { ...prev, [name]: true });
    }
  }

  function field(key: "recipient_name" | "phone" | "city" | "street" | "building" | "floor" | "apartment" | "landmark", title: string, max: number, required = false) {
    const value = draft[key].trim();
    let error = required && !value ? (en ? "This field is required." : "هذا الحقل مطلوب.") : "";
    if (value && key === "phone" && !/^[0-9]{8,15}$/.test(normalizePhone(value))) {
      error = en ? "Enter a phone number with 8 to 15 digits." : "أدخل رقم هاتف يتكون من ٨ إلى ١٥ رقماً.";
    }
    if (required && value && key === "recipient_name" && value.length < 2) error = en ? "Enter the recipient’s full name." : "أدخل اسم المستلم كاملاً.";
    const show = Boolean(touched[key] && error);
    return <label>{title}<input name={key} value={draft[key]} onChange={e => update(key, e.target.value)}
      ref={node => { node?.setCustomValidity(error); }}
      aria-invalid={show} aria-describedby={show ? "address-error-" + key : undefined}
      dir={key === "phone" ? "ltr" : undefined}
      required={required} maxLength={max} autoComplete={({recipient_name:"name", phone:"tel",street:"address-line1",city:"address-level2"} as Record<string,string>)[key]}
      type={key === "phone" ? "tel" : "text"} list={key === "city" ? "saved-address-cities" : undefined} />
      {show && <small id={"address-error-" + key} className="sf-field-error">{error}</small>}</label>;
  }

  return <section className={checkout ? "address-book" : "address-book panel"}>
    <h2><MapPin size={19} />{checkout ? (en ? "Delivery address" : "عنوان التوصيل") : (en ? "My Addresses" : "عناويني")}</h2>
    {rows.map(row => <div className="address-row" key={row.id}>
      {checkout ? <button type="button" className="address-choice" aria-pressed={chosen === row.id} disabled={working} onClick={() => {
        selectAddress(row, row.id); setEditor(false);
      }}><strong>{labelName(row.label)}{row.is_default && (en ? " · Default" : " · افتراضي")}</strong><span>{row.recipient_name} · <bdi dir="ltr">{row.phone}</bdi></span><span>{addressLine(row,en)}</span></button>
      : <><strong>{labelName(row.label)}{row.is_default && (en ? " · Default" : " · افتراضي")}</strong>
        <span>{row.recipient_name} · <bdi dir="ltr">{row.phone}</bdi></span><span>{addressLine(row,en)}</span>
        <div className="address-actions">
          <button disabled={working} type="button" onClick={() => startEdit(row)}>{en ? "Edit" : "تعديل"}</button>
          {!row.is_default && <button disabled={working} type="button" onClick={() => mutate("default",row.id)}>{en ? "Set default" : "تعيين كافتراضي"}</button>}
          <button disabled={working} type="button" onClick={() => confirmDelete === row.id ? mutate("delete",row.id) : setConfirmDelete(row.id)}>
            {confirmDelete === row.id ? (en ? "Confirm delete" : "تأكيد الحذف") : (en ? "Delete" : "حذف")}</button>
        </div></>}
    </div>)}
    {!editor && <button type="button" disabled={working} onClick={() => startEdit()}>{en ? "Add address" : "إضافة عنوان"}</button>}
    {editor && <fieldset ref={fields} disabled={working}
      onInvalid={e => visitField(e.target)} onBlur={e => visitField(e.target)}>
      <button className="address-locate" type="button" onClick={locate}><LocateFixed size={17}/>{en ? "Locate my location" : "حدد موقعي"}</button>
      <small><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a></small>
      {signedIn && <label>{en ? "Label" : "نوع العنوان"}<select value={draft.label} onChange={e=>update("label",e.target.value)}>
        {(["home","work","other"] as const).map(k=><option key={k} value={k}>{labelName(k)}</option>)}</select></label>}
      {field("recipient_name",en ? "Recipient name" : "اسم المستلم",100, signedIn)}
      {field("phone",en ? "Delivery phone" : "هاتف التوصيل",24,true)}
      <label>{en ? "Governorate" : "المحافظة"}<select required name="governorate" value={draft.governorate}
        aria-invalid={Boolean(touched.governorate && !draft.governorate)} aria-describedby={touched.governorate && !draft.governorate ? "governorate-error" : undefined}
        onChange={e=>update("governorate",e.target.value)}>
        <option value="">{en ? "Select governorate" : "اختر المحافظة"}</option>{EGYPT_GOVERNORATES.map(g=><option key={g.id} value={g.id}>{en ? g.name_en : g.name_ar}</option>)}</select>
        {touched.governorate && !draft.governorate && <small id="governorate-error" className="sf-field-error">{en ? "Choose a governorate for delivery." : "اختر محافظة التوصيل."}</small>}</label>
      {field("city", en ? "City / area" : "المدينة / المنطقة",100,true)}
      <datalist id="saved-address-cities">{gov?.cities.map(c=><option key={c.name_ar} value={en ? c.name_en : c.name_ar}/>)}</datalist>
      {field("street", en ? "Street" : "الشارع",240,true)}
      <div className="address-details">{field("building",en ? "Building" : "العمارة",40)}{field("floor",en ? "Floor" : "الدور",20)}{field("apartment",en ? "Apartment" : "الشقة",20)}</div>
      {field("landmark",en ? "Nearby landmark" : "أقرب معلم",100)}
      {signedIn && <><label className="address-check"><input type="checkbox" checked={draft.is_default} onChange={e=>update("is_default",e.target.checked)}/>{en ? "Use as default" : "استخدام كافتراضي"}</label>
        <button type="button" onClick={() => mutate(editing ? "edit" : "add",editing || (draftId.current ||= crypto.randomUUID()))}>{en ? "Save address" : "حفظ العنوان"}</button></>}
      {!checkout && <button type="button" onClick={()=>setEditor(false)}>{en ? "Cancel" : "إلغاء"}</button>}
    </fieldset>}
    {checkout && <>
      <input type="hidden" name="address" value={addressLine(draft,en)}/>
      <input type="hidden" name="delivery" value={JSON.stringify({governorate:draft.governorate,lat:draft.lat,lng:draft.lng})}/>
      {!editor && <><input type="hidden" name="phone" value={draft.phone}/><input type="hidden" name="recipient_name" value={draft.recipient_name}/></>}
    </>}
  </section>;
}
