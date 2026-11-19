/** Normalize formatting only; never guess an exchange or substitute a contract. */
export function tradingViewSymbol(symbol: string, assetClass?: string | null): string {
  const value = symbol.trim().toUpperCase();
  if (value.includes(":")) return value;
  if (assetClass === "forex" || assetClass === "crypto") {
    return value.replace(/[\s/-]/g, "");
  }
  return value;
}

export function validTradingViewSymbol(symbol: string): boolean {
  return /^[A-Z0-9][A-Z0-9._:!/-]{0,99}$/.test(symbol);
}
