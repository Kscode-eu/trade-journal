import { listBrokers as sdkBrokers } from "@luxalgo/broker-sdk";

/** Include journal-native connectors alongside the SDK integrations. */
export function listBrokers() {
  return [
    ...sdkBrokers(),
    {
      id: "saxo",
      displayName: "Saxo",
      credentials: [],
      readOnlySetup:
        "Connect securely through Saxo login. Configure SAXO_APP_KEY, SAXO_APP_SECRET and SAXO_REDIRECT_URI on the journal server first, with trading disabled. Each Saxo subaccount keeps its own currency and history. Existing connections are reauthorized without creating duplicate accounts.",
    },
  ];
}
