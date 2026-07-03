/**
 * useNotesExtraction - handles multiple notes file uploads, Google Docs link
 * fetching, and manual text. Assembles a single traceable notes string to pass
 * to evaluate().
 */
import { useCallback, useRef, useState } from "react";
import { type backendInterface } from "../backend";
import {
  canExtractInBrowser,
  extractTextInBrowser,
} from "../lib/clientFileText";
import { useBackendActor } from "./useBackendActor";
import type { FileUploadStatus } from "./useFileExtraction";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ACTOR_READY_TIMEOUT_MS = 15_000;
const ACTOR_POLL_MS = 250;
const GDOC_RE = /^https?:\/\/docs\.google\.com\//i;

export interface NotesFileEntry {
  id: string;
  file: File;
  text: string;
  status: FileUploadStatus;
  error: string;
}

export interface NotesState {
  files: NotesFileEntry[];
  /** Combined text extracted from all note files */
  fileText: string;
  /** Manual/pasted text or Google Docs URL */
  manualText: string;
  /** Text fetched from Google Docs */
  fetchedDocText: string;
  /** Combined: all fileText + manualText (non-URL) + fetchedDocText */
  combinedText: string;
  /** Aggregate status used by the submit button */
  fileStatus: FileUploadStatus;
  /** Aggregate file error used for backward-compatible callers */
  fileError: string;
  /** Whether a Google Docs URL is currently detected in manualText */
  hasGoogleDocUrl: boolean;
  docFetchStatus: "idle" | "fetching" | "done" | "error";
  docFetchError: string;
}

export interface UseNotesExtraction {
  notesState: NotesState;
  handleNotesFileSelect: (files: File[]) => Promise<void>;
  retryNotesFile: (id: string) => Promise<void>;
  clearNotesFile: (id: string) => void;
  clearNotes: () => void;
  setManualText: (text: string) => void;
  fetchGoogleDoc: () => Promise<void>;
}

function normalizeText(raw: string): string {
  return raw
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 20000);
}

function fileTextFromEntries(files: NotesFileEntry[]): string {
  return files
    .filter((entry) => entry.status === "ready" && entry.text.trim())
    .map(
      (entry) =>
        `[Notes attachment: ${entry.file.name}]\n${entry.text.trim()}`,
    )
    .join("\n\n");
}

function aggregateStatus(files: NotesFileEntry[]): FileUploadStatus {
  if (files.some((entry) => entry.status === "uploading")) return "uploading";
  if (files.some((entry) => entry.status === "processing")) return "processing";
  if (files.some((entry) => entry.status === "ready")) return "ready";
  if (files.some((entry) => entry.status === "error")) return "error";
  return "idle";
}

function aggregateError(files: NotesFileEntry[]): string {
  return files.find((entry) => entry.status === "error")?.error ?? "";
}

function buildCombined(
  fileText: string,
  manualText: string,
  fetchedDocText: string,
): string {
  const isGdocUrl = GDOC_RE.test(manualText.trim());
  const manualPart = isGdocUrl
    ? fetchedDocText.trim()
      ? ""
      : manualText
    : manualText;

  return [fileText, manualPart, fetchedDocText]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n");
}

function recalcState(
  state: NotesState,
  files: NotesFileEntry[],
): NotesState {
  const fileText = fileTextFromEntries(files);
  return {
    ...state,
    files,
    fileText,
    fileStatus: aggregateStatus(files),
    fileError: aggregateError(files),
    combinedText: buildCombined(
      fileText,
      state.manualText,
      state.fetchedDocText,
    ),
  };
}

async function waitForActorReady(
  actorRef: React.MutableRefObject<
    backendInterface | null | undefined
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

const INITIAL_STATE: NotesState = {
  files: [],
  fileText: "",
  manualText: "",
  fetchedDocText: "",
  combinedText: "",
  fileStatus: "idle",
  fileError: "",
  hasGoogleDocUrl: false,
  docFetchStatus: "idle",
  docFetchError: "",
};

export function useNotesExtraction(): UseNotesExtraction {
  const { actor, isFetching } = useBackendActor();
  const actorRef = useRef(actor);
  const isFetchingRef = useRef(isFetching);
  actorRef.current = actor;
  isFetchingRef.current = isFetching;

  const [state, setState] = useState<NotesState>(INITIAL_STATE);
  const lastFetchedUrlRef = useRef<string>("");
  const idCounterRef = useRef(0);

  const updateEntry = useCallback(
    (id: string, patch: Partial<NotesFileEntry>) => {
      setState((s) => {
        const files = s.files.map((entry) =>
          entry.id === id ? { ...entry, ...patch } : entry,
        );
        return recalcState(s, files);
      });
    },
    [],
  );

  const doExtractFile = useCallback(
    async (id: string, file: File) => {
      if (file.size > MAX_SIZE) {
        updateEntry(id, {
          status: "error",
          error: "File is too large (max 10 MB).",
          text: "",
        });
        return;
      }

      updateEntry(id, { status: "processing", error: "", text: "" });

      if (canExtractInBrowser(file.name)) {
        try {
          const text = await extractTextInBrowser(file);
          const normalized = normalizeText(text);
          updateEntry(id, {
            status: normalized ? "ready" : "error",
            error: normalized
              ? ""
              : "File appears empty or contains scanned/non-selectable text.",
            text: normalized,
          });
          return;
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : "Could not extract text in the browser.";
          if (file.size > 1_800_000) {
            updateEntry(id, {
              status: "error",
              error: `${msg} The file is too large for backend extraction.`,
              text: "",
            });
            return;
          }
        }
      }

      const ready = await waitForActorReady(actorRef, isFetchingRef);
      if (!ready || !actorRef.current) {
        updateEntry(id, {
          status: "error",
          error: "Backend connection timed out. Please try again.",
          text: "",
        });
        return;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const result = await actorRef.current.extractNotesFileText(
          new Uint8Array(arrayBuffer),
          file.name,
        );

        if (result.__kind__ === "err") {
          updateEntry(id, {
            status: "error",
            error: result.err || "Could not extract text from file.",
            text: "",
          });
          return;
        }

        const normalized = normalizeText(result.ok.text);
        updateEntry(id, {
          status: normalized ? "ready" : "error",
          error: normalized ? "" : "File appears empty.",
          text: normalized,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not read file.";
        updateEntry(id, { status: "error", error: msg, text: "" });
      }
    },
    [updateEntry],
  );

  const handleNotesFileSelect = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      const entries = files.map((file) => ({
        id: `notes-${++idCounterRef.current}`,
        file,
        text: "",
        status: "uploading" as FileUploadStatus,
        error: "",
      }));

      setState((s) => recalcState(s, [...s.files, ...entries]));
      await new Promise<void>((r) => setTimeout(r, 120));

      await Promise.all(
        entries.map((entry) => doExtractFile(entry.id, entry.file)),
      );
    },
    [doExtractFile],
  );

  const retryNotesFile = useCallback(
    async (id: string) => {
      const entry = state.files.find((item) => item.id === id);
      if (entry) await doExtractFile(entry.id, entry.file);
    },
    [doExtractFile, state.files],
  );

  const clearNotesFile = useCallback((id: string) => {
    setState((s) => recalcState(s, s.files.filter((entry) => entry.id !== id)));
  }, []);

  const setManualText = useCallback((text: string) => {
    setState((s) => {
      const hasGoogleDocUrl = GDOC_RE.test(text.trim());
      const urlChanged =
        hasGoogleDocUrl && text.trim() !== lastFetchedUrlRef.current;
      const fetchedDocText =
        !hasGoogleDocUrl || urlChanged ? "" : s.fetchedDocText;
      return {
        ...s,
        manualText: text,
        hasGoogleDocUrl,
        docFetchStatus:
          !hasGoogleDocUrl || urlChanged ? "idle" : s.docFetchStatus,
        docFetchError: !hasGoogleDocUrl || urlChanged ? "" : s.docFetchError,
        fetchedDocText,
        combinedText: buildCombined(s.fileText, text, fetchedDocText),
      };
    });
  }, []);

  const fetchGoogleDoc = useCallback(async () => {
    const url = state.manualText.trim();
    if (!GDOC_RE.test(url)) return;

    setState((s) => ({
      ...s,
      docFetchStatus: "fetching",
      docFetchError: "",
    }));

    const ready = await waitForActorReady(actorRef, isFetchingRef);
    if (!ready || !actorRef.current) {
      setState((s) => ({
        ...s,
        docFetchStatus: "error",
        docFetchError: "Backend not ready. Please try again.",
      }));
      return;
    }

    try {
      const result = await actorRef.current.fetchGoogleDocText(url);
      if (result.__kind__ === "err") {
        setState((s) => ({
          ...s,
          docFetchStatus: "error",
          docFetchError: result.err || "Could not fetch Google Doc.",
          fetchedDocText: "",
          combinedText: buildCombined(s.fileText, s.manualText, ""),
        }));
        return;
      }

      const fetchedDocText = normalizeText(result.ok.text);
      lastFetchedUrlRef.current = url;
      setState((s) => ({
        ...s,
        docFetchStatus: "done",
        docFetchError: "",
        fetchedDocText,
        combinedText: buildCombined(s.fileText, s.manualText, fetchedDocText),
      }));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not fetch Google Doc.";
      setState((s) => ({
        ...s,
        docFetchStatus: "error",
        docFetchError: msg,
        fetchedDocText: "",
        combinedText: buildCombined(s.fileText, s.manualText, ""),
      }));
    }
  }, [state.manualText]);

  const clearNotes = useCallback(() => {
    lastFetchedUrlRef.current = "";
    setState(INITIAL_STATE);
  }, []);

  return {
    notesState: state,
    handleNotesFileSelect,
    retryNotesFile,
    clearNotesFile,
    clearNotes,
    setManualText,
    fetchGoogleDoc,
  };
}
