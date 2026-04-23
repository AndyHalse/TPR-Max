import OpenAI from "openai";
import { OpenAIErrorHandler } from "./utils/openaiErrorHandler";

// Using javascript_openai blueprint
// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateCompanyDescription(website: string, companyName: string, industry?: string): Promise<{ 
  description: string; 
  success: boolean; 
  error?: string; 
}> {
  try {
    if (!website) {
      return {
        description: '',
        success: false,
        error: 'Website URL is required'
      };
    }

    // Auto-add https:// if not present
    let formattedWebsite = website.trim();
    if (!formattedWebsite.startsWith('http://') && !formattedWebsite.startsWith('https://')) {
      formattedWebsite = `https://${formattedWebsite}`;
    }

    // Create a focused prompt for company description generation
    const industryContext = industry ? ` in the ${industry} industry` : '';
    const prompt = `Based on the company name "${companyName}" and their website "${formattedWebsite}"${industryContext}, generate a professional company description (2-3 sentences maximum) that would be suitable for a visitor management system. Focus on their main services, expertise, and what makes them professional contractors. Keep it concise and professional. Return only the description text, no formatting or extra content.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4", // Using gpt-4 as a reliable model for text generation
      messages: [
        {
          role: "system",
          content: "You are a professional business analyst who writes concise, professional company descriptions for contractor management systems. Focus on services, expertise, and professionalism. Return only the description text, no additional formatting."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_completion_tokens: 150
    });

    const description = response.choices[0].message.content?.trim() || '';
    console.log('OpenAI response:', description);
    
    if (!description || description === '') {
      throw new Error('No description generated - empty response');
    }

    return {
      description: description,
      success: true
    };

  } catch (error) {
    const errorResult = OpenAIErrorHandler.handleError(error);
    OpenAIErrorHandler.logError(error, 'generateCompanyDescription');
    
    // Provide a basic fallback description when AI fails
    const fallbackDescription = generateFallbackDescription(companyName, industry);
    
    return {
      description: fallbackDescription,
      success: false,
      error: errorResult.userMessage
    };
  }
}

/**
 * Generate a basic fallback description when AI service is unavailable
 */
function generateFallbackDescription(companyName: string, industry?: string): string {
  if (!companyName) {
    return 'Professional contractor providing specialized services.';
  }

  const industryDescriptions: Record<string, string> = {
    'construction': 'construction and building services',
    'electrical': 'electrical installation and maintenance services',
    'plumbing': 'plumbing and heating services',
    'roofing': 'roofing and exterior building services',
    'hvac': 'heating, ventilation, and air conditioning services',
    'security': 'security and surveillance services',
    'cleaning': 'professional cleaning and maintenance services',
    'landscaping': 'landscaping and groundskeeping services',
    'technology': 'technology and IT services',
    'consulting': 'professional consulting services'
  };

  const industryKey = industry?.toLowerCase() || '';
  const serviceDescription = industryDescriptions[industryKey] || 'professional contractor services';

  return `${companyName} is a professional contractor specializing in ${serviceDescription}. The company provides reliable, high-quality solutions to meet client requirements and maintain industry standards.`;
}

export interface ScannedDocumentFields {
  expiryDate: string | null;
  issuedBy: string | null;
  policyNumber: string | null;
}

/**
 * Scan a contractor document (image or PDF text) and extract key fields using GPT-4o.
 * For images supply base64 + mimeType. For PDFs supply the extracted text as `pdfText`.
 */
export async function scanDocumentWithAI(params: {
  mimeType: string;
  base64Data?: string;
  pdfText?: string;
  documentType: string;
}): Promise<{ fields: ScannedDocumentFields; success: boolean; error?: string }> {
  const { mimeType, base64Data, pdfText, documentType } = params;

  const systemPrompt = `You are a document data-extraction assistant. Extract the following fields from the provided contractor compliance document and return ONLY valid JSON. If a field is not present, return null for that field.

Fields to extract:
- expiryDate: The document expiry/valid-to date in ISO format YYYY-MM-DD (e.g. "2027-03-31"). Look for words like "expiry", "valid to", "expires", "valid until", "renewal date".
- issuedBy: The name of the insurer, issuing authority, or certificate body (e.g. "Zurich Insurance", "CSCS", "CITB").
- policyNumber: The policy number, certificate number, or reference number (e.g. "PL-2024-001234", "PLI-2026-BRC-00441").

Return format (JSON only, no markdown, no explanation):
{"expiryDate": "YYYY-MM-DD or null", "issuedBy": "string or null", "policyNumber": "string or null"}`;

  try {
    let responseContent: string | null = null;

    if (pdfText) {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Document type: ${documentType}\n\nExtracted document text:\n${pdfText.slice(0, 8000)}` }
        ],
        max_completion_tokens: 200,
        response_format: { type: "json_object" },
      });
      responseContent = response.choices[0].message.content;
    } else if (base64Data) {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: `Document type: ${documentType}. Please extract the fields.` },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}`, detail: "high" } }
            ]
          }
        ],
        max_completion_tokens: 200,
        response_format: { type: "json_object" },
      });
      responseContent = response.choices[0].message.content;
    } else {
      return { fields: { expiryDate: null, issuedBy: null, policyNumber: null }, success: false, error: "No document content provided" };
    }

    if (!responseContent) {
      return { fields: { expiryDate: null, issuedBy: null, policyNumber: null }, success: false, error: "Empty response from AI" };
    }

    const parsed = JSON.parse(responseContent);
    return {
      fields: {
        expiryDate: parsed.expiryDate || null,
        issuedBy: parsed.issuedBy || null,
        policyNumber: parsed.policyNumber || null,
      },
      success: true,
    };
  } catch (error) {
    OpenAIErrorHandler.logError(error, 'scanDocumentWithAI');
    const errResult = OpenAIErrorHandler.handleError(error);
    return { fields: { expiryDate: null, issuedBy: null, policyNumber: null }, success: false, error: errResult.userMessage };
  }
}