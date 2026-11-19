"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";

const ELEMENTS = {
  calendar: "tv-economic-calendar",
  economics: "tv-economic-map",
  seasonal: "tv-seasonal-chart",
  tickerTag: "tv-ticker-tag",
} as const;
const modules = new Map<string, Promise<void>>();

function loadElement(element: string): Promise<void> {
  if (customElements.get(element)) return Promise.resolve();
  const pending = modules.get(element);
  if (pending) return pending;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = `https://widgets.tradingview-widget.com/w/en/${element}.js`;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      script.onerror = null;
      script.onload = null;
      if (error) {
        script.remove();
        reject(error);
      } else resolve();
    };
    const timeout = setTimeout(
      () => finish(new Error("TradingView took too long to load.")),
      20000,
    );
    script.onerror = () => finish(new Error("TradingView could not load."));
    script.onload = () => {
      void customElements.whenDefined(element).then(() => finish());
    };
    document.head.append(script);
  }).catch((error) => {
    modules.delete(element);
    throw error;
  });
  modules.set(element, promise);
  return promise;
}

export function TradingViewElement({
  kind,
  attributes,
  title,
  href,
  height = 600,
}: {
  kind: keyof typeof ELEMENTS;
  attributes: Record<string, string | boolean>;
  title: string;
  href: string;
  height?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const serialized = JSON.stringify(attributes);
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    let active = true;
    setError("");
    setReady(false);
    const element = ELEMENTS[kind];
    const widget = document.createElement(element);
    for (const [key, value] of Object.entries(JSON.parse(serialized))) {
      // Boolean attributes must be absent when false, not the string "false".
      if (value !== false) widget.setAttribute(key, value === true ? "" : String(value));
    }
    widget.style.cssText = "display:block;width:100%;height:100%";
    const updateTheme = () =>
      widget.setAttribute(
        "theme",
        document.documentElement.classList.contains("dark") ? "dark" : "light",
      );
    updateTheme();
    root.replaceChildren(widget);
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    void loadElement(element)
      .then(() => {
        if (active) setReady(true);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Widget unavailable.");
      });
    return () => {
      active = false;
      observer.disconnect();
      root.replaceChildren();
    };
  }, [kind, serialized, retry]);
  return (
    <div className="min-w-0">
      {!ready && !error && (
        <p role="status" className="mb-2 text-xs text-muted-foreground">
          Loading {title.toLowerCase()}…
        </p>
      )}
      {error && (
        <div role="alert" className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <p>{error}</p>
          <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
            Retry widget
          </Button>
        </div>
      )}
      <div
        ref={host}
        aria-label={title}
        className="overflow-hidden rounded-lg border"
        style={{ height }}
      />
      <a
        className="mt-1 block text-xs text-muted-foreground underline"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {title} by TradingView
      </a>
    </div>
  );
}
