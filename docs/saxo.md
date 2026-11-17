# Saxo Investor sync

The connector downloads historical trades, transactions/bookings, closed-position reports, current positions and balances. Stocks, ETFs, ETCs, futures, options, FX and CFDs are classified for the journal; other asset types retain the `other` classification. Each Saxo subaccount stays in its own currency and journal account.

## Accounting

The journal reconstructs opening and closing executions from **Saxo position reports**, with one matching group per opening position. These are position-level records, not a claim to reproduce every original execution. Source trades and transactions are retained in the downloadable report. This avoids phantom positions caused by transferred holdings, futures settlements, corporate actions or incomplete historical fills.

- Closed net P&L comes directly from Saxo's account-currency P&L, including conversion and settlement effects. It is not calculated by subtracting unconverted instrument prices.
- Opening/closing commissions, exchange fees, transaction taxes, conversion costs and rebates are read from transaction bookings and allocated to partial closes. Where an old opening transaction is unavailable, costs embedded in the live equity position may supply its opening cost. Otherwise the UI flags the incomplete fee/gross-P&L breakdown; closed net P&L remains broker-reported.
- Futures and option contract sizes are derived from the reported traded value, quantity and price where available. Entry conversion rates supply account-currency risk multipliers. If the facts are unavailable, derivative risk metrics remain unavailable rather than assuming a contract size of one.
- Quoted entry/exit prices remain in instrument currency. Open mark-to-market P&L, cash and equity are shown on Accounts. Open P&L is before position costs; indicative/delayed prices are labelled when Saxo supplies the delay.
- Cash transfers, dividends, interest, standalone commissions and other non-trade activity appear in the separate account activity ledger. They are not added to trade win rates or realized trading P&L. The journal's existing trade-derived equity curve does not become a cash-flow-adjusted brokerage equity curve; current broker equity is shown separately.
- Partial closes share their opening lot. Repeat syncs update accounting rows by stable position identity, preserving journal annotations. If an older annotated record cannot be mapped safely, sync stops without changing accounting data.
- Back-office dates may have only day precision. These use midnight UTC and are identified in Data notes. An unordered settlement record may have zero duration; precise execution timing must not be inferred from it.

## Setup

1. Create a personal LIVE application in the Saxo Developer Portal. Use Code grant and disable trading.
2. Register the exact callback: `https://YOUR-JOURNAL/api/saxo/callback` (or `http://localhost:3000/api/saxo/callback` for local development).
3. Set `SAXO_APP_KEY`, `SAXO_APP_SECRET`, and `SAXO_REDIRECT_URI` in the root `.env` file. Docker Compose forwards these to the server. Restart the journal.
4. Open Accounts → Connect / reconnect Saxo and complete login.
5. Use Sync on each account. Automatic syncing runs every five minutes while the server is running. Reconnect after a prolonged shutdown if the refresh token has expired.

`SAXO_ENVIRONMENT=sim` uses simulation credentials/endpoints; the default is live. `SAXO_HISTORY_FROM=YYYY-MM-DD` sets the start of available history (default 2000-01-01). Saxo determines actual historical coverage. Shortening an already imported range is blocked to prevent removing saved history. Download all fetched source reports from each account card for inspection.

Run one persistent server instance: scheduler and refresh serialization are process-local. Serverless deployments and multiple replicas are not supported. Stored tokens use the journal's encryption key; retain it with database backups.

## References

- https://www.developer.saxo/openapi/learn/oauth-authorization-code-grant
- https://www.developer.saxo/openapi/referencedocs/hist/v1/transactions/get__hist
- https://www.developer.saxo/openapi/referencedocs/cs/v1/historicalreportdata-trades/get__cs_reports_trades_clientkey
- https://www.developer.saxo/openapi/referencedocs/cs/v1/historicalreportdata-closedpositions/get__cs_reports_closedpositions_clientkey_fromdate_todate
- https://www.developer.saxo/openapi/referencedocs/port/v1/positions
