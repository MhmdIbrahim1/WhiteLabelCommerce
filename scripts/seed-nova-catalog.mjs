// node scripts/seed-nova-catalog.mjs --stage | --apply | --verify
// Stage caches optimized photos locally. Apply publishes and reads back every photo
// before replacing the audited original catalog in a single database transaction.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.join(root, "web-store/package.json"));
const sharp = require("sharp");
const project = "zpabcnskkbpplurngtle";
const host = `https://${project}.supabase.co`;
const nova = "00000000-0000-0000-0000-000000000001";
const omar = "b3c5f5d9-1e15-40c8-9057-bcadbbbdfb1c";
const bucket = "product-images";
const publicBase = `${host}/storage/v1/object/public/${bucket}/${nova}/catalog/`;
// Identity set of the 64 old products approved for removal. A changed catalog needs a fresh audit.
const originalIds = "f9d9d7af2d0b14f7229b6470a59c150b";
const categories = [
  "mens-fashion", "sneakers", "leather-bags", "leather-carry", "wearable-tech",
  "watches-accessories", "wireless-sound", "desk-tech", "sun-eyewear", "accessories",
];
const cache = path.join(tmpdir(), `nova-catalog-${project}-960-q86-${sharp.versions.sharp}`);
const localEnvironment = await readFile(path.join(root, "web-store/.env.local"), "utf8").catch(error => {
  if (error.code === "ENOENT") return "";
  throw error;
});
const config = { ...parseEnv(localEnvironment.replace(/^\uFEFF/, "")), ...process.env };
const digest = (input) => createHash("sha256").update(input).digest("hex");
const unique = (items) => new Set(items).size === items.length;
const literal = (string) => "'" + string.replaceAll("'", "''") + "'";
const randomFrom = (key, range) => parseInt(digest(key).slice(0, 8), 16) % range;
const parallel = 8;

function productId(slug) {
  const hex = digest(nova + "/" + slug);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function validateManifest(items) {
  assert.equal(items.length, 100, "Expected 100 products");
  assert.ok(unique(items.map((p) => p.slug)), "Duplicate product slug");
  for (const category of categories) {
    assert.equal(items.filter((p) => p.category === category).length, 10, category);
  }
  for (const p of items) {
    assert.match(p.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    for (const key of ["name", "description"]) {
      assert.match(p[key], /\p{Script=Arabic}/u, p.slug + " " + key);
      assert.match(p[key + "_en"], /[A-Za-z]/, p.slug + " " + key + "_en");
    }
    assert.ok(Number.isFinite(p.price) && p.price > 0, p.slug + " price");
    assert.ok(Array.isArray(p.sizes) && unique(p.sizes) && p.sizes.every(s => typeof s === "string" && s.trim()), p.slug + " sizes");
    assert.ok(Array.isArray(p.specifications) && p.specifications.length >= 4 && p.specifications.length <= 6, p.slug + " specifications");
    for (const spec of p.specifications) {
      for (const key of ["key_ar", "value_ar", "key_en", "value_en"]) {
        assert.ok(typeof spec[key] === "string" && spec[key].trim(), p.slug + " " + key);
      }
    }
    const colors = Object.entries(p.colors);
    assert.ok(colors.length >= 3 && colors.length <= 4, p.slug + " color count");
    for (const [color, sources] of colors) {
      assert.match(color, /\p{Script=Arabic}/u, p.slug + " color");
      assert.ok(Array.isArray(sources) && sources.length === 3 && unique(sources), p.slug + " distinct views");
      for (const source of sources) {
        const url = new URL(source);
        assert.ok(url.protocol === "https:" && !url.username && !url.password, p.slug + " source URL");
      }
    }
  }
}

async function batches(items, run, size = parallel) {
  for (let offset = 0; offset < items.length; offset += size) {
    await run(items.slice(offset, offset + size), offset);
  }
}

async function request(url, options = {}, allowed = []) {
  for (let attempt = 0; ; attempt++) {
    let response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(90000), ...options });
    } catch (e) {
      if (attempt >= 3) throw Error(`Network failure at ${new URL(url).host}: ${e.message}`);
    }
    if (response) {
      if (response.ok || allowed.includes(response.status)) return response;
      await response.body?.cancel();
      if (attempt >= 3 || (response.status !== 429 && response.status < 500)) {
        throw Error(`HTTP ${response.status} at ${new URL(url).host}`);
      }
    }
    await delay(Math.max(1000 * 2 ** attempt, Number(response?.headers.get("retry-after") || 0) * 1000));
  }
}

async function sql(query, write = false) {
  if (write) await guard();
  assert.ok(config.SUPABASE_ACCESS_TOKEN, "Set SUPABASE_ACCESS_TOKEN");
  const endpoint = `https://api.supabase.com/v1/projects/${project}/database/query`;
  const options = {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(180000),
    headers: { Authorization: "Bearer " + config.SUPABASE_ACCESS_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ query, ...(write ? {} : { read_only: true }) }),
  };
  // A write may have committed even if the response was lost. Only retry reads.
  const response = write ? await fetch(endpoint, options) : await request(endpoint, options);
  const result = await response.json();
  if (!response.ok) throw Error(`Management SQL ${response.status}: ${String(result.message || "failed").slice(0, 400)}`);
  return result;
}

async function guard() {
  assert.deepEqual(await sql("select slug,id from public.stores where slug in ('nova-store','omar-a7a') order by slug"), [
    { slug: "nova-store", id: nova }, { slug: "omar-a7a", id: omar },
  ], "Tenant mapping changed");
}

async function boundedBuffer(response) {
  const maxBytes = 32 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body.cancel();
    throw Error("Image exceeds 32 MiB");
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    assert.ok(size <= maxBytes, "Image exceeds 32 MiB");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

async function preparePhoto(source) {
  const file = path.join(cache, digest(source) + ".webp");
  let data;
  try {
    data = await readFile(file);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    const input = await boundedBuffer(await request(source));
    const photo = sharp(input, { limitInputPixels: 100_000_000 });
    const meta = await photo.metadata();
    assert.ok(["jpeg", "png", "webp", "avif", "heif"].includes(meta.format), "Expected a photographic raster");
    assert.ok(Math.max(meta.width, meta.height) >= 800, "Source is below 800px");
    data = await photo.rotate().resize(960, 960, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86, effort: 4 }).toBuffer();
    const temporary = file + "." + randomUUID() + ".part";
    await writeFile(temporary, data);
    await rename(temporary, file);
  }
  const meta = await sharp(data).metadata();
  assert.equal(meta.format, "webp", "Cached photo is not WebP");
  assert.ok(Math.max(meta.width, meta.height) >= 800 && Math.max(meta.width, meta.height) <= 960, "Invalid cached dimensions");
  return { file, hash: digest(data) };
}

async function stage(items) {
  await mkdir(cache, { recursive: true });
  const sources = [...new Set(items.flatMap(p => Object.values(p.colors).flat()))];
  const photos = new Map();
  const failures = [];
  await batches(sources, async (batch, offset) => {
    await Promise.all(batch.map(async source => {
      try { photos.set(source, await preparePhoto(source)); }
      catch (e) { failures.push({ source: source.split("?")[0], reason: e.message }); }
    }));
    if (offset % 120 === 0) console.log(`Optimized ${offset + batch.length}/${sources.length}`);
  });
  if (failures.length) {
    const report = path.join(cache, "source-errors.json");
    await writeFile(report, JSON.stringify(failures, null, 2));
    throw Error(`${failures.length} source photos failed validation. See ${report}`);
  }
  const assets = new Map();
  const covers = new Set();
  const positions = new Map();
  const products = items.map(item => {
    const { slug, category, name, name_en, description, description_en, specifications, sizes, price } = item;
    const position = positions.get(category) ?? 0;
    positions.set(category, position + 1);
    const colors = Object.keys(item.colors);
    const galleries = {};
    const variants = [];
    for (const [i, color] of colors.entries()) {
      const views = item.colors[color].map(source => photos.get(source));
      assert.ok(unique(views.map(v => v.hash)), `${slug} / ${color} has byte-identical WebPs`);
      galleries[color] = views.map((view, j) => {
        const key = `${slug}/${i + 1}/${j + 1}-${view.hash}.webp`;
        assets.set(key, view);
        return publicBase + key;
      });
      if (i === 0) {
        assert.ok(!covers.has(views[0].hash), "Duplicate cover image at " + slug);
        covers.add(views[0].hash);
      }
      const options = sizes.length ? sizes : [""];
      const flagship = position === 0 && categories.indexOf(category) < 6;
      const colorStock = i === colors.length - 1 ? 0 : 6 + randomFrom(slug + color, 10);
      for (const [s, size] of options.entries()) {
        const stock = flagship ? Math.floor(colorStock / options.length) + Number(s < colorStock % options.length)
          : 2 + randomFrom(slug + color + size, 9);
        variants.push({ color, size, stock });
      }
    }
    return { id: productId(slug), slug, category, name, name_en, description, description_en, specifications,
      sizes, price, colors, galleries, variants,
      cost_price: Math.round(price * (0.52 + randomFrom(slug, 14) / 100)),
      old_price: position < 3 ? Math.ceil(price * 1.2 / 5) * 5 : null,
      flash_price: position === 0 ? Math.floor(price * 0.85) : null };
  });
  console.log(`Staged ${products.length} products, ${assets.size} views, ${covers.size} unique covers in ${cache}`);
  return { products, assets };
}

async function readStored(key, expectedHash, mayBeMissing = false) {
  const url = publicBase + key;
  const head = await request(url, { method: "HEAD" }, mayBeMissing ? [400, 404] : []);
  if (!head.ok) return false;
  assert.equal(head.status, 200, "Unexpected HEAD response for " + key);
  assert.equal(head.headers.get("content-type")?.split(";")[0], "image/webp", key);
  const response = await request(url);
  assert.equal(response.status, 200, "Unexpected GET response for " + key);
  assert.equal(response.headers.get("content-type")?.split(";")[0], "image/webp", key);
  const bytes = await boundedBuffer(response);
  assert.equal(digest(bytes), expectedHash, "Stored content hash mismatch: " + key);
  const meta = await sharp(bytes).metadata();
  assert.ok(meta.format === "webp" && Math.max(meta.width, meta.height) >= 800 && Math.max(meta.width, meta.height) <= 960,
    "Invalid WebP or dimensions: " + key);
  return true;
}

async function publish(assets) {
  assert.equal(new URL(config.NEXT_PUBLIC_SUPABASE_URL).origin, host, "Storage project mismatch");
  assert.ok(config.SUPABASE_SERVICE_ROLE_KEY, "Set SUPABASE_SERVICE_ROLE_KEY in web-store/.env.local");
  await batches([...assets], async (batch, offset) => {
    const missing = (await Promise.all(batch.map(async ([key, photo]) =>
      await readStored(key, photo.hash, true) ? null : { key, photo }))).filter(Boolean);
    if (missing.length) {
      // One fresh tenant check precedes every batch of concurrently dispatched writes.
      const uploads = await Promise.all(missing.map(async entry => ({ ...entry, data: await readFile(entry.photo.file) })));
      await guard();
      await Promise.all(uploads.map(async ({ key, photo, data }) => {
        assert.equal(digest(data), photo.hash, "Local cache changed after staging");
        const response = await request(`${host}/storage/v1/object/${bucket}/${nova}/catalog/${key}`, {
          method: "POST", redirect: "error",
          headers: { Authorization: "Bearer " + config.SUPABASE_SERVICE_ROLE_KEY, apikey: config.SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "image/webp", "Cache-Control": "max-age=31536000", "x-upsert": "false" },
          body: data,
        }, [400, 409]);
        // A competing identical upload can return 400/409. Only matching public bytes are acceptable.
        await response.body?.cancel();
        // An edge cache can briefly retain a missing-object response after publication.
        for (let attempt = 0; ; attempt++) {
          if (await readStored(key, photo.hash, true)) break;
          if (attempt === 6) throw Error("Uploaded photo is unavailable: " + key);
          await delay(500 * 2 ** attempt);
        }
      }));
    }
    if (offset % 120 === 0) console.log(`Verified public WebPs ${offset + batch.length}/${assets.size}`);
  });
}

const safetySnapshot = `select jsonb_build_object(
  'omar_products',(select count(*) from public.products where store_id='${omar}'),
  'omar_products_hash',(select md5(string_agg(to_jsonb(p)::text,'' order by p.id)) from public.products p where p.store_id='${omar}'),
  'omar_variants',(select count(*) from public.product_variants where store_id='${omar}'),
  'omar_stock',(select sum(stock) from public.product_variants where store_id='${omar}'),
  'omar_variants_hash',(select md5(string_agg(to_jsonb(v)::text,'' order by v.product_id,v.color,v.size))
    from public.product_variants v where v.store_id='${omar}'),
  'orders',(select count(*) from public.orders where store_id='${nova}'),
  'orders_hash',(select md5(string_agg(to_jsonb(o)::text,'' order by o.id)) from public.orders o where o.store_id='${nova}'),
  'order_items',(select count(*) from public.order_items i join public.orders o on o.id=i.order_id where o.store_id='${nova}'),
  'order_items_hash',(select md5(string_agg((to_jsonb(i)-'product_id')::text,'' order by i.id))
     from public.order_items i join public.orders o on o.id=i.order_id where o.store_id='${nova}')
) as snapshot`;

async function inventoryState() {
  const result = await sql(`select array_agg(id::text order by id) as ids,
    md5(string_agg(id::text,',' order by id)) as hash from public.products where store_id='${nova}'`);
  return result[0];
}

async function replace(products, baseline) {
  const statement = `begin isolation level repeatable read;
    set local lock_timeout = '8s';
    set local standard_conforming_strings = on;
    create temporary table seed_source on commit drop as
      select * from jsonb_to_recordset(${literal(JSON.stringify(products))}::jsonb) as r(
        id uuid, slug text, category text, name text, name_en text, description text, description_en text,
        specifications jsonb, sizes text[], price numeric, colors text[], galleries jsonb, variants jsonb,
        cost_price numeric, old_price numeric, flash_price numeric);
    do $seed$
    declare
      expected jsonb := ${literal(JSON.stringify(baseline))}::jsonb;
      current_snapshot jsonb;
      original_hash text;
    begin
      perform 1 from public.stores where id in ('${nova}','${omar}') order by id for share;
      if (select id from public.stores where slug='nova-store') is distinct from '${nova}'::uuid or
         (select id from public.stores where slug='omar-a7a') is distinct from '${omar}'::uuid then
        raise exception 'Tenant mapping changed'; end if;
      perform 1 from public.products p where p.store_id='${nova}' order by p.id for update;
      select md5(string_agg(id::text,',' order by id)) into original_hash from public.products where store_id='${nova}';
      if original_hash is distinct from '${originalIds}' then raise exception 'Original Nova catalog changed'; end if;
      current_snapshot := (${safetySnapshot});
      if expected is distinct from current_snapshot then raise exception 'Tenant or order baseline changed before replacement'; end if;
      if not exists (select from pg_constraint where conname='order_items_product_id_fkey'
        and conrelid='public.order_items'::regclass and confrelid='public.products'::regclass and confdeltype='n') then
        raise exception 'Order snapshot FK must use ON DELETE SET NULL'; end if;
      -- These older foreign keys reference product_id alone. A mis-scoped child
      -- would otherwise receive the parent's CASCADE or SET NULL action.
      if exists (
        select from public.products p join (
          select i.product_id,o.store_id from public.order_items i join public.orders o on o.id=i.order_id
          union all select product_id,store_id from public.product_reviews
          union all select product_id,store_id from public.wishlists
          union all select product_id,store_id from public.back_in_stock_subscriptions
        ) child on child.product_id=p.id
        where p.store_id='${nova}' and child.store_id is distinct from p.store_id
      ) then raise exception 'A foreign tenant references an original Nova product'; end if;
      if exists(select from seed_source r left join public.categories c on c.store_id='${nova}' and c.slug=r.category where c.id is null) then
        raise exception 'Nova category missing'; end if;
      delete from public.products where store_id='${nova}';
      insert into public.products (id,store_id,category_id,slug,name,name_en,description,description_en,
        specifications,sizes,colors,price,cost_price,old_price,stock,is_active,color_galleries,color_images,
        image_path,image_paths,flash_sale_price,flash_sale_starts_at,flash_sale_ends_at)
      select r.id,'${nova}',c.id,r.slug,r.name,r.name_en,r.description,r.description_en,
        r.specifications,r.sizes,r.colors,r.price,r.cost_price,r.old_price,
        (select sum(v.stock) from jsonb_to_recordset(r.variants) v(stock integer)),true,r.galleries,
        (select jsonb_object_agg(g.key,g.value->>0) from jsonb_each(r.galleries) g),
        r.galleries->r.colors[1]->>0,array(select jsonb_array_elements_text(r.galleries->r.colors[1])),
        r.flash_price,case when r.flash_price is not null then now() end,
        case when r.flash_price is not null then now()+interval '7 days' end
      from seed_source r join public.categories c on c.slug=r.category and c.store_id='${nova}';
      insert into public.product_variants(store_id,product_id,color,size,stock,listed)
        select '${nova}',r.id,v.color,v.size,v.stock,true from seed_source r
        cross join lateral jsonb_to_recordset(r.variants) as v(color text,size text,stock integer);
      if (select count(*) from public.products where store_id='${nova}' and is_active) <> 100 or
         exists(select from public.products p where store_id='${nova}' and not exists(select from seed_source r where r.id=p.id)) or
         exists(select from public.products p where store_id='${nova}' group by category_id having count(*)<>10) or
         exists(select from public.products p where p.store_id='${nova}' and (
           p.stock is distinct from (select sum(v.stock) from public.product_variants v where (v.store_id,v.product_id)=(p.store_id,p.id) and listed)
           or cardinality(p.colors)*greatest(1,cardinality(p.sizes)) <> (select count(*) from public.product_variants v
             where (v.store_id,v.product_id)=(p.store_id,p.id) and v.listed))) then
        raise exception 'New Nova catalog failed tenant, category or inventory checks'; end if;
      current_snapshot := (${safetySnapshot});
      if current_snapshot is distinct from expected then raise exception 'Replacement changed Omar or Nova order history'; end if;
    end $seed$;
    commit;`;
  await sql(statement, true);
}

async function verify(knownAssets) {
  await guard();
  const rows = await sql(`select p.id,p.slug,c.slug as category,p.colors,p.sizes,p.stock,p.is_active,
    p.image_path,p.color_images,p.color_galleries,p.old_price,p.flash_sale_price,
    (p.flash_sale_starts_at <= now() and p.flash_sale_ends_at > now()
      and p.flash_sale_ends_at-p.flash_sale_starts_at=interval '7 days') as current_week,
    (select jsonb_agg(jsonb_build_object('color',v.color,'size',v.size,'stock',v.stock,'listed',v.listed))
     from public.product_variants v where (v.store_id,v.product_id)=(p.store_id,p.id)) as variants
    from public.products p join public.categories c on (c.store_id,c.id)=(p.store_id,p.category_id)
    where p.store_id='${nova}' order by p.slug`);
  assert.equal(rows.length, 100, "Expected 100 Nova products");
  let galleryCount = 0, soldOutProducts = 0, variants = 0;
  const assets = new Map();
  const covers = [];
  for (const category of categories) {
    const items = rows.filter(p => p.category === category);
    assert.equal(items.length, 10, category);
    assert.equal(items.filter(p => p.flash_sale_price > 0 && p.current_week).length, 1, category + " active flash sale");
    assert.equal(items.filter(p => p.old_price !== null).length, 3, category + " discounts");
  }
  for (const p of rows) {
    assert.ok(p.is_active && p.id === productId(p.slug), p.slug + " active seeded identity");
    assert.ok(p.colors.length >= 3 && p.colors.length <= 4 && unique(p.colors), p.slug + " colors");
    assert.deepEqual(Object.keys(p.color_galleries).sort(), p.colors.toSorted(), p.slug + " gallery keys");
    const options = p.sizes.length ? p.sizes : [""];
    const matrix = new Map();
    for (const v of p.variants) {
      assert.ok(v.listed && p.colors.includes(v.color) && options.includes(v.size) && v.stock >= 0, p.slug + " invalid SKU");
      matrix.set(JSON.stringify([v.color, v.size]), v.stock);
    }
    assert.equal(matrix.size, p.colors.length * options.length, p.slug + " incomplete matrix");
    assert.equal(p.stock, [...matrix.values()].reduce((a, b) => a + b, 0), p.slug + " aggregate stock");
    variants += matrix.size;
    const colorStocks = p.colors.map(color => options.reduce((n, size) => n + matrix.get(JSON.stringify([color, size])), 0));
    if (colorStocks.includes(0)) {
      assert.equal(colorStocks.filter(n => n === 0).length, 1, p.slug + " sold-out color count");
      assert.ok(colorStocks.filter(n => n > 0).every(n => n >= 6 && n <= 15), p.slug + " sibling stock");
      soldOutProducts++;
    }
    for (const [i, color] of p.colors.entries()) {
      const views = p.color_galleries[color];
      assert.ok(views.length === 3 && unique(views), p.slug + " view count");
      const hashes = views.map((url, j) => {
        const prefix = publicBase + p.slug + "/" + (i + 1) + "/" + (j + 1) + "-";
        assert.ok(url.startsWith(prefix) && url.endsWith(".webp"), p.slug + " non-canonical photo URL");
        const hash = url.slice(prefix.length, -5);
        assert.match(hash, /^[a-f0-9]{64}$/);
        assets.set(url.slice(publicBase.length), hash);
        return hash;
      });
      assert.ok(unique(hashes), p.slug + " duplicate photo content");
      assert.equal(p.color_images[color], views[0], p.slug + " legacy primary");
      if (i === 0) {
        assert.equal(p.image_path, views[0], p.slug + " cover");
        covers.push(hashes[0]);
      }
      galleryCount++;
    }
  }
  assert.equal(soldOutProducts, 6, "Expected six sold-out flagship colorways");
  assert.ok(unique(covers) && covers.length === 100, "Expected 100 unique cover contents");
  if (knownAssets) {
    assert.equal(assets.size, knownAssets.size);
    for (const [key, hash] of assets) assert.equal(knownAssets.get(key)?.hash, hash, "Published asset mismatch");
  } else {
    await batches([...assets], async (batch, offset) => {
      await Promise.all(batch.map(([key, hash]) => readStored(key, hash)));
      if (offset % 120 === 0) console.log(`Checked HEAD, GET and SHA-256 ${offset + batch.length}/${assets.size}`);
    });
  }
  const [{snapshot}] = await sql(safetySnapshot);
  console.log(JSON.stringify({ products: rows.length, categories: 10, covers: covers.length, galleries: galleryCount,
    photos: assets.size, variants, stockMismatches: 0, soldOutProducts, flashDeals: 10, ...snapshot }));
  return snapshot;
}

async function main() {
  const mode = process.argv[2];
  assert.ok(process.argv.length === 3 && ["--stage", "--apply", "--verify"].includes(mode),
    "Usage: node scripts/seed-nova-catalog.mjs --stage | --apply | --verify");
  if (mode === "--verify") {
    await verify();
    return;
  }
  const items = JSON.parse(await readFile(path.join(root, "scripts/nova-catalog.json"), "utf8"));
  validateManifest(items);
  if (mode === "--stage") {
    await stage(items);
    return;
  }
  await guard();
  const state = await inventoryState();
  const desired = items.map(p => productId(p.slug)).sort();
  if (state.ids?.length === desired.length && state.ids.every((id, i) => id === desired[i])) {
    console.log("This catalog is installed. Preserved its existing stock, orders, merchant edits and promotion dates.");
    return;
  }
  assert.equal(state.hash, originalIds, "Nova product identities differ from the approved replacement set");
  const [{ snapshot: before }] = await sql(safetySnapshot);
  assert.equal(before.orders, 50);
  assert.equal(before.order_items, 67);
  assert.equal(before.omar_products, 51);
  assert.equal(before.omar_variants, 726);
  assert.equal(before.omar_stock, 1038);
  console.log("Before replacement", JSON.stringify(before));
  const { products, assets } = await stage(items);
  await publish(assets);
  await replace(products, before);
  assert.deepEqual(await verify(assets), before, "Tenant or historical data changed");
}

export { guard, sql };
if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
