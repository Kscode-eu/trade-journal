import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const source = join(dirname(require.resolve("@excalidraw/excalidraw")), "fonts");
const target = new URL("../public/excalidraw/fonts/", import.meta.url);
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
