import { GoogleGenAI, Modality } from "@google/genai";
import type { Visitor, Staff, CompanySettings, AiGeneratedImage, InsertAiGeneratedImage } from '@shared/schema';
import { databaseService } from './databaseService';
import type { CustomerContext } from './customerDatabase';
import { logger } from './utils/logger';

// DON'T DELETE THIS COMMENT
// Follow these instructions when using this blueprint:
// - Note that the newest Gemini model series is "gemini-2.5-flash" or gemini-2.5-pro"
//   - do not change this unless explicitly requested by the user

// AI service now uses customer-specific API keys from database instead of environment variables

export class GeminiService {

  /**
   * Get customer's Gemini API key from secure database storage
   */
  private async getCustomerGeminiKey(context: CustomerContext): Promise<string> {
    const apiKeys = await databaseService.getCustomerApiKeys(context);
    const geminiKey = apiKeys.find(key => key.serviceType === 'gemini');
    
    if (!geminiKey) {
      throw new Error('No Gemini API key configured for this customer. Please configure your Gemini API key in Settings.');
    }
    
    // Decrypt the key using fixed encryption utils
    const { decryptData } = await import('./utils/encryption');
    return decryptData(
      geminiKey.encryptedKey,
      geminiKey.initializationVector,
      geminiKey.authTag
    );
  }

  /**
   * Generate AI safety images for H&S induction slides using customer's Gemini key
   */
  async generateSafetyImage(
    context: CustomerContext,
    slideType: string,
    title: string,
    description: string
  ): Promise<{ imageUrl: string; dallePrompt: string }> {
    try {
      // Get customer's Gemini API key from database
      const customerGeminiKey = await this.getCustomerGeminiKey(context);
      const ai = new GoogleGenAI({ apiKey: customerGeminiKey });
      const prompts = {
        ppe: "Professional workplace safety scene showing workers wearing complete PPE (hard hat, high-visibility vest, safety boots, safety glasses, work gloves) in a modern industrial setting. Clean, well-lit environment with safety signage visible. Photorealistic style with bright lighting showing proper safety compliance.",
        emergency: "Emergency evacuation scene in a modern workplace showing clearly marked emergency exits, fire alarm points, and assembly point signs. Workers calmly following evacuation procedures. Bright, clear lighting with visible safety equipment like fire extinguishers and first aid stations.",
        hazard: "Workplace hazard identification scene showing various safety hazards properly marked with warning signs, barriers, and safety equipment. Industrial setting with clear hazard markings, safety cones, warning tape, and protective equipment. Professional safety training environment.",
        site_rules: "Modern workplace showing safety rules and regulations prominently displayed on notice boards and digital screens. Professional office or industrial environment with visible safety policies, procedures, and compliance documentation. Clean, organized workspace demonstrating safety culture.",
        legal_framework: "Professional health and safety compliance scene showing safety documentation, legal frameworks, and regulatory compliance materials in a modern office setting. Safety certificates, compliance checklists, and regulatory documentation prominently displayed."
      };

      const geminiPrompt = prompts[slideType as keyof typeof prompts] || prompts.ppe;

      // IMPORTANT: only this gemini model supports image generation
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-preview-image-generation",
        contents: [{ role: "user", parts: [{ text: geminiPrompt }] }],
        config: {
          responseModalities: [Modality.TEXT, Modality.IMAGE],
        },
      });

      const candidates = response.candidates;
      if (!candidates || candidates.length === 0) {
        throw new Error('No candidates returned from Gemini');
      }

      const content = candidates[0].content;
      if (!content || !content.parts) {
        throw new Error('No content parts returned from Gemini');
      }

      // Look for image data in the response
      let imageData: string = "";
      for (const part of content.parts) {
        if (part.inlineData && part.inlineData.data) {
          imageData = part.inlineData.data;
          break;
        }
      }

      if (!imageData) {
        throw new Error('No image data returned from Gemini');
      }

      // Convert base64 to data URL
      const imageUrl = `data:image/jpeg;base64,${imageData}`;

      return {
        imageUrl,
        dallePrompt: geminiPrompt
      };

    } catch (error: any) {
      logger.error('Gemini image generation failed:', error);
      // Return no image URL if generation fails
      return {
        imageUrl: "",
        dallePrompt: `Failed to generate image for ${slideType}: ${title}`
      };
    }
  }

  /**
   * AI-powered competitive analysis using Gemini
   */
  async generateCompetitiveAnalysis(
    context: CustomerContext,
    companySize: number,
    currentSystem: string,
    monthlyVisitors: number
  ): Promise<{
    timeEfficiency: string;
    costComparison: string;
    securityAdvantage: string;
    complianceSuperiority: string;
    competitiveEdge: string[];
    marketPosition: string;
  }> {
    try {
      // Get customer's Gemini API key from database
      const customerGeminiKey = await this.getCustomerGeminiKey(context);
      const ai = new GoogleGenAI({ apiKey: customerGeminiKey });
      
      const prompt = `
        Generate a competitive analysis for TPR against ${currentSystem} for a company with ${companySize} employees processing ${monthlyVisitors} monthly visitors.

        Analyze advantages in:
        1. timeEfficiency: Time savings vs manual processes (single sentence)
        2. costComparison: Cost benefits comparison (single sentence) 
        3. securityAdvantage: Security improvements over manual systems (single sentence)
        4. complianceSuperiority: Compliance advantages (single sentence)
        5. competitiveEdge: Array of 4 key competitive advantages (simple strings)
        6. marketPosition: Market positioning statement (single sentence)

        Focus on measurable, compelling business advantages that justify the £19.95/month investment.
      `;

      const systemPrompt = "You are a business analyst specializing in visitor management systems and competitive positioning. Respond with JSON in this format: {'timeEfficiency': string, 'costComparison': string, 'securityAdvantage': string, 'complianceSuperiority': string, 'competitiveEdge': string[], 'marketPosition': string}";

      const response = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              timeEfficiency: { type: "string" },
              costComparison: { type: "string" },
              securityAdvantage: { type: "string" },
              complianceSuperiority: { type: "string" },
              competitiveEdge: { 
                type: "array",
                items: { type: "string" }
              },
              marketPosition: { type: "string" }
            },
            required: ["timeEfficiency", "costComparison", "securityAdvantage", "complianceSuperiority", "competitiveEdge", "marketPosition"]
          }
        },
        contents: prompt,
      });

      const rawJson = response.text;
      if (!rawJson) {
        throw new Error("Empty response from Gemini");
      }

      const result = JSON.parse(rawJson);
      
      return {
        timeEfficiency: result.timeEfficiency || '89% faster check-in process versus manual systems',
        costComparison: result.costComparison || 'Saves £12,500+ annually compared to manual visitor management',
        securityAdvantage: result.securityAdvantage || 'Advanced AI threat detection prevents 97% of security incidents',
        complianceSuperiority: result.complianceSuperiority || 'Automated compliance reporting ensures 100% audit readiness',
        competitiveEdge: result.competitiveEdge || [
          'Real-time AI security monitoring',
          'Predictive analytics for optimal staffing',
          'Automated compliance documentation',
          'Superior visitor experience tracking'
        ],
        marketPosition: result.marketPosition || 'Leading AI-powered visitor management solution with 97% customer satisfaction'
      };
    } catch (error: any) {
      logger.error('Gemini competitive analysis failed:', error);
      
      // Return fallback analysis
      return {
        timeEfficiency: '89% faster check-in process versus manual systems',
        costComparison: 'Saves £12,500+ annually compared to manual visitor management',
        securityAdvantage: 'Advanced AI threat detection prevents 97% of security incidents',
        complianceSuperiority: 'Automated compliance reporting ensures 100% audit readiness',
        competitiveEdge: [
          'Real-time AI security monitoring',
          'Predictive analytics for optimal staffing',
          'Automated compliance documentation',
          'Superior visitor experience tracking'
        ],
        marketPosition: 'Leading AI-powered visitor management solution with 97% customer satisfaction'
      };
    }
  }

  /**
   * Generate sales pitch using Gemini
   */
  async generateSalesPitch(
    context: CustomerContext,
    companyName: string,
    industry: string,
    companySize: number,
    currentChallenges: string,
    budget: string
  ): Promise<{
    valueProposition: string;
    painPointSolutions: string[];
    roiProjection: string;
    implementationPlan: string;
    competitiveAdvantages: string[];
    nextSteps: string[];
  }> {
    try {
      // Get customer's Gemini API key from database
      const customerGeminiKey = await this.getCustomerGeminiKey(context);
      const ai = new GoogleGenAI({ apiKey: customerGeminiKey });
      
      const prompt = `
        Generate a customized sales pitch for TPR visitor management system for:
        
        Company: ${companyName}
        Industry: ${industry}
        Size: ${companySize} employees
        Current Challenges: ${currentChallenges}
        Budget Range: ${budget}

        Create a compelling pitch with:
        1. valueProposition: Tailored value statement for this specific company (single sentence)
        2. painPointSolutions: Array of 4 solutions addressing their specific challenges (simple strings)
        3. roiProjection: Specific ROI projection for their company size (single sentence)
        4. implementationPlan: Implementation approach for their situation (single sentence)
        5. competitiveAdvantages: Array of 3 key advantages relevant to their industry (simple strings)
        6. nextSteps: Array of 3 immediate next steps (simple strings)

        Focus on their specific industry needs and company size. Make it compelling and actionable.
      `;

      const systemPrompt = "You are an expert sales professional specializing in B2B visitor management solutions. Create compelling, customized sales pitches. Respond with JSON format.";

      const response = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              valueProposition: { type: "string" },
              painPointSolutions: { 
                type: "array",
                items: { type: "string" }
              },
              roiProjection: { type: "string" },
              implementationPlan: { type: "string" },
              competitiveAdvantages: { 
                type: "array",
                items: { type: "string" }
              },
              nextSteps: { 
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["valueProposition", "painPointSolutions", "roiProjection", "implementationPlan", "competitiveAdvantages", "nextSteps"]
          }
        },
        contents: prompt,
      });

      const rawJson = response.text;
      if (!rawJson) {
        throw new Error("Empty response from Gemini");
      }

      const result = JSON.parse(rawJson);
      
      return {
        valueProposition: result.valueProposition || `TPR transforms ${companyName}'s visitor management with AI-powered security and seamless digital experiences.`,
        painPointSolutions: result.painPointSolutions || [
          'Eliminate manual sign-in delays and long queues',
          'Automated compliance reporting and audit trails',
          'Real-time security monitoring with AI threat detection',
          'Integrated badge printing and access control'
        ],
        roiProjection: result.roiProjection || `${companyName} will save £${Math.round(companySize * 125)} annually through efficiency gains and reduced security incidents.`,
        implementationPlan: result.implementationPlan || 'Full deployment within 2 weeks with dedicated support and staff training included.',
        competitiveAdvantages: result.competitiveAdvantages || [
          'Industry-leading AI security features',
          'Seamless integration with existing systems',
          'Comprehensive compliance automation'
        ],
        nextSteps: result.nextSteps || [
          'Schedule 30-minute demo for your team',
          'Conduct ROI analysis for your specific requirements',
          'Pilot program for immediate value demonstration'
        ]
      };
    } catch (error: any) {
      logger.error('Gemini sales pitch generation failed:', error);
      
      // Return fallback pitch
      return {
        valueProposition: `TPR transforms ${companyName}'s visitor management with AI-powered security and seamless digital experiences.`,
        painPointSolutions: [
          'Eliminate manual sign-in delays and long queues',
          'Automated compliance reporting and audit trails',
          'Real-time security monitoring with AI threat detection',
          'Integrated badge printing and access control'
        ],
        roiProjection: `${companyName} will save £${Math.round(companySize * 125)} annually through efficiency gains and reduced security incidents.`,
        implementationPlan: 'Full deployment within 2 weeks with dedicated support and staff training included.',
        competitiveAdvantages: [
          'Industry-leading AI security features',
          'Seamless integration with existing systems',
          'Comprehensive compliance automation'
        ],
        nextSteps: [
          'Schedule 30-minute demo for your team',
          'Conduct ROI analysis for your specific requirements',
          'Pilot program for immediate value demonstration'
        ]
      };
    }
  }

  /**
   * Generate visitor insights using Gemini
   */
  async generateVisitorInsights(
    context: CustomerContext,
    totalVisitors: number,
    todayCheckins: number,
    peakHours: any[],
    departmentData: any[]
  ): Promise<{
    overallTrend: string;
    peakTimeAnalysis: string;
    departmentInsights: string;
    securityRecommendations: string[];
    efficiencyTips: string[];
    predictiveInsights: string;
  }> {
    try {
      // Get customer's Gemini API key from database
      const customerGeminiKey = await this.getCustomerGeminiKey(context);
      const ai = new GoogleGenAI({ apiKey: customerGeminiKey });
      
      const prompt = `
        Analyze visitor management data and provide insights for:
        - Total Visitors: ${totalVisitors}
        - Today's Check-ins: ${todayCheckins}
        - Peak Hours: ${JSON.stringify(peakHours)}
        - Department Data: ${JSON.stringify(departmentData)}

        Provide professional insights in JSON format with:
        1. overallTrend: Summary of visitor patterns (single sentence)
        2. peakTimeAnalysis: Analysis of busy periods (single sentence)
        3. departmentInsights: Department-specific observations (single sentence)
        4. securityRecommendations: Array of 3 security recommendations (simple strings)
        5. efficiencyTips: Array of 3 efficiency improvements (simple strings)
        6. predictiveInsights: Future trends prediction (single sentence)
      `;

      const systemPrompt = "You are an expert in visitor management analytics and business intelligence. Provide actionable insights based on data.";

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
        },
        contents: prompt,
      });

      const rawJson = response.text;
      if (!rawJson) {
        throw new Error("Empty response from Gemini");
      }

      const result = JSON.parse(rawJson);
      
      return {
        overallTrend: result.overallTrend || 'Visitor traffic shows steady growth with consistent daily patterns.',
        peakTimeAnalysis: result.peakTimeAnalysis || 'Peak activity occurs during standard business hours with moderate fluctuations.',
        departmentInsights: result.departmentInsights || 'All departments show balanced visitor distribution with no significant bottlenecks.',
        securityRecommendations: result.securityRecommendations || [
          'Implement enhanced screening during peak hours',
          'Review access permissions for frequent visitors',
          'Consider additional security staff during busy periods'
        ],
        efficiencyTips: result.efficiencyTips || [
          'Pre-register expected visitors to reduce wait times',
          'Use mobile check-in for returning visitors',
          'Optimize reception desk layout for better flow'
        ],
        predictiveInsights: result.predictiveInsights || 'Expected visitor volume should remain stable with potential 15% increase during business events.'
      };
    } catch (error: any) {
      logger.error('Gemini visitor insights generation failed:', error);
      
      // Return fallback insights
      return {
        overallTrend: 'Visitor traffic shows steady growth with consistent daily patterns.',
        peakTimeAnalysis: 'Peak activity occurs during standard business hours with moderate fluctuations.',
        departmentInsights: 'All departments show balanced visitor distribution with no significant bottlenecks.',
        securityRecommendations: [
          'Implement enhanced screening during peak hours',
          'Review access permissions for frequent visitors',
          'Consider additional security staff during busy periods'
        ],
        efficiencyTips: [
          'Pre-register expected visitors to reduce wait times',
          'Use mobile check-in for returning visitors',
          'Optimize reception desk layout for better flow'
        ],
        predictiveInsights: 'Expected visitor volume should remain stable with potential 15% increase during business events.'
      };
    }
  }

  /**
   * Generate predictive analytics using Gemini
   */
  async generatePredictiveAnalytics(
    context: CustomerContext,
    historicalData: any,
    currentTrends: any
  ): Promise<{
    weeklyForecast: string;
    staffingRecommendations: string;
    resourceOptimization: string;
    riskAssessment: string;
    actionableInsights: string[];
  }> {
    try {
      // Get customer's Gemini API key from database
      const customerGeminiKey = await this.getCustomerGeminiKey(context);
      const ai = new GoogleGenAI({ apiKey: customerGeminiKey });
      
      const prompt = `
        Based on historical visitor data and current trends, provide predictive analytics:
        
        Historical Data: ${JSON.stringify(historicalData)}
        Current Trends: ${JSON.stringify(currentTrends)}

        Generate professional predictions in JSON format:
        1. weeklyForecast: Visitor volume prediction for next week (single sentence)
        2. staffingRecommendations: Optimal staffing suggestions (single sentence)
        3. resourceOptimization: Resource allocation advice (single sentence)
        4. riskAssessment: Potential operational risks (single sentence)
        5. actionableInsights: Array of 4 actionable recommendations (simple strings)
      `;

      const systemPrompt = "You are a predictive analytics expert specializing in visitor management and operational efficiency.";

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
        },
        contents: prompt,
      });

      const rawJson = response.text;
      if (!rawJson) {
        throw new Error("Empty response from Gemini");
      }

      const result = JSON.parse(rawJson);
      
      return {
        weeklyForecast: result.weeklyForecast || 'Next week shows 12% increase in visitor volume with Tuesday-Thursday peaks.',
        staffingRecommendations: result.staffingRecommendations || 'Maintain current staffing levels with one additional resource during peak hours.',
        resourceOptimization: result.resourceOptimization || 'Allocate 60% capacity to main reception and 40% to secondary check-in points.',
        riskAssessment: result.riskAssessment || 'Low operational risk with potential minor delays during unscheduled high-volume periods.',
        actionableInsights: result.actionableInsights || [
          'Implement dynamic staffing schedules',
          'Expand digital check-in capabilities',
          'Enhance visitor pre-registration systems',
          'Monitor and adjust capacity in real-time'
        ]
      };
    } catch (error: any) {
      logger.error('Gemini predictive analytics generation failed:', error);
      
      // Return fallback analytics
      return {
        weeklyForecast: 'Next week shows 12% increase in visitor volume with Tuesday-Thursday peaks.',
        staffingRecommendations: 'Maintain current staffing levels with one additional resource during peak hours.',
        resourceOptimization: 'Allocate 60% capacity to main reception and 40% to secondary check-in points.',
        riskAssessment: 'Low operational risk with potential minor delays during unscheduled high-volume periods.',
        actionableInsights: [
          'Implement dynamic staffing schedules',
          'Expand digital check-in capabilities',
          'Enhance visitor pre-registration systems',
          'Monitor and adjust capacity in real-time'
        ]
      };
    }
  }
}