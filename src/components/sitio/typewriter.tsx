"use client";

import { createElement, useEffect, useState } from "react";

/**
 * Texto que se escribe letra por letra. Sin JavaScript, o si la persona
 * pidió reducir el movimiento, se ve completo desde el inicio (el script
 * del layout solo marca `data-tw` cuando se puede animar). Los lectores de
 * pantalla y Google leen siempre el texto completo (aria-label / sr-only).
 */
export function Typewriter({
  text,
  as = "span",
  className,
  delay = 0,
  speed = 28,
}: {
  text: string;
  as?: "span" | "h1" | "h2" | "p";
  className?: string;
  delay?: number;
  speed?: number;
}) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!document.querySelector('[data-tw="1"]')) return;
    let i = 0;
    let timer: number;
    const start = window.setTimeout(function tick() {
      i += 1;
      setCount(i);
      if (i < text.length) timer = window.setTimeout(tick, speed);
    }, delay);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(timer);
    };
  }, [text, delay, speed]);

  const shown = count === null ? text : text.slice(0, count);
  return createElement(
    as,
    { className, "aria-label": text },
    createElement(
      "span",
      { "aria-hidden": true, className: count === null ? "tw-pending" : undefined },
      shown,
    ),
    count !== null && count < text.length
      ? createElement("span", { "aria-hidden": true, className: "tw-caret" }, "​")
      : null,
  );
}
