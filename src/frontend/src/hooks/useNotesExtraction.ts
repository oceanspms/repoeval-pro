/**
 * useNotesExtraction — handles notes file upload (any format), Google Docs
 * link fetching, and manual text. Assembles a single combined notes string
 * to pass to evaluate().
 */
import { useCallback, useRef, useState } from "react";
import { type backendInterface } from "../backend";
import { useBackendActor } from "./useBackendActor";
import type { FileUploadStatus } from "./useFileExtraction";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ACTOR_READY_TIMEOUT_MS = 15_000;
const ACTOR_POLL_MS = 250;
const GDOC_RE = /^https?:\/\/docs\.google\.com\//i;

export interface NotesState {
  /** File the user selected for notes */
  file: File | null;
  /** Text extracted from the notes file */
  fileText: string;
  /** Manual/pasted text or Google Docs URL */
  manualText: string;
  /** Text fetched from Google Docs */
  fetchedDocText: string;
  /** Combined: fileText + manualText (non-URL) + fetchedDocText */
  combinedText: string;
  fileStatus: FileUploadStatus;
  fileError: string;
  /** Whether a Google Docs URL is currently detected in manualText */
  hasGoogleDocUrl: boolean;
  docFetchStatus: "idle" | "fetching" | "done" | "error";
  docFetchError: string;
}

export interface UseNotesExtraction {
  notesState: NotesState;
  handleNotesFileSelect: (file: File) => Promise<void>;
  retryNotesFile: () => Promise<void>;
  clearNotesFile: () => void;
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

function buildCombined(
  fileText: string,
  manualText: string,
  fetchedDocText: string,
): string {
  // If the user typed a Google Docs URL and we have fetched content, use the
  // fetched content (not the raw URL). If fetch hasn't run or failed, pass the
  // raw URL through so the backend can attempt to fetch it.
  const isGdocUrl = GDOC_RE.test(manualText.trim());
  let manualPart: string;
  if (isGdocUrl) {
    // Use fetched text when available; otherwise keep the raw URL as-is
    manualPart = fetchedDocText.trim() ? "" : manualText;
  } else {
    manualPart = manualText;
  }

  const parts = [fileText, manualPart, fetchedDocText]
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.join("\n\n");
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
  file: null,
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
  const lastFileRef = useRef<File | null>(null);
  const lastFetchedUrlRef = useRef<string>("");

  const doExtractFile = useCallback(async (file: File) => {
    if (file.size > MAX_SIZE) {
      setState((s) => ({
        ...s,
        file,
        fileStatus: "error",
        fileError: "File is too large (max 10 MB).",
        fileText: "",
        combinedText: buildCombined("", s.manualText, s.fetchedDocText),
      }));
      return;
    }

    setState((s) => ({
      ...s,
      file,
      fileStatus: "processing",
      fileError: "",
      fileText: "",
      combinedText: buildCombined("", s.manualText, s.fetchedDocText),
    }));

    const ready = await waitForActorReady(actorRef, isFetchingRef);
    if (!ready || !actorRef.current) {
      setState((s) => ({
        ...s,
        fileStatus: "error",
        fileError: "Backend connection timed out. Please try again.",
        fileText: "",
        combinedText: buildCombined("", s.manualText, s.fetchedDocText),
      }));
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const fileBytes = new Uint8Array(arrayBuffer);
      const result = await actorRef.current.extractNotesFileText(
        fileBytes,
        file.name,
      );

      if (result.__kind__ === "err") {
        setState((s) => ({
          ...s,
          fileStatus: "error",
          fileError: result.err || "Could not extract text from file.",
          fileText: "",
          combinedText: buildCombined("", s.manualText, s.fetchedDocText),
        }));
        return;
      }

      // result.ok is { text: string; is_clean: boolean } — use only .text
      const normalized = normalizeText(result.ok.text);
      setState((s) => {
        const fileText = normalized;
        return {
          ...s,
          fileStatus: normalized ? "ready" : "error",
          fileError: normalized ? "" : "File appears empty.",
          fileText,
          combinedText: buildCombined(fileText, s.manualText, s.fetchedDocText),
        };
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not read file.";
      setState((s) => ({
        ...s,
        fileStatus: "error",
        fileError: msg,
        fileText: "",
        combinedText: buildCombined("", s.manualText, s.fetchedDocText),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNotesFileSelect = useCallback(
    async (file: File) => {
      lastFileRef.current = file;
      setState((s) => ({
        ...s,
        file,
        fileStatus: "uploading",
        fileError: "",
        fileText: "",
      }));
      await new Promise<void>((r) => setTimeout(r, 120));
      await doExtractFile(file);
    },
    [doExtractFile],
  );

  const retryNotesFile = useCallback(async () => {
    if (lastFileRef.current) await doExtractFile(lastFileRef.current);
  }, [doExtractFile]);

  const clearNotesFile = useCallback(() => {
    lastFileRef.current = null;
    setState((s) => {
      const fileText = "";
      return {
        ...s,
        file: null,
        fileText,
        fileStatus: "idle",
        fileError: "",
        combinedText: buildCombined(fileText, s.manualText, s.fetchedDocText),
      };
    });
  }, []);

  const setManualText = useCallback((text: string) => {
    setState((s) => {
      const hasGoogleDocUrl = GDOC_RE.test(text.trim());
      const urlChanged =
        hasGoogleDocUrl && text.trim() !== lastFetchedUrlRef.current;
      const combinedText = buildCombined(
        s.fileText,
        text,
        urlChanged ? "" : s.fetchedDocText,
      );
      return {
        ...s,
        manualText: text,
        hasGoogleDocUrl,
        // Reset fetch state when URL is removed or a different URL is entered
        docFetchStatus:
          !hasGoogleDocUrl || urlChanged ? "idle" : s.docFetchStatus,
        docFetchError: !hasGoogleDocUrl || urlChanged ? "" : s.docFetchError,
        fetchedDocText: !hasGoogleDocUrl || urlChanged ? "" : s.fetchedDocText,
        combinedText,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.manualText]);

  const clearNotes = useCallback(() => {
    lastFileRef.current = null;
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
