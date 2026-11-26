export const photo = (path: string | null) =>
  path
    ? /^https?:\/\//i.test(path) || path.startsWith("/")
      ? path
      : process.env.NEXT_PUBLIC_SUPABASE_URL +
        "/storage/v1/object/public/product-images/" +
        path.split("/").map(encodeURIComponent).join("/")
    : null;
