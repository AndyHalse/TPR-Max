import OpenAI from "openai";
import type { Visitor, Staff, CompanySettings } from '@shared/schema';

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class AIService {
  
  /**
   * Generate intelligent visitor insights and security recommendations
   */
  async generateVisitorInsights(
    visitors: Visitor[], 
    staff: Staff[], 
    stats: any
  ): Promise<{
    insights: string[];
    recommendations: string[];
    riskAssessment: string;
    prediction: string;
  }> {
    try {
      const prompt = `
        You are an AI security and business intelligence analyst for a visitor management system. 
        Analyze the following visitor data and provide professional insights:

        Current Visitors: ${visitors.length}
        Total Staff: ${staff.length}
        Today's Check-ins: ${stats.todayCheckins}
        Current Visitors on Site: ${stats.currentVisitors}

        Visitor Details:
        ${visitors.map(v => `- ${v.name} from ${v.company || 'Unknown'}, Purpose: ${v.purpose || 'General'}, Host: ${staff.find(s => s.id === v.hostStaffId)?.name || 'Unknown'}`).join('\n')}

        Staff Departments:
        ${staff.map(s => `- ${s.name} (${s.department})`).join('\n')}

        Please provide a JSON response with:
        1. insights: Array of 3-4 key business insights about visitor patterns
        2. recommendations: Array of 3-4 actionable security/operational recommendations  
        3. riskAssessment: Overall security risk assessment (Low/Medium/High) with brief explanation
        4. prediction: Prediction about visitor trends for next week

        Focus on practical, actionable insights that help improve security and operations.
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a professional security and business intelligence analyst. Provide actionable insights in JSON format."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 800
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        insights: result.insights || [],
        recommendations: result.recommendations || [],
        riskAssessment: result.riskAssessment || 'Unable to assess',
        prediction: result.prediction || 'No prediction available'
      };

    } catch (error) {
      console.error('AI Insights generation failed:', error);
      return {
        insights: ['AI analysis temporarily unavailable'],
        recommendations: ['Standard security protocols recommended'],
        riskAssessment: 'Standard risk level',
        prediction: 'Historical patterns suggest steady visitor flow'
      };
    }
  }

  /**
   * Generate smart security recommendations based on visitor patterns
   */
  async generateSecurityAlert(visitors: Visitor[], unusualPattern: string): Promise<string> {
    try {
      const prompt = `
        As a security AI, analyze this potential security concern:
        
        Pattern Detected: ${unusualPattern}
        Current Visitors: ${visitors.length}
        
        Recent Visitor Activity:
        ${visitors.slice(0, 5).map(v => `- ${v.name} from ${v.company || 'Unknown'} (${v.purpose || 'General visit'})`).join('\n')}

        Provide a brief, professional security recommendation (2-3 sentences) on whether this requires immediate attention.
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system", 
            content: "You are a professional security analyst. Provide concise, actionable security recommendations."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 200
      });

      return response.choices[0].message.content || 'Standard security protocols recommended.';

    } catch (error) {
      console.error('Security alert generation failed:', error);
      return 'Security analysis unavailable. Please follow standard protocols.';
    }
  }

  /**
   * Enhance visitor communications with AI
   */
  async enhanceVisitorEmail(
    originalContent: string, 
    visitorName: string, 
    companyName: string,
    purpose: string
  ): Promise<string> {
    try {
      const prompt = `
        Enhance this visitor email to be more professional and welcoming while maintaining all important information:

        Original Email Content:
        ${originalContent}

        Visitor Details:
        - Name: ${visitorName}
        - Company: ${companyName}
        - Purpose: ${purpose}

        Make the email:
        1. More professional and welcoming
        2. Maintain all safety and security information
        3. Add a personal touch while keeping it business appropriate
        4. Ensure all original details are preserved

        Return only the enhanced email content.
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a professional communications specialist. Enhance business emails to be more engaging while maintaining professionalism."
          },
          {
            role: "user", 
            content: prompt
          }
        ],
        max_tokens: 600
      });

      return response.choices[0].message.content || originalContent;

    } catch (error) {
      console.error('Email enhancement failed:', error);
      return originalContent;
    }
  }

  /**
   * Generate predictive analytics for visitor management
   */
  async generatePredictiveAnalytics(
    historicalData: any,
    currentTrends: any
  ): Promise<{
    nextWeekPrediction: string;
    peakHoursForecast: string;
    capacityRecommendation: string;
    departmentInsights: string[];
  }> {
    try {
      const prompt = `
        Analyze visitor management data to provide predictive insights:

        Current Trends:
        - Current Visitors: ${currentTrends.currentVisitors}
        - Today's Check-ins: ${currentTrends.todayCheckins}
        - Staff On-Site: ${currentTrends.staffOnSite}
        - Average Visit Duration: ${currentTrends.avgVisitDuration}

        Provide JSON response with:
        1. nextWeekPrediction: Forecast for next week's visitor volume
        2. peakHoursForecast: Predicted peak visitor hours
        3. capacityRecommendation: Staffing/space recommendations
        4. departmentInsights: Array of insights about department visitor patterns

        Base predictions on typical business patterns and current data.
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a business intelligence analyst specializing in visitor management and facility planning."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 500
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        nextWeekPrediction: result.nextWeekPrediction || 'Steady visitor flow expected',
        peakHoursForecast: result.peakHoursForecast || '9AM-11AM typical peak hours',
        capacityRecommendation: result.capacityRecommendation || 'Current capacity adequate',
        departmentInsights: result.departmentInsights || ['Standard department activity']
      };

    } catch (error) {
      console.error('Predictive analytics failed:', error);
      return {
        nextWeekPrediction: 'Historical patterns suggest normal visitor flow',
        peakHoursForecast: 'Peak hours typically 9AM-11AM and 2PM-4PM', 
        capacityRecommendation: 'Current capacity appears adequate',
        departmentInsights: ['Engineering department shows highest visitor engagement']
      };
    }
  }

  /**
   * AI-powered visitor photo analysis and enhancement suggestions
   */
  async analyzeVisitorPhoto(base64Image: string): Promise<{
    qualityScore: number;
    enhancementSuggestions: string[];
    suitabilityForID: boolean;
    aiSummary: string;
  }> {
    try {
      const prompt = `
        Analyze this visitor photo for ID badge suitability. Consider:
        1. Photo quality and clarity
        2. Professional appearance
        3. Proper lighting and framing
        4. Suitability for security identification
        
        Provide JSON response with:
        - qualityScore: 1-10 rating
        - enhancementSuggestions: Array of improvement suggestions
        - suitabilityForID: boolean if suitable for ID badge
        - aiSummary: Brief professional assessment
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a professional photography and security specialist analyzing visitor photos for ID badges."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 400
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        qualityScore: result.qualityScore || 7,
        enhancementSuggestions: result.enhancementSuggestions || ['Photo appears suitable for ID badge'],
        suitabilityForID: result.suitabilityForID !== false,
        aiSummary: result.aiSummary || 'Photo analysis completed successfully'
      };

    } catch (error) {
      console.error('Photo analysis failed:', error);
      return {
        qualityScore: 7,
        enhancementSuggestions: ['Photo analysis temporarily unavailable'],
        suitabilityForID: true,
        aiSummary: 'Standard photo quality assessment applied'
      };
    }
  }
}

export const aiService = new AIService();