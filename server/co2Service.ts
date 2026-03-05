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
  car_petrol: number; // kg CO2 per mile (UK gov 2024/25)
  car_diesel: number; // kg CO2 per mile (UK gov 2024/25)
  electric: number;   // kg CO2 per mile (UK grid 2024)
  public_transport: number; // kg CO2 per mile (UK average)
  motorcycle: number; // kg CO2 per mile (UK gov 2024/25)
}

export class CO2Service {
  private genAI: GoogleGenAI;
  // UK Government 2024/2025 conversion factors for commuting
  // Source: UK Gov GHG Conversion Factors
  private emissionFactors: CO2EmissionFactors = {
    car_petrol: 0.268,      // Average petrol car (medium)
    car_diesel: 0.257,      // Average diesel car (medium) 
    electric: 0.047,        // Electric car (UK grid mix 2024)
    public_transport: 0.103, // Bus/train average
    motorcycle: 0.186       // Average motorcycle
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

      const combinedPrompt = `You are a UK travel distance calculator. Always return valid JSON only, no additional text or explanations.\n\n${prompt}`;

      const response = await this.genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: combinedPrompt,
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
- Total monthly CO2 emissions: ${totalMonthlyCO2.toFixed(2)} kg CO2
- Annual projection: ${(totalMonthlyCO2 * 12).toFixed(2)} kg CO2/year
- Average CO2 per worker: ${(totalMonthlyCO2 / totalWorkers).toFixed(2)} kg/month

Worker breakdown:
${workerBreakdown.map(w => 
  `- ${w.name} (${w.company}): ${w.distanceMiles} miles/day, ${w.monthlyCO2.toFixed(2)} kg CO2/month via ${w.transportMethod}`
).join('\n')}

Create a structured report with these exact sections (use these headers):

[EXECUTIVE_SUMMARY]
Brief overview of findings and key metrics.

[CURRENT_EMISSIONS]
Detailed analysis of current emissions levels, highest contributors, and trends.

[ENVIRONMENTAL_IMPACT]
Environmental impact compared to UK benchmarks (average UK worker commute is 10 miles/day producing 50kg CO2/month by car).

[RECOMMENDATIONS]
Specific, actionable recommendations for emissions reduction with estimated savings.

[INDUSTRY_COMPARISON]
Comparison to UK construction industry averages and best practices.

[ACTION_PLAN]
Step-by-step implementation plan with timelines and priorities.

Keep each section concise (2-3 sentences). Use professional business language.`;

      const combinedPrompt = `You are a sustainability consultant specializing in carbon footprint analysis for UK construction and contracting industries. Generate a structured report with clear section headers as specified.\n\n${prompt}`;

      const response = await this.genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: combinedPrompt,
        config: {
          temperature: 0.3,
          maxOutputTokens: 1024,
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
   * UK postcode area centroids (lat, lon) — used for offline distance estimation
   * when Gemini AI is unavailable. Covers all major postcode areas in the UK.
   */
  private ukPostcodeAreaCentroids: Record<string, [number, number]> = {
    'AB': [57.15, -2.11], 'AL': [51.75, -0.24], 'B': [52.48, -1.90], 'BA': [51.38, -2.36],
    'BB': [53.75, -2.49], 'BD': [53.80, -1.75], 'BH': [50.72, -1.90], 'BL': [53.58, -2.43],
    'BN': [50.83, -0.14], 'BR': [51.38, 0.02],  'BS': [51.45, -2.60], 'CA': [54.90, -2.94],
    'CB': [52.20, 0.13],  'CF': [51.48, -3.18], 'CH': [53.20, -2.89], 'CM': [51.74, 0.48],
    'CO': [51.89, 0.90],  'CR': [51.37, -0.10], 'CT': [51.28, 1.08],  'CV': [52.41, -1.51],
    'CW': [53.09, -2.44], 'DA': [51.44, 0.22],  'DD': [56.46, -2.97], 'DE': [52.92, -1.48],
    'DH': [54.78, -1.57], 'DL': [54.52, -1.55], 'DN': [53.52, -1.12], 'DT': [50.71, -2.44],
    'DY': [52.51, -2.09], 'E': [51.52, -0.06],  'EC': [51.52, -0.09], 'EH': [55.95, -3.20],
    'EN': [51.65, -0.08], 'EX': [50.72, -3.53], 'FK': [56.00, -3.78], 'FY': [53.80, -3.05],
    'G': [55.86, -4.25],  'GL': [51.86, -2.24], 'GU': [51.24, -0.57], 'HA': [51.59, -0.34],
    'HD': [53.65, -1.78], 'HG': [54.00, -1.54], 'HP': [51.76, -0.75], 'HR': [52.06, -2.72],
    'HU': [53.74, -0.34], 'HX': [53.72, -1.86], 'IG': [51.56, 0.07],  'IP': [52.06, 1.16],
    'IV': [57.48, -4.23], 'KA': [55.61, -4.50], 'KT': [51.37, -0.30], 'KY': [56.20, -3.15],
    'L': [53.41, -2.98],  'LA': [54.05, -2.80], 'LD': [52.24, -3.38], 'LE': [52.63, -1.13],
    'LL': [53.05, -3.80], 'LN': [53.23, -0.54], 'LS': [53.80, -1.55], 'LU': [51.88, -0.42],
    'M': [53.48, -2.24],  'ME': [51.39, 0.52],  'MK': [52.04, -0.76], 'ML': [55.78, -3.99],
    'N': [51.55, -0.10],  'NE': [54.97, -1.61], 'NG': [52.95, -1.14], 'NN': [52.24, -0.89],
    'NP': [51.59, -3.00], 'NR': [52.63, 1.30],  'NW': [51.54, -0.17], 'OL': [53.55, -2.12],
    'OX': [51.75, -1.26], 'PA': [55.84, -4.43], 'PE': [52.57, 0.24],  'PH': [56.40, -3.47],
    'PL': [50.38, -4.14], 'PO': [50.80, -1.09], 'PR': [53.76, -2.70], 'RG': [51.46, -1.00],
    'RH': [51.23, -0.19], 'RM': [51.58, 0.20],  'S': [53.38, -1.47],  'SA': [51.62, -3.94],
    'SE': [51.48, -0.06], 'SG': [51.90, -0.22], 'SK': [53.40, -2.15], 'SL': [51.52, -0.60],
    'SM': [51.40, -0.20], 'SN': [51.56, -1.78], 'SO': [50.91, -1.40], 'SP': [51.07, -1.80],
    'SR': [54.90, -1.38], 'SS': [51.55, 0.71],  'ST': [53.00, -2.18], 'SW': [51.46, -0.17],
    'SY': [52.71, -2.75], 'TA': [51.02, -3.10], 'TF': [52.71, -2.48], 'TN': [51.07, 0.26],
    'TQ': [50.47, -3.53], 'TR': [50.26, -5.05], 'TS': [54.57, -1.23], 'TW': [51.45, -0.34],
    'UB': [51.53, -0.48], 'W': [51.51, -0.21],  'WA': [53.39, -2.60], 'WC': [51.52, -0.12],
    'WD': [51.66, -0.42], 'WF': [53.68, -1.50], 'WN': [53.54, -2.64], 'WR': [52.19, -2.22],
    'WS': [52.58, -1.98], 'WV': [52.59, -2.13], 'YO': [53.96, -1.09], 'ZE': [60.15, -1.15],
  };

  /**
   * Haversine formula — returns straight-line distance in miles between two lat/lon points
   */
  private haversineDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3958.8; // Earth radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Extract postcode area code (e.g. "SW" from "SW1A 1AA"), then look up centroid
   */
  private getPostcodeCentroid(postcode: string): [number, number] | null {
    const clean = postcode.trim().toUpperCase().replace(/\s+/g, '');
    // Try two-letter prefix first, then one-letter
    const twoLetter = clean.slice(0, 2).replace(/[^A-Z]/g, '');
    const oneLetter = clean.slice(0, 1);
    const area = twoLetter.length === 2 && this.ukPostcodeAreaCentroids[twoLetter]
      ? twoLetter
      : oneLetter;
    return this.ukPostcodeAreaCentroids[area] || null;
  }

  /**
   * Fallback distance calculation using UK postcode area centroids + Haversine formula.
   * Road distance ≈ straight-line × 1.25. Falls back to 15 miles (typical urban commute)
   * if either postcode area is unrecognised.
   */
  private getFallbackDistance(postcode1: string, address: string): number {
    // Extract a UK postcode from the company address string if present
    const addressPostcodeMatch = address.match(/[A-Z]{1,2}[0-9R][0-9A-Z]?\s?[0-9][A-Z]{2}/i);
    const postcode2 = addressPostcodeMatch ? addressPostcodeMatch[0] : address;

    const centroid1 = this.getPostcodeCentroid(postcode1);
    const centroid2 = this.getPostcodeCentroid(postcode2);

    if (!centroid1 || !centroid2) {
      console.warn(`⚠️ CO2 fallback: could not resolve centroids for "${postcode1}" / "${postcode2}", using 15 miles default`);
      return 15;
    }

    const straightLine = this.haversineDistanceMiles(centroid1[0], centroid1[1], centroid2[0], centroid2[1]);
    // Multiply by 1.25 to account for roads being longer than straight-line distance
    const roadEstimate = Math.round(straightLine * 1.25 * 10) / 10;
    console.log(`📍 CO2 fallback distance (centroid-based): ${postcode1} → ${postcode2} ≈ ${roadEstimate} miles`);
    return Math.max(1, roadEstimate); // minimum 1 mile
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
    // Space between the two parts is optional — postcodes may be stored with or without it
    const ukPostcodeRegex = /^[A-Z]{1,2}[0-9R][0-9A-Z]?\s?[0-9][ABD-HJLNP-UW-Z]{2}$/i;
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
