"use client";

import { useEffect, useRef, useState } from "react";
import { Excalidraw, loadFromBlob, serializeAsJSON } from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { EXCALIDRAW_MIME } from "@/lib/excalidraw-format";
import { MAX_ATTACHMENT_SIZE } from "@/lib/attachment-validation";

if (typeof window !== "undefined") Object.assign(window, { EXCALIDRAW_ASSET_PATH: "/excalidraw/" });

export default function DrawingEditor({
  type,
  ownerId,
  attachment,
  onClose,
  onSaved,
}: {
  type: string;
  ownerId: string;
  attachment?: { id: string; name: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(
    attachment?.name.replace(/\.excalidraw$/i, "") || "Setup drawing",
  );
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const [loading, setLoading] = useState(!!attachment);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const dirty = useRef(false);
  const baseline = useRef<string | null>(null);
  const originalName = useRef(name);
  const hasChanges = () => dirty.current || name !== originalName.current;
  useEffect(() => {
    if (!attachment) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/attachments/${attachment.id}`);
        if (!response.ok) throw new Error("Could not load drawing.");
        const scene = await loadFromBlob(await response.blob(), null, null);
        if (!cancelled) {
          setInitialData({ ...scene, scrollToContent: true });
          setLoading(false);
        }
      } catch (error) {
        if (!cancelled)
          setFailure(error instanceof Error ? error.message : "Could not load drawing.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachment]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (hasChanges()) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  });
  const close = () => {
    if (!busy && (!hasChanges() || confirm("Discard unsaved drawing changes?"))) onClose();
  };
  const save = async () => {
    if (!api.current || loading || busy) return;
    setBusy(true);
    setFailure("");
    try {
      const drawing = serializeAsJSON(
        api.current.getSceneElements(),
        api.current.getAppState(),
        api.current.getFiles(),
        "local",
      );
      const file = new File([drawing], `${name.trim() || "Drawing"}.excalidraw`, {
        type: EXCALIDRAW_MIME,
      });
      if (file.size > MAX_ATTACHMENT_SIZE)
        throw new Error("Drawing exceeds 8 MB. Remove some embedded images and try again.");
      const body = new FormData();
      body.append("type", type);
      body.append("id", ownerId);
      body.append("file", file);
      const response = await fetch(
        attachment ? `/api/attachments/${attachment.id}` : "/api/attachments",
        { method: attachment ? "PUT" : "POST", body },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save drawing.");
      dirty.current = false;
      onSaved();
      onClose();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not save drawing.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="left-0 top-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:p-0"
        style={{ maxHeight: "100dvh" }}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">
          {attachment ? "Edit drawing" : "New Excalidraw drawing"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Sketch your setup, then save it with this page. You can reopen it anytime.
        </DialogDescription>
        <div className="flex shrink-0 items-center gap-2 border-b p-2 pr-12">
          <Input
            aria-label="Drawing name"
            className="h-8 min-w-0 flex-1 sm:max-w-sm"
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            size="sm"
            className="shrink-0"
            disabled={busy || loading}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save drawing"}
          </Button>
        </div>
        {failure && (
          <p role="alert" className="shrink-0 px-3 py-2 text-sm text-destructive">
            {failure}
          </p>
        )}
        {loading ? (
          <p className="text-sm">
            {failure ? "Close this dialog and try again." : "Loading drawing…"}
          </p>
        ) : (
          <div className="min-h-0 w-full flex-1" inert={busy}>
            <Excalidraw
              initialData={initialData}
              excalidrawAPI={(value) => {
                api.current = value;
              }}
              validateEmbeddable={() => false}
              UIOptions={{
                canvasActions: { saveToActiveFile: false, loadScene: false, export: false },
              }}
              onChange={(elements, appState, files) => {
                const snapshot = JSON.stringify([
                  elements.map((element) => [element.id, element.version, element.isDeleted]),
                  Object.keys(files),
                  appState.viewBackgroundColor,
                ]);
                if (baseline.current === null) baseline.current = snapshot;
                dirty.current = snapshot !== baseline.current;
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
