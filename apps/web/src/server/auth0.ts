import { Auth0Client } from "@auth0/nextjs-auth0/server";

let client: Auth0Client | undefined;
export function getAuth0(): Auth0Client {
  for (const name of [
    "AUTH0_DOMAIN",
    "AUTH0_CLIENT_ID",
    "AUTH0_CLIENT_SECRET",
    "AUTH0_SECRET",
    "APP_BASE_URL",
  ]) {
    if (!process.env[name]) throw new Error(`Missing required Auth0 configuration: ${name}`);
  }
  return (client ??= new Auth0Client({ enableAccessTokenEndpoint: false }));
}
