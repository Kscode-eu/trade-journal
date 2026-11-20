/** Partial Auth0 configuration must never silently expose the local journal. */
export const auth0Enabled = (): boolean =>
  process.env.JOURNAL_AUTH === "auth0" ||
  Boolean(
    process.env.AUTH0_DOMAIN ||
    process.env.AUTH0_CLIENT_ID ||
    process.env.AUTH0_CLIENT_SECRET ||
    process.env.AUTH0_SECRET,
  );
