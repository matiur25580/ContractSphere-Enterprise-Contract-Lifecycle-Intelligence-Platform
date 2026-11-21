import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { HttpError } from "../../common/http-error.js";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export async function extractDocumentText(buffer: Buffer, mimeType: string): Promise<string> {
  if (!buffer.length || buffer.length > MAX_DOCUMENT_BYTES) throw new HttpError(413, "The document must be between 1 byte and 10 MB.", "DOCUMENT_TOO_LARGE");
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
    throw new HttpError(422, "The document could not be parsed. It may be encrypted, damaged, image-only, or unsupported.", "DOCUMENT_PARSE_FAILED");
  }
  const normalized = text.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (normalized.length < 100) throw new HttpError(422, "The document contains too little extractable text. Scanned/image-only PDFs require OCR, which is not enabled.", "DOCUMENT_TEXT_UNAVAILABLE");
  if (normalized.length > 30000) throw new HttpError(413, "Extracted text exceeds the 30,000-character analysis limit.", "DOCUMENT_TEXT_TOO_LONG");
  return normalized;
}
