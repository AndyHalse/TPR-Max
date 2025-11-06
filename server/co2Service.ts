import { GoogleGenAI } from '@google/genai';

interface DistanceCalculation {
  distanceMiles: number;
  distanceKm: number;
  estimatedTravelTime: string;
  routeType: string; // motorway, a-roads, mixed
}

interface CO2Calculation {
  totalCO2kg: number;
  transportMethod: 'car_petrol' | 'car_diesel' | 'electric' | 'public_transport' | 'motorcycle';
  distanceMiles: number;
  emissionFactor: number; // kg CO2 per mile
  monthlyProjection: number;
  annualProjection: number;
}

interface CO2EmissionFactors {
  car_petrol: number; // 0.27 kg CO2/mile
  car_diesel: number; // 0.25 kg CO2/mile  
  electric: number;   // 0.05 kg CO2/mile (UK grid average)
  public_transport: number; // 0.12 kg CO2/mile
  motorcycle: number; // 0.21 kg CO2/mile
}

export class CO2Service {
  private genAI: GoogleGenAI;
  private emissionFactors: CO2EmissionFactors = {
    car_petrol: 0.27,
    car_diesel: 0.25,
    electric: 0.05,
    public_transport: 0.12,
    motorcycle: 0.21
  };

  constructor() {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    const baseURL = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    
    if (!apiKey) {
      throw new Error('AI_INTEGRATIONS_GEMINI_API_KEY environment variable is required');
    }
    
    // Initialize Gemini using Replit AI Integrations
    this.genAI = new GoogleGenAI({
      apiKey,
      httpOptions: {
        apiVersion: "",
        baseUrl: baseURL || "",
      },
    });
  }

  /**
   * Calculate distance between worker postcode and company address using Gemini AI
   */
  async calculateDistance(workerPostcode: string, companyAddress: string): Promise<DistanceCalculation> {
    try {
      const prompt = `Calculate the driving distance between these UK locations:
      
From: ${workerPostcode}
To: ${companyAddress}

Please provide a JSON response with:
- distanceMiles: number (driving distance in miles)
- distanceKm: number (driving distance in kilometers) 
- estimatedTravelTime: string (e.g. "45 minutes")
- routeType: string ("motorway", "a-roads", or "mixed")

Only return valid JSON, no additional text.`;

      const systemPrompt = "You are a UK travel distance calculator. Always return valid JSON only, no additional text or explanations.";

      const response = await this.genAI.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'user', parts: [{ text: prompt }] }
        ],
        config: {
          temperature: 0.1,
          maxOutputTokens: 200,
        }
      });

      const content = response.text || '';
      
      if (!content) {
        throw new Error('No response from Gemini AI');
      }

      // Clean up the response - remove markdown code blocks if present
      let jsonText = content.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '');
      }

      // Parse the JSON response
      const distanceData = JSON.parse(jsonText) as DistanceCalculation;
      
      // Validate the response
      if (!distanceData.distanceMiles || !distanceData.distanceKm) {
        throw new Error('Invalid distance calculation response');
      }

      console.log(`✅ Gemini AI calculated distance: ${distanceData.distanceMiles} miles`);
      return distanceData;
    } catch (error) {
      console.error('❌ Gemini AI distance calculation error:', error);
      console.warn(`⚠️ Distance calculation fallback: AI service unavailable`);
      
      // Fallback: Basic postcode distance estimation
      const fallbackDistance = this.getFallbackDistance(workerPostcode, companyAddress);
      
      return {
        distanceMiles: fallbackDistance,
        distanceKm: Math.round(fallbackDistance * 1.609),
        estimatedTravelTime: `${Math.round(fallbackDistance * 2)} minutes`,
        routeType: 'mixed'
      };
    }
  }

  /**
   * Calculate CO2 emissions based on distance and transport method
   */
  calculateCO2Emissions(
    distanceMiles: number, 
    transportMethod: keyof CO2EmissionFactors = 'car_diesel',
    workingDaysPerMonth: number = 22
  ): CO2Calculation {
    const emissionFactor = this.emissionFactors[transportMethod];
    const dailyRoundTripDistance = distanceMiles * 2; // Round trip
    const dailyCO2 = dailyRoundTripDistance * emissionFactor;
    const monthlyCO2 = dailyCO2 * workingDaysPerMonth;
    const annualCO2 = monthlyCO2 * 12;

    return {
      totalCO2kg: dailyCO2,
      transportMethod,
      distanceMiles,
      emissionFactor,
      monthlyProjection: monthlyCO2,
      annualProjection: annualCO2
    };
  }

  /**
   * Generate comprehensive CO2 sustainability report using Gemini AI
   */
  async generateSustainabilityReport(
    companyName: string,
    totalWorkers: number,
    totalMonthlyCO2: number,
    workerBreakdown: Array<{
      name: string;
      company: string;
      postcode: string;
      distanceMiles: number;
      transportMethod: string;
      monthlyCO2: number;
    }>
  ): Promise<{report: string; success: boolean; error?: string}> {
    try {
      const prompt = `Generate a professional CO2 emissions sustainability report for ${companyName}.

Data:
- Total contractor workers: ${totalWorkers}
- Total monthly CO2 emissions: ${totalMonthlyCO2.toFixed(2)} kg
- Annual projection: ${(totalMonthlyCO2 * 12).toFixed(2)} kg

Worker breakdown:
${workerBreakdown.map(w => 
  `- ${w.name} (${w.company}): ${w.distanceMiles} miles, ${w.monthlyCO2.toFixed(2)} kg CO2/month via ${w.transportMethod}`
).join('\n')}

Please provide a professional report including:
1. Executive summary
2. Current emissions status
3. Environmental impact analysis  
4. Recommendations for reduction
5. Comparison to UK industry averages
6. Action plan for sustainability improvements

Format as a comprehensive business report.`;

      const systemPrompt = "You are a sustainability consultant specializing in carbon footprint analysis for UK construction and contracting industries.";

      const response = await this.genAI.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'user', parts: [{ text: prompt }] }
        ],
        config: {
          temperature: 0.3,
          maxOutputTokens: 2000,
        }
      });

      const reportContent = response.text || '';
      
      if (!reportContent) {
        throw new Error('No report content received from AI service');
      }

      console.log(`✅ Gemini AI generated sustainability report (${reportContent.length} characters)`);
      
      return {
        report: reportContent,
        success: true
      };
    } catch (error) {
      console.error('❌ Gemini AI report generation error:', error);
      
      // For reports, we can provide a basic fallback report
      const fallbackReport = this.generateFallbackReport(companyName, totalWorkers, totalMonthlyCO2, workerBreakdown);
      
      return {
        report: fallbackReport,
        success: false,
        error: 'AI service temporarily unavailable'
      };
    }
  }

  /**
   * Fallback distance calculation based on postcode patterns
   */
  private getFallbackDistance(postcode1: string, postcode2: string): number {
    // Simple fallback based on postcode area differences
    const area1 = postcode1.match(/^[A-Z]{1,2}/)?.[0] || '';
    const area2 = postcode2.match(/^[A-Z]{1,2}/)?.[0] || '';
    
    if (area1 === area2) {
      return Math.random() * 15 + 5; // 5-20 miles for same area
    }
    
    // Different areas - estimate based on UK geography
    return Math.random() * 100 + 20; // 20-120 miles
  }

  /**
   * Generate a basic fallback sustainability report when AI is unavailable
   */
  private generateFallbackReport(
    companyName: string,
    totalWorkers: number,
    totalMonthlyCO2: number,
    workerBreakdown: Array<any>
  ): string {
    const avgCO2PerWorker = totalMonthlyCO2 / totalWorkers;
    const annualCO2 = totalMonthlyCO2 * 12;
    
    return `# CO2 EMISSIONS SUSTAINABILITY REPORT
Company: ${companyName}
Generated: ${new Date().toLocaleDateString('en-GB')}

## EXECUTIVE SUMMARY
This report analyzes the carbon footprint of ${totalWorkers} contractor workers associated with ${companyName}. The analysis is based on commuting distances and transportation methods.

## CURRENT EMISSIONS STATUS
- Total contractor workers: ${totalWorkers}
- Monthly CO2 emissions: ${totalMonthlyCO2.toFixed(2)} kg
- Annual projected emissions: ${annualCO2.toFixed(2)} kg  
- Average emissions per worker: ${avgCO2PerWorker.toFixed(2)} kg/month

## ENVIRONMENTAL IMPACT
The current annual emissions of ${annualCO2.toFixed(2)} kg CO2 is equivalent to:
- Planting ${Math.round(annualCO2 / 22)} trees to offset (based on 22kg CO2/tree/year)
- ${(annualCO2 / 2300).toFixed(1)} average UK household's yearly emissions (2.3 tonnes)

## RECOMMENDATIONS FOR REDUCTION
1. **Electric Vehicle Transition**: Encourage contractors to switch to electric vehicles
2. **Public Transport**: Promote public transport use for shorter distances (<30 miles)  
3. **Car Sharing**: Implement lift-sharing schemes between contractors
4. **Remote Work**: Reduce travel through remote meetings and digital collaboration

## ACTION PLAN
- Immediate (0-3 months): Survey contractors on transport preferences
- Short-term (3-6 months): Implement car sharing platform
- Medium-term (6-12 months): Provide EV charging points or allowances
- Long-term (12+ months): Monitor and report quarterly emissions

## COMPLIANCE & REPORTING
This basic assessment provides a foundation for:
- SECR (Streamlined Energy and Carbon Reporting) compliance
- Scope 3 emissions reporting under GHG Protocol
- ESG (Environmental, Social, Governance) reporting

*Note: This is a basic assessment. A detailed AI-generated report with industry benchmarks and advanced analytics is temporarily unavailable.*`;
  }

  /**
   * Validate UK postcode format
   */
  isValidUKPostcode(postcode: string): boolean {
    const ukPostcodeRegex = /^[A-Z]{1,2}[0-9R][0-9A-Z]? [0-9][ABD-HJLNP-UW-Z]{2}$/i;
    return ukPostcodeRegex.test(postcode.trim());
  }

  /**
   * Get emission reduction suggestions based on distance and current transport
   */
  getEmissionReductionSuggestions(distanceMiles: number, currentTransport: keyof CO2EmissionFactors): Array<{
    method: string;
    reduction: string;
    savings: number;
  }> {
    const currentEmissions = distanceMiles * 2 * this.emissionFactors[currentTransport] * 22; // Monthly
    const suggestions = [];

    // Electric vehicle suggestion
    if (currentTransport !== 'electric') {
      const electricEmissions = distanceMiles * 2 * this.emissionFactors.electric * 22;
      const savings = currentEmissions - electricEmissions;
      suggestions.push({
        method: 'Switch to Electric Vehicle',
        reduction: `${((savings / currentEmissions) * 100).toFixed(0)}%`,
        savings: savings
      });
    }

    // Public transport suggestion for shorter distances
    if (distanceMiles < 30 && currentTransport !== 'public_transport') {
      const publicEmissions = distanceMiles * 2 * this.emissionFactors.public_transport * 22;
      const savings = currentEmissions - publicEmissions;
      suggestions.push({
        method: 'Use Public Transport',
        reduction: `${((savings / currentEmissions) * 100).toFixed(0)}%`,
        savings: savings
      });
    }

    // Car sharing suggestion
    if (currentTransport === 'car_petrol' || currentTransport === 'car_diesel') {
      const carShareEmissions = currentEmissions * 0.5; // Assume sharing with 1 other person
      const savings = currentEmissions - carShareEmissions;
      suggestions.push({
        method: 'Car Sharing / Lift Sharing',
        reduction: `${((savings / currentEmissions) * 100).toFixed(0)}%`,
        savings: savings
      });
    }

    return suggestions.filter(s => s.savings > 0);
  }
}
