"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Pause, Play, Smartphone, Store } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { catalog, photos, type Vertical } from "./catalog";

type Tile = Vertical | "android";
const rows: Tile[][] = [
  ["fragrance", "audio", "fashion", "objects", "coffee", "android", "fragrance", "fashion"],
  ["objects", "android", "coffee", "fashion", "fragrance", "audio", "objects", "coffee"],
  ["coffee", "fashion", "audio", "fragrance", "android", "objects", "fashion", "audio"],
];

function MosaicTile({ tile, lang }: { tile: Tile; lang: Lang }) {
  if (tile === "android") return <div className="mosaic-tile mosaic-app">
    <div className="mosaic-app-frame"><span>Fold</span><Image src={photos.fashion} alt="" loading="eager" unoptimized /><i /></div>
    <div className="mosaic-caption"><b lang="en">Fold</b><span><Smartphone size={12} />{lang === "en" ? "Android" : "أندرويد"}</span></div>
  </div>;
  return <div className={"mosaic-tile mosaic-" + tile}>
    <Image src={photos[tile]} alt="" loading="eager" unoptimized />
    <div className="mosaic-caption"><b lang="en">{catalog[tile].brand}</b><span>{catalog[tile].category[lang]}</span></div>
  </div>;
}

export function HeroMosaic({ lang, motion }: { lang: Lang; motion: boolean }) {
  const [paused, setPaused] = useState(false);
  return <>
    <div className="hero-art" aria-hidden="true">
      <div className="mosaic-plane" dir="ltr" data-paused={paused || !motion}>
        {rows.map((row, index) => <div key={index} className="mosaic-track">
          {[0, 1].map(copy => <div key={copy} className="mosaic-group">
            {row.map((tile, i) => <MosaicTile key={i} tile={tile} lang={lang} />)}
          </div>)}
        </div>)}
      </div>
    </div>
    {motion && <button type="button" className="mosaic-pause" aria-pressed={paused}
      aria-label={lang === "en" ? "Pause mosaic motion" : "إيقاف حركة الصور مؤقتاً"} onClick={() => setPaused(!paused)}>
      {paused ? <Play size={15} /> : <Pause size={15} />}
    </button>}
  </>;
}

export function StartDock({ lang, sticky }: { lang: Lang; sticky: boolean }) {
  const slot = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [past, setPast] = useState(false);
  const en = lang === "en";
  const label = en ? "Enter your store name to start free" : "اكتب اسم متجرك وابدأ مجاناً";

  useEffect(() => {
    if (!sticky || !slot.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      setPast(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0);
    });
    observer.observe(slot.current);
    return () => observer.disconnect();
  }, [sticky]);

  return <div className="start-slot" ref={slot}>
    <form className="start-dock" data-floating={sticky && past} action="/create-store" method="get" onSubmit={event => {
      const field = input.current;
      if (!field) return;
      field.value = field.value.trim();
      if (field.value.length < 2) {
        event.preventDefault();
        field.setCustomValidity(en ? "Enter at least two characters." : "اكتب حرفين على الأقل.");
        field.reportValidity();
      }
    }}>
      <Store className="start-store" size={20} aria-hidden="true" />
      <input ref={input} aria-label={label} name="name" dir="auto" placeholder={label} required minLength={2} maxLength={120}
        autoComplete="organization" onInput={e => e.currentTarget.setCustomValidity("")} />
      <button type="submit" aria-label={en ? "Start your free store" : "ابدأ متجرك مجاناً"}><ArrowRight className="pt-directional" size={21} /></button>
    </form>
  </div>;
}

