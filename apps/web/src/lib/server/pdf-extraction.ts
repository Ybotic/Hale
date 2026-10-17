import "server-only";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type ExtractedPdf = { text: string; pages: Array<{ page: number; dataUrl: string }>; totalPages: number; unrenderedImagePages: number };

export class PdfExtractionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "PdfExtractionError";
  }
}

function pythonExecutable() {
  const configured = process.env.PYMUPDF_PYTHON || process.env.LOCAL_WHISPER_PYTHON;
  if (configured) return configured;
  const projectPythons = [resolve(process.cwd(), ".venv/bin/python"), resolve(process.cwd(), "../../.venv/bin/python")];
  return projectPythons.find((candidate) => existsSync(candidate)) ?? "python3";
}

export async function extractPdfText(pdf: Uint8Array): Promise<ExtractedPdf> {
  const python = pythonExecutable();
  const script = fileURLToPath(new URL("../../../scripts/extract_medication_pdf.py", import.meta.url));
  return await new Promise((resolveResult, reject) => {
    const child = spawn(/*turbopackIgnore: true*/ python, [script], { stdio: ["pipe", "pipe", "pipe"] });
    const output: Buffer[] = [];
    let outputBytes = 0;
    const timeout = setTimeout(() => child.kill("SIGKILL"), 90_000);
    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > 12_000_000) child.kill("SIGKILL");
      else output.push(chunk);
    });
    child.stderr.on("data", () => {});
    child.on("error", () => {
      clearTimeout(timeout);
      reject(new PdfExtractionError("pymupdf_unavailable", "PyMuPDF is not installed in the configured Python environment."));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (signal === "SIGKILL") { reject(new PdfExtractionError("pdf_extract_timeout", "PDF extraction took too long.")); return; }
      if (code !== 0) { reject(new PdfExtractionError("pdf_extract_failed", "PyMuPDF could not read this PDF. Check the file or split large documents.")); return; }
      try {
        const parsed = JSON.parse(Buffer.concat(output).toString("utf8")) as ExtractedPdf;
        if (typeof parsed.text !== "string" || !Array.isArray(parsed.pages) || !Number.isInteger(parsed.totalPages) || !Number.isInteger(parsed.unrenderedImagePages)) throw new Error("invalid_result");
        resolveResult(parsed);
      } catch { reject(new PdfExtractionError("pdf_extract_invalid", "PyMuPDF returned an invalid extraction result.")); }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(Buffer.from(pdf));
  });
}
