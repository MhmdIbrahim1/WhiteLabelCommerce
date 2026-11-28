import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("backfill preserves inventory across both option axes, retired rows and reruns", async () => {
  const migration = await readFile(new URL(
    "../../supabase/migrations/20261128060000_backfill_product_variants_inventory.sql", import.meta.url,
  ), "utf8");
  const db = await PGlite.create();
  try {
    await db.exec(`
      create table products (store_id int, id int, colors text[], sizes text[], stock int);
      create table product_variants (
        store_id int, product_id int, color text not null, size text not null, stock int check (stock >= 0),
        listed boolean, primary key (store_id, product_id, color, size), check (color <> '' or size <> '')
      );
      insert into products values
        (1,1,'{red,brown,red}','{M,S}',7), (2,2,'{}','{M,S}',1), (1,3,'{yellow}','{}',0),
        (1,4,'{}','{}',8), (1,5,'{red,brown}','{}',2);
      insert into product_variants values (1,1,'red','S',4,false), (1,5,'brown','',2,true);
    `);
    const rows = async () => (await db.query(
      "select product_id, color, size, stock, listed, xmin::text as revision from product_variants order by product_id, color, size",
    )).rows;
    await db.exec(migration);
    const first = await rows();
    assert.deepEqual(first.map(r => [r.product_id, r.color, r.size, r.stock, r.listed]), [
      [1,"brown","M",2,true], [1,"brown","S",1,true], [1,"red","M",2,true], [1,"red","S",2,true],
      [2,"","M",1,true], [2,"","S",0,true], [3,"yellow","",0,true], [5,"brown","",2,true],
    ]);
    await db.exec(migration);
    assert.deepEqual(await rows(), first);
  } finally {
    await db.close();
  }
});
