import mammoth from "mammoth";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const TEXT_EXTENSIONS = new Set(["txt", "md", "csv"]);

function extensionFor(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function canExtractInBrowser(fileName: string): boolean {
  const ext = extensionFor(fileName);
  return ext === "pdf" || ext === "docx" || TEXT_EXTENSIONS.has(ext);
}

export async function extractTextInBrowser(file: File): Promise<string> {
  const ext = extensionFor(file.name);

  if (TEXT_EXTENSIONS.has(ext)) {
    return file.text();
  }

  if (ext === "pdf") {
    const data = await file.arrayBuffer();
    const document = await pdfjs.getDocument({ data }).promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      if (pageText.trim()) pages.push(pageText);
    }

    return pages.join("\n\n");
  }

  if (ext === "docx") {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  throw new Error("Browser extraction is not available for this file type.");
}
