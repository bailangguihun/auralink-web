"use client";

import { useEffect, useState } from "react";

import { ArrowIcon, BrandIcon } from "@/components/icons";

const slides = [
  "/artlive-reference/Bg1.jpg",
  "/artlive-reference/Bg2.jpg",
  "/artlive-reference/Bg3.jpeg",
  "/artlive-reference/Bg4.jpg",
];

export function HomeHero() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    const interval = window.setInterval(() => {
      setActive((value) => (value + 1) % slides.length);
    }, 7000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <section className="home-hero" id="home-welcome" aria-label="ArtLIVE 画智体欢迎页">
      <div className="hero-slides" aria-hidden="true">
        {slides.map((source, index) => (
          <div
            className={`hero-slide${active === index ? " hero-slide-active" : ""}`}
            key={source}
            style={{ backgroundImage: `url(${source})` }}
          />
        ))}
      </div>
      <div className="hero-shade" />
      <div className="hero-brand">
        <span className="hero-mark"><BrandIcon width={30} height={30} /></span>
        <h1>ArtLIVE 画智体</h1>
        <p className="hero-subtitle">墨韵流转 · 数字山水</p>
        <p>在真实画作与文化知识之间，打开可理解、可收藏、可导览的数字空间</p>
      </div>
      <div className="hero-dots" role="group" aria-label="切换首页画作">
        {slides.map((source, index) => (
          <button
            key={source}
            type="button"
            aria-label={`显示第 ${index + 1} 幅画作`}
            aria-pressed={active === index}
            onClick={() => setActive(index)}
          />
        ))}
      </div>
      <a className="scroll-cue" href="#home-features" aria-label="继续了解 ArtLIVE"><ArrowIcon direction="down" width={34} height={34} /></a>
    </section>
  );
}
