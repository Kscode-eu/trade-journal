#!/usr/bin/env python3
import csv
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

MAX_DEALS = 500


def parse_snapshot(path: Path):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle, delimiter="\t"))
    if not rows:
        return None, []

    first = rows[0]
    account = {
        "login": first["login"],
        "server": first["server"],
        "currency": first["currency"],
    }
    deals = []
    for row in rows:
        if any(row[key] != account[key] for key in account):
            raise ValueError("MT5 snapshot contains more than one account")
        deal = {
            "ticket": row["ticket"],
            "positionId": row["position_id"],
            "order": int(row["order"]),
            "symbol": row["symbol"],
            "side": row["side"],
            "quantity": float(row["quantity"]),
            "price": float(row["price"]),
            "fee": float(row["fee"]),
            "executedAt": row["executed_at"],
        }
        if row["reported_gross_pnl"]:
            deal["reportedGrossPnl"] = float(row["reported_gross_pnl"])
        deals.append(deal)
    return account, deals


def post(url: str, token: str, account: dict, deals: list[dict]):
    body = json.dumps({"account": account, "deals": deals}).encode()
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)


def main():
    path = Path(os.environ["MT5_EXPORT_FILE"])
    url = os.environ.get("MT5_API_URL", "http://journal:3000/api/mt5/executions")
    token = os.environ.get("MT5_INGEST_TOKEN", "")
    if len(token) < 32:
        raise SystemExit("MT5_INGEST_TOKEN must contain at least 32 characters")

    previous_signature = None
    account_key = None
    uploaded_tickets = set()
    while True:
        try:
            if path.exists():
                signature = (path.stat().st_mtime_ns, path.stat().st_size)
                if signature != previous_signature:
                    account, deals = parse_snapshot(path)
                    if account:
                        next_key = (account["server"], account["login"])
                        if next_key != account_key:
                            account_key = next_key
                            uploaded_tickets.clear()
                        pending = [deal for deal in deals if deal["ticket"] not in uploaded_tickets]
                        account_id = None
                        for offset in range(0, len(pending), MAX_DEALS):
                            result = post(url, token, account, pending[offset : offset + MAX_DEALS])
                            account_id = result["accountId"]
                        uploaded_tickets.update(deal["ticket"] for deal in deals)
                        if pending:
                            print(
                                f"Synced {len(pending)} MT5 deals to journal account {account_id}.",
                                flush=True,
                            )
                    previous_signature = signature
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace")
            print(f"MT5 sync HTTP {error.code}: {detail}", flush=True)
        except Exception as error:
            print(f"MT5 sync failed: {error}", flush=True)
        time.sleep(5)


if __name__ == "__main__":
    main()
