import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { auth0Enabled } from "@/lib/auth-mode";

const identity = new AsyncLocalStorage<string>();
export const withJournalUser = <T>(subject: string, work: () => T): T => {
  if (!subject) throw new Error("Missing authenticated user");
  return identity.run(subject, work);
};

/** No request header, query parameter or submitted owner ID can select a tenant. */
export function journalSchema(): string | undefined {
  if (!auth0Enabled()) return undefined; // Preserve local mode and test search paths.
  const subject = identity.getStore();
  if (!subject) throw new Error("Authenticated journal context required");
  if (subject === process.env.JOURNAL_LEGACY_OWNER_SUB) return "public";
  return `user_${createHash("sha256").update(`${process.env.AUTH0_DOMAIN}\0${subject}`).digest("hex").slice(0, 56)}`;
}
