import { useActor } from "@caffeineai/core-infrastructure";
import { useCallback, useRef, useState } from "react";
import { createActor } from "../backend";

export type FileUploadStatus =
  | "idle"
  | "uploading"
  | "processing"
  | "ready"
  | "error";

export interface FileExtractionState {
  file: File | null;
  extractedText: string;
  isExtracting: boolean;
  status: FileUploadStatus;
  error: string;
  /** true when backend returned is_clean=false — show "Clean Text" button */
  showCleanButton: boolean;
  /** Set after automatic clean pass to inform the user */
  autoCleanNote: string;
}

export interface UseFileExtraction {
  state: FileExtractionState;
  handleFileSelect: (file: File) => Promise<void>;
  retryExtraction: () => Promise<void>;
  clearFile: () => void;
  setExtractedText: (text: string) => void;
  cleanText: () => void;
}

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
// Accept all these extensions — validate by name only, never by MIME type.
// Edge PDFs arrive as application/octet-stream so MIME checks must be skipped.
const ACCEPTED_EXTS = [
  "pdf",
  "docx",
  "doc",
  "txt",
  "md",
  "csv",
  "xls",
  "xlsx",
  "zip",
  "rar",
] as const;
type AcceptedExt = (typeof ACCEPTED_EXTS)[number];

const ACTOR_READY_TIMEOUT_MS = 15_000;
const ACTOR_POLL_MS = 250;

function normalizeText(raw: string): string {
  return raw
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 15000);
}

/** Strip non-printable/non-ASCII characters — used when is_clean=false */
function stripJunk(raw: string): string {
  return raw
    .replace(/[^\x20-\x7E\n\r\t]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Returns true if the text still has 5+ consecutive non-ASCII chars after cleaning */
function isStillJunk(text: string): boolean {
  return /[^\x20-\x7E\n\r\t]{5,}/.test(text);
}

async function waitForActorReady(
  actorRef: React.MutableRefObject<
    ReturnType<typeof createActor> | null | undefined
  >,
  isFetchingRef: React.MutableRefObject<boolean>,
): Promise<boolean> {
  const deadline = Date.now() + ACTOR_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (actorRef.current && !isFetchingRef.current) return true;
    await new Promise<void>((r) => setTimeout(r, ACTOR_POLL_MS));
  }
  return false;
}

const EMPTY_STATE: FileExtractionState = {
  file: null,
  extractedText: "",
  isExtracting: false,
  status: "idle",
  error: "",
  showCleanButton: false,
  autoCleanNote: "",
};

export function useFileExtraction(): UseFileExtraction {
  const { actor, isFetching } = useActor(createActor);

  const actorRef = useRef(actor);
  const isFetchingRef = useRef(isFetching);
  actorRef.current = actor;
  isFetchingRef.current = isFetching;

  const [state, setState] = useState<FileExtractionState>(EMPTY_STATE);

  const lastFileRef = useRef<File | null>(null);

  const doExtract = useCallback(async (file: File) => {
    if (file.size > MAX_SIZE) {
      setState((s) => ({
        ...s,
        file,
        status: "error",
        error: "File is too large (max 10 MB). Try pasting the text manually.",
        extractedText: "",
        isExtracting: false,
        showCleanButton: false,
        autoCleanNote: "",
      }));
      return;
    }

    // Validate by extension ONLY — never check MIME type.
    // Edge PDFs arrive as application/octet-stream or application/x-pdf.
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_EXTS.includes(ext as AcceptedExt)) {
      setState((s) => ({
        ...s,
        file,
        status: "error",
        error:
          "Unsupported file type. Please use PDF, DOC/DOCX, TXT/MD/CSV, XLS/XLSX, ZIP, or paste manually.",
        extractedText: "",
        isExtracting: false,
        showCleanButton: false,
        autoCleanNote: "",
      }));
      return;
    }

    setState((s) => ({
      ...s,
      file,
      status: "processing",
      isExtracting: true,
      error: "",
      extractedText: "",
      showCleanButton: false,
      autoCleanNote: "",
    }));

    const ready = await waitForActorReady(actorRef, isFetchingRef);
    if (!ready || !actorRef.current) {
      setState((s) => ({
        ...s,
        status: "error",
        isExtracting: false,
        error:
          "Backend connection timed out. Please refresh the page and try again.",
        extractedText: "",
        showCleanButton: false,
        autoCleanNote: "",
      }));
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const fileBytes = new Uint8Array(arrayBuffer);

      const result = await actorRef.current.extractFileText(
        fileBytes,
        file.name,
      );

      if (result.__kind__ === "err") {
        setState((s) => ({
          ...s,
          status: "error",
          isExtracting: false,
          error:
            result.err ||
            "Could not extract text. Try again or paste manually.",
          extractedText: "",
          showCleanButton: false,
          autoCleanNote: "",
        }));
        return;
      }

      // result.ok is { text: string; is_clean: boolean }
      const { text, is_clean } = result.ok;
      const normalized = normalizeText(text);

      if (!normalized) {
        setState((s) => ({
          ...s,
          status: "error",
          isExtracting: false,
          error:
            "File appears empty. Please paste your assignment text manually.",
          extractedText: "",
          showCleanButton: false,
          autoCleanNote: "",
        }));
        return;
      }

      // When backend signals junk characters, auto-apply clean pass immediately.
      // Still show the "Clean Text" button for manual re-runs.
      if (!is_clean) {
        const cleaned = stripJunk(normalized);
        if (!cleaned || isStillJunk(cleaned)) {
          // Even after cleaning the text is unreadable — tell the user to paste manually
          setState((s) => ({
            ...s,
            status: "error",
            isExtracting: false,
            error:
              "Could not extract clean text from this file. Please paste the assignment text manually.",
            extractedText: "",
            showCleanButton: false,
            autoCleanNote: "",
          }));
          return;
        }
        setState((s) => ({
          ...s,
          status: "ready",
          isExtracting: false,
          error: "",
          extractedText: cleaned,
          showCleanButton: true, // keep available for manual re-run
          autoCleanNote:
            "Text cleaned automatically — review before evaluating.",
        }));
      } else {
        setState((s) => ({
          ...s,
          status: "ready",
          isExtracting: false,
          error: "",
          extractedText: normalized,
          showCleanButton: false,
          autoCleanNote: "",
        }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not read file.";
      setState((s) => ({
        ...s,
        status: "error",
        isExtracting: false,
        error: `${msg} Try again or paste your assignment manually.`,
        extractedText: "",
        showCleanButton: false,
        autoCleanNote: "",
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileSelect = useCallback(
    async (file: File) => {
      lastFileRef.current = file;
      setState((s) => ({
        ...s,
        file,
        status: "uploading",
        isExtracting: false,
        error: "",
        extractedText: "",
        showCleanButton: false,
        autoCleanNote: "",
      }));
      await new Promise<void>((r) => setTimeout(r, 120));
      await doExtract(file);
    },
    [doExtract],
  );

  const retryExtraction = useCallback(async () => {
    if (lastFileRef.current) {
      await doExtract(lastFileRef.current);
    }
  }, [doExtract]);

  const clearFile = useCallback(() => {
    lastFileRef.current = null;
    setState(EMPTY_STATE);
  }, []);

  const setExtractedText = useCallback((text: string) => {
    setState((s) => ({ ...s, extractedText: text }));
  }, []);

  /** Strip non-printable characters and dismiss the clean button */
  const cleanText = useCallback(() => {
    setState((s) => ({
      ...s,
      extractedText: stripJunk(s.extractedText),
      showCleanButton: false,
      autoCleanNote: "",
    }));
  }, []);

  return {
    state,
    handleFileSelect,
    retryExtraction,
    clearFile,
    setExtractedText,
    cleanText,
  };
}
