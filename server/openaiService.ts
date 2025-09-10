import OpenAI from "openai";

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
    const prompt = `Based on the company name "${companyName}" and their website "${formattedWebsite}"${industryContext}, generate a professional company description (2-3 sentences maximum) that would be suitable for a visitor management system. Focus on their main services, expertise, and what makes them professional contractors. Keep it concise and professional. Respond with JSON in this format: { "description": "your generated description here" }`;

    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025
      messages: [
        {
          role: "system",
          content: "You are a professional business analyst who writes concise, professional company descriptions for contractor management systems. Focus on services, expertise, and professionalism."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 150
    });

    console.log('OpenAI response:', response.choices[0].message.content);
    const result = JSON.parse(response.choices[0].message.content || '{}');
    console.log('Parsed result:', result);
    
    if (!result.description || result.description.trim() === '') {
      console.log('No description in result, trying alternative fields:', Object.keys(result));
      // Try alternative field names that GPT might use
      const description = result.description || result.company_description || result.summary || result.text || '';
      if (description && description.trim() !== '') {
        return {
          description: description.trim(),
          success: true
        };
      }
      throw new Error('No description generated - response was: ' + JSON.stringify(result));
    }

    return {
      description: result.description.trim(),
      success: true
    };

  } catch (error) {
    console.error('Error generating company description:', error);
    return {
      description: '',
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate description'
    };
  }
}