import { getStore } from "@netlify/blobs";
import { evaluateRepo, roleStatsFromHistory } from "./lib/evaluator.mjs";

const STORE_NAME = "repoeval-history";
let memoryHistory = [];

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function routePath(event) {
  const raw = event.path || "";
  const marker = "/.netlify/functions/api";
  if (raw.includes(marker)) return raw.slice(raw.indexOf(marker) + marker.length) || "/";
  return raw.replace(/^\/api/, "") || "/";
}

async function readBody(event) {
  if (!event.body) return {};
  const text = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  return JSON.parse(text || "{}");
}

async function historyStore() {
  try {
    const store = getStore(STORE_NAME);
    return {
      async getAll() {
        return (await store.get("records", { type: "json" })) ?? [];
      },
      async setAll(records) {
        await store.setJSON("records", records);
      },
    };
  } catch {
    return {
      async getAll() {
        return memoryHistory;
      },
      async setAll(records) {
        memoryHistory = records;
      },
    };
  }
}

async function saveRecords(records) {
  const store = await historyStore();
  await store.setAll(records);
}

async function loadRecords() {
  const store = await historyStore();
  const records = await store.getAll();
  return Array.isArray(records)
    ? records.sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
    : [];
}

function extractTextFromBase64(body) {
  if (!body.fileBytes) return "";
  const bytes = Buffer.from(body.fileBytes, "base64");
  return bytes.toString("utf8").replace(/\0/g, "").trim();
}

export async function handler(event) {
  const path = routePath(event);
  const method = event.httpMethod || "GET";

  try {
    if (method === "GET" && (path === "/" || path === "/version")) {
      return json(200, { version: "netlify-rest-v1" });
    }

    if (method === "POST" && path === "/evaluate") {
      const body = await readBody(event);
      const repoUrls = Array.isArray(body.repo_urls) ? body.repo_urls : [];
      const assignment = String(body.assignment_description ?? "").trim();
      const notes = body.optional_notes ? String(body.optional_notes) : "";
      if (!repoUrls.length || assignment.length < 10) {
        return json(400, { error: "repo_urls and assignment_description are required" });
      }

      const records = await loadRecords();
      const newRecords = [];
      for (const repoUrl of repoUrls.slice(0, 5)) {
        newRecords.push(await evaluateRepo(String(repoUrl), assignment, notes));
      }
      await saveRecords([...newRecords, ...records].slice(0, 500));
      return json(200, newRecords.map((record) => record.result));
    }

    if (method === "GET" && path === "/history") {
      return json(200, await loadRecords());
    }

    if (method === "GET" && path === "/export-history") {
      return json(200, await loadRecords());
    }

    if (method === "GET" && path === "/role-stats") {
      return json(200, roleStatsFromHistory(await loadRecords()));
    }

    if (method === "GET" && path.startsWith("/history/repo")) {
      const url = new URL(event.rawUrl || `https://local${event.path}?${event.rawQuery || ""}`);
      const repoUrl = url.searchParams.get("url") ?? "";
      return json(
        200,
        (await loadRecords()).filter((record) => record.repo_url === repoUrl),
      );
    }

    if (method === "GET" && path.startsWith("/history/")) {
      const id = decodeURIComponent(path.replace("/history/", ""));
      const found = (await loadRecords()).find((record) => record.id === id);
      return json(200, found?.result ?? null);
    }

    if (method === "DELETE" && path.startsWith("/history/")) {
      const id = decodeURIComponent(path.replace("/history/", ""));
      const records = await loadRecords();
      const next = records.filter((record) => record.id !== id);
      await saveRecords(next);
      return json(200, { deleted: next.length < records.length });
    }

    if (method === "POST" && path === "/clear-cache") {
      return json(200, { ok: true });
    }

    if (method === "GET" && path === "/cache-stats") {
      const records = await loadRecords();
      return json(200, { entries: records.length, lastHit: false });
    }

    if (method === "POST" && (path === "/extract-file" || path === "/extract-notes-file")) {
      const body = await readBody(event);
      const text = extractTextFromBase64(body);
      if (!text) return json(200, { kind: "err", err: "Could not extract text from this file. Use browser extraction or paste manually." });
      return json(200, { kind: "ok", ok: { text: text.slice(0, 20000), is_clean: true } });
    }

    if (method === "POST" && path === "/fetch-google-doc") {
      const body = await readBody(event);
      const url = String(body.url ?? "");
      if (!url.startsWith("https://docs.google.com/")) {
        return json(200, { kind: "err", err: "URL must be a Google Docs link." });
      }
      const exportUrl = url.includes("/export")
        ? url
        : `${url.split("?")[0].replace(/\/$/, "")}/export?format=txt`;
      const response = await fetch(exportUrl, { headers: { "User-Agent": "RepoEval-Pro/1.0" } });
      if (!response.ok) return json(200, { kind: "err", err: "Could not fetch Google Docs content." });
      const text = await response.text();
      return json(200, { kind: "ok", ok: { text: text.slice(0, 20000), is_clean: true } });
    }

    return json(404, { error: "Not found" });
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : "Unexpected backend error",
    });
  }
}
