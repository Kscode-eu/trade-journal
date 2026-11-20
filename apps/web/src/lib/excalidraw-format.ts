export const EXCALIDRAW_MIME = "application/vnd.excalidraw+json";

/** Accept scene JSON, never arbitrary JSON or executable image formats. */
export function isExcalidrawScene(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const scene = value as Record<string, unknown>;
  return (
    scene.type === "excalidraw" &&
    scene.version === 2 &&
    Array.isArray(scene.elements) &&
    scene.elements.every(
      (element) =>
        element &&
        typeof element === "object" &&
        typeof element.id === "string" &&
        typeof element.type === "string" &&
        Number.isFinite(element.x) &&
        Number.isFinite(element.y),
    ) &&
    (scene.appState === undefined ||
      (!!scene.appState && typeof scene.appState === "object" && !Array.isArray(scene.appState))) &&
    (scene.files === undefined ||
      (!!scene.files && typeof scene.files === "object" && !Array.isArray(scene.files)))
  );
}
