import { findEgyptGovernorate } from "./egypt-locations";

export type DeliveryAddress = {
  label: "home" | "work" | "other";
  recipient_name: string;
  phone: string;
  governorate: string;
  city: string;
  street: string;
  building: string;
  floor: string;
  apartment: string;
  landmark: string;
  lat: number | null;
  lng: number | null;
  is_default: boolean;
};

export type SavedAddress = DeliveryAddress & { id: string };
export type ShippingRates = Record<string, number>;

export const emptyAddress: DeliveryAddress = {
  label: "home", recipient_name: "", phone: "", governorate: "", city: "", street: "",
  building: "", floor: "", apartment: "", landmark: "", lat: null, lng: null, is_default: false,
};

export function addressLine(a: DeliveryAddress, en: boolean) {
  const gov = findEgyptGovernorate(a.governorate);
  return [gov ? (en ? gov.name_en : gov.name_ar) : a.governorate, a.city, a.street,
    a.building && (en ? "Building " : "عمارة ") + a.building,
    a.floor && (en ? "Floor " : "دور ") + a.floor,
    a.apartment && (en ? "Apt " : "شقة ") + a.apartment, a.landmark,
  ].filter(Boolean).join(" · ");
}
