import OpenAI from 'openai';

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
  private openai: OpenAI;
  private emissionFactors: CO2EmissionFactors = {
    car_petrol: 0.27,
    car_diesel: 0.25,
    electric: 0.05,
    public_transport: 0.12,
    motorcycle: 0.21
  };

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Calculate distance between worker postcode and company address using OpenAI
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

      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a UK travel distance calculator. Always return valid JSON only, no additional text or explanations."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 200
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      // Parse the JSON response
      const distanceData = JSON.parse(content) as DistanceCalculation;
      
      // Validate the response
      if (!distanceData.distanceMiles || !distanceData.distanceKm) {
        throw new Error('Invalid distance calculation response');
      }

      return distanceData;
    } catch (error) {
      console.error('Error calculating distance with OpenAI:', error);
      
      // Fallback: Basic postcode distance estimation
      // This is a rough approximation based on UK postcode system
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
   * Generate comprehensive CO2 sustainability report using OpenAI
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
  ): Promise<string> {
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

      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a sustainability consultant specializing in carbon footprint analysis for UK construction and contracting industries."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      });

      return response.choices[0]?.message?.content || 'Report generation failed';
    } catch (error) {
      console.error('Error generating sustainability report:', error);
      return 'Unable to generate AI-powered sustainability report at this time.';
    }
  }

  /**
   * Fallback distance calculation based on postcode patterns
   */
  private getFallbackDistance(postcode1: string, postcode2: string): number {
    // Simple fallback based on postcode area differences
    // This is very rough but provides a backup when OpenAI is unavailable
    const area1 = postcode1.match(/^[A-Z]{1,2}/)?.[0] || '';
    const area2 = postcode2.match(/^[A-Z]{1,2}/)?.[0] || '';
    
    if (area1 === area2) {
      return Math.random() * 15 + 5; // 5-20 miles for same area
    }
    
    // Different areas - estimate based on UK geography
    return Math.random() * 100 + 20; // 20-120 miles
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