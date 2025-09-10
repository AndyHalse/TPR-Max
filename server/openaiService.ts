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
    console.error('Error generating company description:', error);
    return {
      description: '',
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate description'
    };
  }
}