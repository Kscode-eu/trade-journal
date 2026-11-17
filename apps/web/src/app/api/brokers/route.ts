import { listBrokers } from "@/server/brokers";
import { handler, ok } from "@/server/api";

/** SDK and journal-native broker connections. */
export const GET = handler(() => ok({ brokers: listBrokers() }));
