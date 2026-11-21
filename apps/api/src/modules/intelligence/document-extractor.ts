import pdfParse from "pdf-parse";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mammoth from "mammoth";
import { HttpError } from "../../common/http-error.js";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const OCR_MAX_PAGES = 10;

export function shouldUseOcr(mimeType: string, text: string) {
  return mimeType === "application/pdf" && text.replace(/\s/g, "").length < 100;
}

function runOcrCommand(command: string, args: string[], timeout: number) {
  return new Promise<string>((resolve, reject) => {
    execFile(command, args, { timeout, maxBuffer: 2 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

async function extractPdfOcr(buffer: Buffer) {
  const directory = await mkdtemp(join(tmpdir(), "contractsphere-ocr-"));
  const source = join(directory, "source.pdf");
  const prefix = join(directory, "page");
  try {
    await writeFile(source, buffer, { mode: 0o600 });
    await runOcrCommand("pdftoppm", ["-f", "1", "-l", String(OCR_MAX_PAGES), "-r", "160", "-png", source, prefix], 60000);
    const pages = (await readdir(directory))
      .filter(name => /^page-\d+\.png$/.test(name))
      .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
    if (!pages.length) throw new Error("PDF renderer produced no page images.");
    const chunks: string[] = [];
    for (const page of pages) {
      const imagePath = join(directory, page);
      chunks.push(await runOcrCommand("tesseract", [imagePath, "stdout", "-l", "eng", "--psm", "3"], 45000));
    }
    return chunks.join("\n\n");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new HttpError(503, "Scanned PDF OCR is unavailable. Install Poppler (pdftoppm) and Tesseract OCR on the API host.", "DOCUMENT_OCR_UNAVAILABLE");
    }
    if (error && typeof error === "object" && "killed" in error && error.killed) {
      throw new HttpError(422, "Scanned PDF OCR exceeded its processing time limit.", "DOCUMENT_OCR_TIMEOUT");
    }
    throw new HttpError(422, "The scanned PDF could not be rendered or recognized by OCR.", "DOCUMENT_OCR_FAILED");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function extractDocumentText(buffer: Buffer, mimeType: string): Promise<string> {
  if (!buffer.length || buffer.length > MAX_DOCUMENT_BYTES) {
    throw new HttpError(413, "The document must be between 1 byte and 10 MB.", "DOCUMENT_TOO_LARGE");
  }
  let text = "";
  try {
    if (mimeType === "application/pdf") {
      const parsed = await pdfParse(buffer, { max: 50 });
      text = parsed.text;
    } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const parsed = await mammoth.extractRawText({ buffer });
      text = parsed.value;
    } else {
      throw new HttpError(415, "Only PDF and DOCX files can be analyzed.", "UNSUPPORTED_DOCUMENT_TYPE");
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(422, "The document could not be parsed. It may be encrypted, damaged, or unsupported.", "DOCUMENT_PARSE_FAILED");
  }

  const normalize = (value: string) => value.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  let normalized = normalize(text);
  if (shouldUseOcr(mimeType, normalized)) normalized = normalize(await extractPdfOcr(buffer));
  if (normalized.length < 100) {
    throw new HttpError(422, "The document contains too little readable text after extraction and OCR.", "DOCUMENT_TEXT_UNAVAILABLE");
  }
  if (normalized.length > 30000) {
    throw new HttpError(413, "Extracted text exceeds the 30,000-character analysis limit.", "DOCUMENT_TEXT_TOO_LONG");
  }
  return normalized;
}
