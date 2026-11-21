import { describe, expect, it } from "vitest";
import { verifyDocumentSignature } from "../src/modules/contracts/document-security.service.js";

function makeZip(entries: string[]) {
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  const central = entries.map(name => {
    const filename = Buffer.from(name);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(filename.length, 28);
    return Buffer.concat([header, filename]);
  });
  const centralDirectory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localHeader.length, 16);
  return Buffer.concat([localHeader, centralDirectory, end]);
}

describe("document signature verification", () => {
  it("accepts a PDF with a PDF magic header", () => {
    expect(() => verifyDocumentSignature(Buffer.from("%PDF-1.7\nbody"), "application/pdf")).not.toThrow();
  });
  it("rejects a PDF with a mismatched binary signature", () => {
    expect(() => verifyDocumentSignature(Buffer.from("MZ executable"), "application/pdf")).toThrow(/valid PDF signature/);
  });
  it("accepts a DOCX ZIP with required OOXML central-directory entries", () => {
    const payload = makeZip(["[Content_Types].xml", "word/document.xml"]);
    expect(() => verifyDocumentSignature(payload, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).not.toThrow();
  });
  it("rejects a generic ZIP renamed to DOCX", () => {
    const payload = makeZip(["readme.txt"]);
    expect(() => verifyDocumentSignature(payload, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toThrow(/valid DOCX/);
  });
});
