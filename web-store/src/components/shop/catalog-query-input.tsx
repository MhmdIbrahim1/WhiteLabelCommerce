"use client";

import { useState } from "react";

export function CatalogQueryInput({ query, exact, placeholder }: {
  query: string; exact: boolean; placeholder: string;
}) {
  const [value, setValue] = useState(query);
  return (
    <>
      <input name="q" value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} />
      {exact && value.trim() === query && <input type="hidden" name="exact" value="1" />}
    </>
  );
}
