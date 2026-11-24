"use client";

import { useMemo, useState } from "react";
import { MapPin, Search } from "lucide-react";
import {
  EGYPT_GOVERNORATES,
  findEgyptGovernorate,
  findEgyptCity,
  composeEgyptShippingAddress,
} from "@/lib/egypt-locations";
import { useLanguage } from "@/components/language-provider";

export function EgyptAddressFields({
  initialGovernorate = "",
  initialCity = "",
  initialStreet = "",
  required = false,
  emitCombinedAddressName,
}: {
  initialGovernorate?: string;
  initialCity?: string;
  initialStreet?: string;
  required?: boolean;
  /** When set (e.g., on Checkout), emits a hidden input with the composed `gov - city - street` value. */
  emitCombinedAddressName?: string;
}) {
  const { lang } = useLanguage();
  const isEn = lang === "en";

  const matchedInitGov = findEgyptGovernorate(initialGovernorate);
  const matchedInitCity = findEgyptCity(matchedInitGov, initialCity);

  const [govId, setGovId] = useState<string>(matchedInitGov?.id ?? "");
  const [cityAr, setCityAr] = useState<string>(
    matchedInitCity?.name_ar ?? initialCity.trim(),
  );
  const [street, setStreet] = useState<string>(initialStreet);
  const [govQuery, setGovQuery] = useState<string>("");

  const filteredGovs = useMemo(() => {
    const q = govQuery.trim().toLowerCase();
    if (!q) return EGYPT_GOVERNORATES;
    return EGYPT_GOVERNORATES.filter(
      (g) =>
        g.name_ar.toLowerCase().includes(q) ||
        g.name_en.toLowerCase().includes(q),
    );
  }, [govQuery]);

  const selectedGov = useMemo(
    () => EGYPT_GOVERNORATES.find((g) => g.id === govId),
    [govId],
  );

  const selectedGovValue = selectedGov
    ? isEn
      ? selectedGov.name_en
      : selectedGov.name_ar
    : initialGovernorate;

  const selectedCityObj = findEgyptCity(selectedGov, cityAr);
  const selectedCityValue = selectedCityObj
    ? isEn
      ? selectedCityObj.name_en
      : selectedCityObj.name_ar
    : cityAr;

  const combinedAddress = composeEgyptShippingAddress(
    selectedGovValue,
    selectedCityValue,
    street,
  );

  return (
    <div className="egypt-address-fields">
      <label>
        <span>{isEn ? "Governorate (27 Governorates)" : "المحافظة (27 محافظة)"}</span>
        <div className="egypt-gov-search-box">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={govQuery}
            onChange={(e) => setGovQuery(e.target.value)}
            placeholder={isEn ? "Filter governorates..." : "ابحث عن المحافظة..."}
            aria-label={isEn ? "Filter governorates" : "بحث المحافظات"}
          />
        </div>
        <select
          value={govId}
          required={required}
          onChange={(e) => {
            setGovId(e.target.value);
            setCityAr("");
          }}
        >
          <option value="">
            {isEn ? "— Select Governorate —" : "— اختر المحافظة —"}
          </option>
          {filteredGovs.map((g) => (
            <option key={g.id} value={g.id}>
              {isEn ? `${g.name_en} (${g.name_ar})` : g.name_ar}
            </option>
          ))}
        </select>
        <input type="hidden" name="governorate" value={selectedGovValue} />
      </label>

      <label>
        <span>{isEn ? "City / District" : "المدينة / المركز"}</span>
        <select
          value={cityAr}
          disabled={!selectedGov}
          required={required}
          onChange={(e) => setCityAr(e.target.value)}
        >
          <option value="">
            {selectedGov
              ? isEn
                ? "— Select City / District —"
                : "— اختر المدينة / المركز —"
              : isEn
                ? "Select governorate first"
                : "اختر المحافظة أولاً"}
          </option>
          {selectedGov?.cities.map((c) => (
            <option key={c.name_ar} value={c.name_ar}>
              {isEn ? `${c.name_en} (${c.name_ar})` : c.name_ar}
            </option>
          ))}
        </select>
        <input type="hidden" name="city" value={selectedCityValue} />
      </label>

      <label>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
          <MapPin size={14} aria-hidden="true" />
          {isEn
            ? "Detailed Street Address (Street, Building, Floor, Landmark)"
            : "عنوان الشارع بالتفصيل (الشارع، العمارة، الدور، الشقة، أقرب معلم)"}
        </span>
        <textarea
          name={emitCombinedAddressName ? "street_address" : "address"}
          rows={3}
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          required={required}
          minLength={required ? 5 : undefined}
          maxLength={400}
          autoComplete="street-address"
          placeholder={
            isEn
              ? "e.g. 15 Abbas El Akkad St., Bldg 4, Floor 3, Apt 12, near City Stars"
              : "مثال: 15 شارع عباس العقاد، عمارة 4، الدور 3، شقة 12، بجوار سيتي ستارز"
          }
        />
      </label>

      {emitCombinedAddressName && (
        <input
          type="hidden"
          name={emitCombinedAddressName}
          value={combinedAddress}
        />
      )}
    </div>
  );
}
