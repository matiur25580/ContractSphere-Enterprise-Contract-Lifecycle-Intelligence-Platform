import { describe, expect, it } from "vitest";
import { verifyDocumentSignature } from "../src/modules/contracts/document-security.service.js";

describe("document signature verification", () => {
  it("accepts a PDF with a PDF magic header", () => {
    expect(() => verifyDocumentSignature(Buffer.from("%PDF-1.7\nbody"), "application/pdf")).not.toThrow();
  });
  it("rejects a PDF with a mismatched binary signature", () => {
    expect(() => verifyDocumentSignature(Buffer.from("MZ executable"), "application/pdf")).toThrow(/valid PDF signature/);
  });
  it("accepts a DOCX ZIP containing required OOXML entries", () => {
    const payload = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(" [Content_Types].xml word/document.xml")]);
    expect(() => verifyDocumentSignature(payload, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).not.toThrow();
  });
  it("rejects a generic ZIP renamed to DOCX", () => {
    const payload = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("not-an-office-document")]);
    expect(() => verifyDocumentSignature(payload, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toThrow(/valid DOCX/);
  });
});
