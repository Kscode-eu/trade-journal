# TradingView charts

Trade details embed TradingView's Advanced Chart with the trade's ticker. No API key or TradingView subscription is required. The browser must be able to load TradingView scripts and frames over the internet. Keep TradingView attribution visible.

Use **Apply symbol** to save a replacement such as `NASDAQ:AAPL` or `OANDA:EURUSD`. Mappings are stored in this browser per journal symbol and asset class. **Reset** restores the journal ticker. The chart's own symbol search helps locate the correct instrument; copy its exchange-qualified ticker into the field to persist it. Changes inside the embedded chart alone are not saved by the journal.

Only formatting is normalized: case and surrounding whitespace, plus pair separators for forex/crypto. Exchanges, broker suffixes, options and futures contracts are not guessed. A continuous future is not the same as a dated contract. Check the exchange and contract before using a replacement. Unknown symbols remain visible in TradingView's own error UI; the cross-origin embed has no supported symbol-validity callback. Use **Show recorded fills** if no matching instrument is available. Script failures expose a retry action. Privacy mode unmounts the widget.

The widget displays TradingView's market data, which can be delayed or unavailable due to exchange licensing. It is not automatically centered on the trade's dates and does not overlay journal executions. Its data cannot be exported into journal calculations or replay. Existing market-data connections and CSV history remain the source for historical replay and MAE/MFE. Journal analytics continue to use journal records.

Implementation: `apps/web/src/components/tradingview-chart.tsx`, mounted by `trade-market-data.tsx`. Widget containers are recreated on symbol/theme changes and cleaned up on unmount. No journal amounts, executions, account identifiers or notes are included in the embed configuration.

Official references:

- [Getting started](https://www.tradingview.com/widget-docs/getting-started/)
- [Embed integration and configuration](https://www.tradingview.com/widget-docs/tutorials/iframe/build-page/widget-integration/)
- [Data availability and API limitations](https://www.tradingview.com/widget-docs/faq/data/)

## Market tools

The **Markets** navigation entry (`/markets`) opens a session-preparation page with three directly linkable views:

- `/markets?view=calendar`: US economic releases, with a database-backed **High importance only** toggle (enabled by default).
- `/markets?view=news`: broad market headlines.
- `/markets?view=heatmaps`: S&P 500 sector performance (with the widget's dataset controls) or a major-currency forex heatmap.

The daily journal entry header links to current market context. These widgets are current views, not historical snapshots of the journal date, and ignore journal account/date filters. General market widgets contain public market context and remain usable in privacy mode.

Trade charts have an optional **Show symbol news** panel. It uses the same applied/saved symbol as the chart and unmounts along with the chart in privacy mode. Changing the symbol inside TradingView's own iframe does not update the news; use the journal's **Apply symbol** field to synchronize both.

`economic-calendar.tsx` loads the official module `https://widgets.tradingview-widget.com/w/en/tv-economic-calendar.js` once per page and mounts `<tv-economic-calendar countries="us" high-importance-only>`. Switching off high importance removes the boolean attribute entirely. The toggle is loaded and saved through `/api/markets/calendar-settings`, using the existing PostgreSQL settings table (`economicCalendarHighImportanceOnly`); no migration is needed. The preference is shared by this journal, rather than stored in a browser. Failed loads can be retried, and failed saves leave the previous preference selected.

`tradingview-widget.tsx` centralizes the other official iframe loaders, theme synchronization, fixed-height responsive containers, attribution, cleanup, retry and a 20-second fallback if the embed never creates a frame. Frame creation does not prove that TradingView has data; unavailable instruments and empty feeds remain handled within TradingView. Only the selected Markets tab is mounted, and symbol news loads only when expanded.

Official widget references: [economic calendar](https://www.tradingview.com/widget-docs/widgets/calendars/economic-calendar/), [news feed](https://www.tradingview.com/widget-docs/widgets/news/news-feed/), [heatmaps](https://www.tradingview.com/widget-docs/widgets/heatmaps/heatmap/). The economic calendar uses the web component; the other tools use TradingView's existing iframe loaders. No API credentials or additional packages are needed.
