import Anthropic from "@anthropic-ai/sdk";
import { logger } from './utils/logger';

export interface ScannedDocumentFields {
  expiryDate: string | null;
  issuedBy: string | null;
  policyNumber: string | null;
}

const SYSTEM_PROMPT = `You are a document data-extraction assistant. Extract the following fields from the provided contractor compliance document and return ONLY valid JSON. If a field is not present, return null for that field.

Fields to extract:
- expiryDate: The document expiry/valid-to date in ISO format YYYY-MM-DD (e.g. "2027-03-31"). Look for words like "expiry", "valid to", "expires", "valid until", "renewal date".
- issuedBy: The name of the insurer, issuing authority, or certificate body (e.g. "Zurich Insurance", "CSCS", "CITB").
- policyNumber: The policy number, certificate number, or reference number (e.g. "PL-2024-001234", "PLI-2026-BRC-00441").

Return format (JSON only, no markdown, no explanation):
{"expiryDate": "YYYY-MM-DD or null", "issuedBy": "string or null", "policyNumber": "string or null"}`;

/**
 * Scan a contractor document using Claude claude-3-5-sonnet.
 * Accepts either extracted PDF text or a base64 image.
 * Requires a customer-supplied Anthropic API key.
 */
export async function scanDocumentWithClaude(params: {
  mimeType: string;
  base64Data?: string;
  pdfText?: string;
  documentType: string;
  apiKey: string;
}): Promise<{ fields: ScannedDocumentFields; success: boolean; error?: string }> {
  const { mimeType, base64Data, pdfText, documentType, apiKey } = params;
  const empty = { expiryDate: null, issuedBy: null, policyNumber: null };

  try {
    const anthropic = new Anthropic({ apiKey });

    let responseContent: string | null = null;

    if (pdfText) {
      const message = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Document type: ${documentType}\n\nExtracted document text:\n${pdfText.slice(0, 8000)}`,
          },
        ],
      });
      responseContent = message.content[0]?.type === "text" ? message.content[0].text : null;
    } else if (base64Data) {
      const supportedImageMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
      type SupportedMime = (typeof supportedImageMimes)[number];
      const claudeMime: SupportedMime = supportedImageMimes.includes(mimeType as SupportedMime)
        ? (mimeType as SupportedMime)
        : "image/jpeg";

      const message = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `Document type: ${documentType}. Please extract the fields.` },
              { type: "image", source: { type: "base64", media_type: claudeMime, data: base64Data } },
            ],
          },
        ],
      });
      responseContent = message.content[0]?.type === "text" ? message.content[0].text : null;
    } else {
      return { fields: empty, success: false, error: "No document content provided" };
    }

    if (!responseContent) {
      return { fields: empty, success: false, error: "Empty response from Claude" };
    }

    // Strip any markdown code fences Claude might add despite the instruction
    const cleaned = responseContent.replace(/```json?\s*/gi, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      fields: {
        expiryDate: parsed.expiryDate || null,
        issuedBy: parsed.issuedBy || null,
        policyNumber: parsed.policyNumber || null,
      },
      success: true,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("❌ claudeService.scanDocumentWithClaude error:", msg);
    return { fields: empty, success: false, error: `Claude extraction failed: ${msg}` };
  }
}
