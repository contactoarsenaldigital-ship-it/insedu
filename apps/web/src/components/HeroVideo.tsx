"use client";
import { useEffect, useRef } from "react";

/** Video decorativo de la portada, en bucle y sin sonido. Se detiene si la persona pidió reducir el movimiento. */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      if (!v) return;
      if (reduce.matches) v.pause();
      else void v.play().catch(() => undefined);
    };
    apply();
    reduce.addEventListener("change", apply);
    return () => reduce.removeEventListener("change", apply);
  }, []);
  return (
    <div className="hero-media" aria-hidden="true">
      <video ref={ref} src="/video/portada.mp4" poster="/video/portada.jpg" autoPlay muted loop playsInline preload="metadata" disablePictureInPicture />
    </div>
  );
}
