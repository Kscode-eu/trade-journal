import { eq } from "drizzle-orm";
import { db, settings } from "@/db";
import { decryptJson, encryptJson } from "./crypto";
import { EMPTY_DEFAULTS, type JournalDefaults } from "@/lib/journal-defaults";
import { DEFAULT_CONVERSION, parseCurrencyConversion } from "@/lib/currencies";
import {
  AI_DEFAULT_MODELS,
  AI_KEY_VARIABLES,
  isAiProvider,
  type AiConnection,
  type AiProvider,
  type AiSettingsPayload,
} from "@/lib/ai-settings";

export const getJournalDefaults = async (): Promise<JournalDefaults> => {
  try {
    return { ...EMPTY_DEFAULTS, ...JSON.parse((await getSetting("journalDefaults")) ?? "{}") };
  } catch {
    return EMPTY_DEFAULTS;
  }
};

export const getSetting = async (key: string): Promise<string | null> =>
  (await db.select().from(settings).where(eq(settings.key, key)))[0]?.value ?? null;

export const setSetting = async (key: string, value: string): Promise<void> => {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
};

export const deleteSetting = async (key: string): Promise<void> => {
  await db.delete(settings).where(eq(settings.key, key));
};

export const getCurrencyConversion = async () => {
  const saved = await getSetting("currencyConversion");
  if (!saved) return DEFAULT_CONVERSION;
  // Invalid saved settings must not silently fall back to a different valuation.
  return parseCurrencyConversion(JSON.parse(saved));
};

/** Journal display timezone (IANA), default UTC. */
export const getTimeZone = async (): Promise<string> => (await getSetting("timeZone")) ?? "UTC";

/** Preserve the legacy parsing default until a separate import zone is saved. */
export const getImportTimeZone = async (): Promise<string> =>
  (await getSetting("importTimeZone")) ?? (await getTimeZone());

/** Per-symbol contract multipliers for futures/options P&L. */
export const getMultipliers = async (): Promise<Record<string, number>> => {
  const raw = await getSetting("multipliers");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
};

export const aiKeyEnvironment = (provider: AiProvider): string | null => {
  const variable = AI_KEY_VARIABLES[provider];
  return (variable && process.env[variable]?.trim()) || null;
};

/** Provider keys are stored separately and encrypted like broker credentials. */
export const getAiKey = async (provider: AiProvider): Promise<string | null> => {
  const environment = aiKeyEnvironment(provider);
  if (environment) return environment;
  const envelope = await getSetting(`${provider}KeyEnc`);
  if (!envelope) return null;
  try {
    const key = decryptJson<unknown>(envelope);
    return typeof key === "string" ? key.trim() || null : null;
  } catch {
    return null;
  }
};

export const setAiKey = async (provider: AiProvider, key: string | null): Promise<void> => {
  if (key === null) await deleteSetting(`${provider}KeyEnc`);
  else await setSetting(`${provider}KeyEnc`, encryptJson(key.trim()));
};

export const getAnthropicKey = async (): Promise<string | null> => await getAiKey("anthropic");
export const setAnthropicKey = async (key: string | null): Promise<void> =>
  await setAiKey("anthropic", key);

/** An http(s) API root without credentials, query or fragment, minus trailing slashes. */
export const normalizeAiBaseUrl = (value: string): string | null => {
  if (value.length > 2048 || /[?#]/.test(value)) return null;
  try {
    const url = new URL(value.trim());
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    return url.href.replace(/\/+$/, "");
  } catch {
    return null;
  }
};

export const getCompatibleBaseUrl = async (): Promise<string | null> =>
  await getSetting("compatibleBaseUrl");

/** A saved key belongs to the server it was entered for, so a new URL drops it. */
export const setCompatibleBaseUrl = async (url: string, keepKey: boolean): Promise<void> => {
  if (!keepKey && url !== (await getCompatibleBaseUrl())) await setAiKey("compatible", null);
  await setSetting("compatibleBaseUrl", url);
};

export const getAiProvider = async (): Promise<AiProvider> => {
  const selected = await getSetting("aiProvider");
  if (isAiProvider(selected)) return selected;
  // Preserve existing Anthropic setups; an OpenAI-only setup works without a UI visit.
  return !(await getAiKey("anthropic")) && (await getAiKey("openai")) ? "openai" : "anthropic";
};

/** Anthropic keeps the legacy "aiModel" key; other providers use "<provider>Model". */
export const aiModelSetting = (provider: AiProvider): string =>
  provider === "anthropic" ? "aiModel" : `${provider}Model`;

export const getAiModel = async (provider: AiProvider): Promise<string> =>
  (await getSetting(aiModelSetting(provider)))?.trim() || AI_DEFAULT_MODELS[provider];

/** Hosted providers need a key. A compatible server needs a URL and model; its key is optional. */
export const aiProviderConfigured = async (provider: AiProvider): Promise<boolean> =>
  provider === "compatible"
    ? Boolean((await getCompatibleBaseUrl()) && (await getAiModel(provider)))
    : (await getAiKey(provider)) !== null;

export const getAiSettings = async (): Promise<AiSettingsPayload> => {
  const aiProvider = await getAiProvider();
  const connection = async (provider: AiProvider): Promise<AiConnection> => ({
    configured: await aiProviderConfigured(provider),
    source: aiKeyEnvironment(provider)
      ? ("environment" as const)
      : (await getAiKey(provider))
        ? ("saved" as const)
        : null,
    model: await getAiModel(provider),
    baseUrl: provider === "compatible" ? await getCompatibleBaseUrl() : null,
  });
  const aiConnections = {
    anthropic: await connection("anthropic"),
    openai: await connection("openai"),
    compatible: await connection("compatible"),
  };
  return {
    aiProvider,
    aiConfigured: aiConnections[aiProvider].configured,
    aiModel: aiConnections[aiProvider].model,
    aiConnections,
  };
};
