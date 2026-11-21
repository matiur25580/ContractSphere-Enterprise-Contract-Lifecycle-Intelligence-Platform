import net from "node:net";
import { HttpError } from "../../common/http-error.js";
import { env } from "../../config/env.js";

export type MalwareScanResult = { clean: true } | { clean: false; signature: string };

function readZipEntryNames(buffer: Buffer): Set<string> | null {
  const lowerBound = Math.max(0, buffer.length - 65_557);
  let endRecord = -1;
  for (let offset = buffer.length - 22; offset >= lowerBound; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { endRecord = offset; break; }
  }
  if (endRecord < 0 || endRecord + 22 > buffer.length) return null;
  const entryCount = buffer.readUInt16LE(endRecord + 10);
  const directoryOffset = buffer.readUInt32LE(endRecord + 16);
  const names = new Set<string>();
  let cursor = directoryOffset;
  for (let index = 0; index < entryCount; index++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) return null;
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    if (cursor + 46 + nameLength + extraLength + commentLength > buffer.length) return null;
    names.add(buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8"));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

export function verifyDocumentSignature(buffer: Buffer, mimeType: string): void {
  if (mimeType === "application/pdf") {
    if (buffer.length < 8 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new HttpError(415, "The uploaded file does not contain a valid PDF signature.", "DOCUMENT_SIGNATURE_INVALID");
    }
    return;
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b &&
      [0x03, 0x05, 0x07].includes(buffer[2]) && [0x04, 0x06, 0x08].includes(buffer[3]);
    const entries = isZip ? readZipEntryNames(buffer) : null;
    if (!entries?.has("[Content_Types].xml") || !entries.has("word/document.xml")) {
      throw new HttpError(415, "The uploaded file is not a valid DOCX document.", "DOCUMENT_SIGNATURE_INVALID");
    }
    return;
  }
  throw new HttpError(415, "Only PDF and DOCX documents are supported.", "UNSUPPORTED_DOCUMENT_TYPE");
}

export async function scanForMalware(buffer: Buffer): Promise<MalwareScanResult> {
  if (!env.CLAMAV_HOST) {
    throw new HttpError(503, "Malware scanning is unavailable. Uploads are blocked until ClamAV is configured.", "MALWARE_SCANNER_UNAVAILABLE");
  }
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: env.CLAMAV_HOST, port: env.CLAMAV_PORT });
    let response = "";
    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new HttpError(503, message, "MALWARE_SCAN_FAILED"));
    };
    socket.setTimeout(env.CLAMAV_TIMEOUT_MS);
    socket.once("connect", () => {
      socket.write(Buffer.from("zINSTREAM\0", "ascii"));
      const chunkSize = 64 * 1024;
      for (let offset = 0; offset < buffer.length; offset += chunkSize) {
        const chunk = buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length));
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length, 0);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", chunk => {
      response += chunk.toString("utf8");
      if (response.length > 4096) return fail("Malware scanner returned an invalid response.");
      if (response.includes("\0")) {
        if (settled) return;
        settled = true;
        socket.destroy();
        const result = response.replace(/\0/g, "").trim();
        if (/\bFOUND\b/.test(result)) resolve({ clean: false, signature: result.slice(0, 200) });
        else if (/\bOK\b/.test(result)) resolve({ clean: true });
        else reject(new HttpError(503, "Malware scanner returned an indeterminate result. Upload was blocked.", "MALWARE_SCAN_FAILED"));
      }
    });
    socket.once("timeout", () => fail("Malware scan timed out. Upload was blocked."));
    socket.once("error", () => fail("Malware scanner could not be reached. Upload was blocked."));
    socket.once("close", () => { if (!settled) fail("Malware scanner closed the connection before returning a result."); });
  });
}
