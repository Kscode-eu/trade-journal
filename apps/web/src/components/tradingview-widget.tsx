"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";

// Only official, explicitly supported embed loaders can be selected by callers.
export type TradingViewWidgetKind =
  | "advanced-chart"
  | "events"
  | "timeline"
  | "stock-heatmap"
  | "forex-heat-map"
  | "ticker-tape"
  | "tickers"
  | "single-quote"
  | "mini-symbol-overview"
  | "symbol-overview"
  | "market-overview"
  | "market-quotes"
  | "symbol-info"
  | "technical-analysis"
  | "symbol-profile"
  | "screener"
  | "forex-cross-rates";

export function TradingViewWidget({
  kind,
  options,
  title,
  href,
  height = 560,
}: {
  kind: TradingViewWidgetKind;
  options: Record<string, unknown>;
  title: string;
  href: string;
  height?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "embedded" | "failed">("loading");
  const [retry, setRetry] = useState(0);
  // Equivalent inline option objects must not reload a running widget.
  const serialized = JSON.stringify(options);
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    let active = true;
    let script: HTMLScriptElement | undefined;
    let timeout: ReturnType<typeof setTimeout>;
    let frames: MutationObserver | undefined;
    let dark = document.documentElement.classList.contains("dark");
    function mount() {
      if (script) script.onerror = null;
      clearTimeout(timeout);
      frames?.disconnect();
      root!.replaceChildren();
      setStatus("loading");
      const container = document.createElement("div");
      container.className = "tradingview-widget-container";
      container.style.cssText = "height:100%;width:100%";
      const target = document.createElement("div");
      target.className = "tradingview-widget-container__widget";
      target.style.cssText = "height:100%;width:100%";
      container.append(target);
      script = document.createElement("script");
      script.src = `https://s3.tradingview.com/external-embedding/embed-widget-${kind}.js`;
      script.async = true;
      script.textContent = JSON.stringify({
        width: "100%",
        height: "100%",
        locale: "en",
        ...JSON.parse(serialized),
        [kind === "advanced-chart" ? "theme" : "colorTheme"]: dark ? "dark" : "light",
      });
      script.onerror = () => {
        if (active) {
          clearTimeout(timeout);
          setStatus("failed");
        }
      };
      // Detect embed creation only. Cross-origin market availability remains widget-owned.
      frames = new MutationObserver(() => {
        const frame = container.querySelector("iframe");
        if (frame && active) {
          frame.title = title;
          clearTimeout(timeout);
          setStatus("embedded");
        }
      });
      frames.observe(container, { childList: true, subtree: true });
      timeout = setTimeout(() => {
        if (active) setStatus("failed");
      }, 20000);
      root!.append(container);
      container.append(script);
    }
    mount();
    const theme = new MutationObserver(() => {
      const next = document.documentElement.classList.contains("dark");
      if (next !== dark) {
        dark = next;
        mount();
      }
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      active = false;
      clearTimeout(timeout);
      theme.disconnect();
      frames?.disconnect();
      if (script) script.onerror = null;
      root.replaceChildren();
    };
  }, [kind, serialized, title, retry]);

  return (
    <div className="min-w-0">
      {status === "loading" && (
        <p role="status" className="mb-2 text-xs text-muted-foreground">
          Loading {title}…
        </p>
      )}
      {status === "failed" && (
        <div role="alert" className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <p>TradingView could not load. Check your connection, retry, or open the link below.</p>
          <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
            Retry
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
