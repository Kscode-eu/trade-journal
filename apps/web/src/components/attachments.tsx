"use client";
import dynamic from "next/dynamic";
import { EXCALIDRAW_MIME } from "@/lib/excalidraw-format";
import { HoverHint } from "./ui/tooltip";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_ATTACHMENT_SIZE } from "@/lib/attachment-validation";
import { cn } from "@/lib/utils";
import { Paperclip, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { postJson, useApi } from "@/lib/use-api";
const DrawingEditor = dynamic(() => import("./drawing-editor"), { ssr: false });

export function Attachments({
  type,
  id,
}: {
  type: "trade" | "day" | "playbook" | "note" | "missed" | "prop-account" | "prop-entry";
  id: string;
}) {
  const { data, error, refresh } = useApi<{
    attachments: { id: string; name: string; mime: string; size: number }[];
  }>(`/api/attachments?type=${type}&id=${encodeURIComponent(id)}`);
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const [drawing, setDrawing] = useState<{ id: string; name: string } | "new" | null>(null);
  const [preview, setPreview] = useState<{ id: string; name: string; mime: string } | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const region = useRef<HTMLDivElement>(null);
  const uploading = useRef(false);
  const [dragging, setDragging] = useState(false);
  const upload = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      if (uploading.current) {
        setFailure("An upload is in progress. Please wait, then add your files again.");
        return;
      }
      uploading.current = true;
      setBusy(true);
      setFailure("");
      const failures: string[] = [];
      try {
        for (const file of files) {
          try {
            if (file.size > MAX_ATTACHMENT_SIZE) throw new Error("File exceeds 8 MB.");
            const body = new FormData();
            body.append("type", type);
            body.append("id", id);
            body.append("file", file);
            const response = await fetch("/api/attachments", { method: "POST", body });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Upload failed.");
          } catch (err) {
            failures.push(`${file.name}: ${err instanceof Error ? err.message : "Upload failed."}`);
          }
        }
        if (failures.length) setFailure(failures.join(" "));
      } finally {
        uploading.current = false;
        setBusy(false);
        if (input.current) input.current.value = "";
        refresh();
      }
    },
    [type, id, refresh],
  );

  useEffect(() => {
    // Each attachment list belongs to its containing note/card/dialog. Listen here
    // so its editor accepts files too, without intercepting another note's paste.
    const scope = region.current?.parentElement;
    if (!scope) return;
    let depth = 0;
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth++;
      setDragging(true);
    };
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      void upload(Array.from(event.dataTransfer?.files ?? []));
    };
    const paste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (!files.length) {
        for (const item of Array.from(event.clipboardData?.items ?? [])) {
          if (item.kind !== "file") continue;
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();
      void upload(files);
    };
    scope.addEventListener("dragenter", enter, true);
    scope.addEventListener("dragover", over, true);
    scope.addEventListener("dragleave", leave, true);
    scope.addEventListener("drop", drop, true);
    scope.addEventListener("paste", paste, true);
    return () => {
      scope.removeEventListener("dragenter", enter, true);
      scope.removeEventListener("dragover", over, true);
      scope.removeEventListener("dragleave", leave, true);
      scope.removeEventListener("drop", drop, true);
      scope.removeEventListener("paste", paste, true);
    };
  }, [upload]);
  return (
    <div
      ref={region}
      role="region"
      aria-label="Attachments: drop files or paste images here"
      aria-busy={busy}
      tabIndex={0}
      className={cn(
        "space-y-3 rounded-md border border-dashed p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        dragging && "border-primary bg-primary/10 ring-2 ring-primary",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Paperclip />
          {busy ? "Uploading…" : "Add attachment"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setDrawing("new")}
        >
          <Pencil />
          Add drawing
        </Button>
        <span className="text-xs text-muted-foreground">
          {dragging
            ? "Drop files to attach"
            : "Drop files here or paste an image into your note or this area"}
          <span className="block">PNG, JPEG, WebP, PDF or Excalidraw · up to 8 MB each</span>
        </span>
      </div>
      <input
        ref={input}
        aria-label="Upload attachment"
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf,.excalidraw"
        className="hidden"
        multiple
        onChange={(event) => void upload(Array.from(event.target.files ?? []))}
      />
      {(failure || error) && (
        <p role="alert" className="text-xs text-destructive">
          {failure || error}
        </p>
      )}
      {drawing && (
        <DrawingEditor
          type={type}
          ownerId={id}
          attachment={drawing === "new" ? undefined : drawing}
          onClose={() => setDrawing(null)}
          onSaved={refresh}
        />
      )}
      <Dialog
        open={!!preview}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        {preview && (
          <DialogContent
            className="flex h-[90dvh] max-w-[96vw] flex-col overflow-hidden"
            aria-describedby={undefined}
          >
            <DialogHeader>
              <DialogTitle className="break-words">{preview.name}</DialogTitle>
            </DialogHeader>
            {previewError ? (
              <p role="alert" className="text-sm text-destructive">
                Could not load this attachment. Close the preview and try again.
              </p>
            ) : preview.mime.startsWith("image/") ? (
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
                <img
                  src={`/api/attachments/${preview.id}`}
                  alt={preview.name}
                  className="max-h-full max-w-full object-contain"
                  onError={() => setPreviewError(true)}
                />
              </div>
            ) : (
              <object
                data={`/api/attachments/${preview.id}?preview=1`}
                type="application/pdf"
                aria-label={preview.name}
                className="min-h-0 w-full flex-1"
              >
                <p className="text-sm">
                  Your browser cannot display this PDF.{" "}
                  <a
                    className="underline"
                    href={`/api/attachments/${preview.id}`}
                    download={preview.name}
                  >
                    Download PDF
                  </a>
                </p>
              </object>
            )}
          </DialogContent>
        )}
      </Dialog>
      <div className="grid grid-cols-2 gap-2">
        {data?.attachments.map((a) => (
          <div key={a.id} className="min-w-0 rounded-md border p-2">
            {a.mime === EXCALIDRAW_MIME && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mb-2 w-full"
                onClick={() => setDrawing({ id: a.id, name: a.name })}
              >
                <Pencil />
                Edit drawing
              </Button>
            )}
            <HoverHint content={a.name}>
              <button
                type="button"
                aria-label={`Open ${a.name}`}
                aria-haspopup="dialog"
                onClick={() => {
                  if (a.mime === EXCALIDRAW_MIME) setDrawing({ id: a.id, name: a.name });
                  else {
                    setPreviewError(false);
                    setPreview(a);
                  }
                }}
                className="block w-full rounded text-left focus-visible:outline focus-visible:outline-ring"
              >
                {a.mime.startsWith("image/") && (
                  <img
                    src={`/api/attachments/${a.id}`}
                    alt={a.name}
                    className="mb-2 h-28 w-full rounded object-contain"
                  />
                )}
                <span className="block truncate text-xs underline">{a.name}</span>
              </button>
            </HoverHint>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>{Math.round(a.size / 1024)} KB</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label={`Remove ${a.name}`}
                onClick={async () => {
                  if (!confirm(`Remove ${a.name}?`)) return;
                  try {
                    await postJson(`/api/attachments/${a.id}`, undefined, "DELETE");
                    refresh();
                  } catch (e) {
                    setFailure(String(e));
                  }
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
