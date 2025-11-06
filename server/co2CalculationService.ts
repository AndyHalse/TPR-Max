import { CO2Service } from './co2Service';
import { DatabaseService } from './databaseService';
import { 
  CO2EmissionsData, 
  InsertCO2EmissionsData, 
  CO2MonthlySummary,
  InsertCO2MonthlySummary,
  CO2SustainabilityReport,
  InsertCO2SustainabilityReport,
  ContractorWorker 
} from '../shared/schema';

interface CO2CalculationRequest {
  workerId: string;
  workerPostcode: string;
  companyAddress: string;
  transportMethod?: 'car_petrol' | 'car_diesel' | 'electric' | 'public_transport' | 'motorcycle';
  workingDaysPerMonth?: number;
}

interface WorkerCO2Summary {
  workerId: string;
  workerName: string;
  companyName: string;
  postcode: string;
  distanceMiles: number;
  transportMethod: string;
  dailyCO2kg: number;
  monthlyCO2kg: number;
  annualCO2kg: number;
}

export class CO2CalculationService {
  private co2Service: CO2Service;
  private databaseService: DatabaseService;

  constructor(databaseService: DatabaseService) {
    this.co2Service = new CO2Service();
    this.databaseService = databaseService;
  }

  /**
   * Calculate and store CO2 emissions data for a worker
   */
  async calculateWorkerCO2Emissions(
    customerId: string,
    companyId: string,
    request: CO2CalculationRequest
  ): Promise<CO2EmissionsData> {
    try {
      // Validate postcode format
      if (!this.co2Service.isValidUKPostcode(request.workerPostcode)) {
        throw new Error(`Invalid UK postcode format: ${request.workerPostcode}`);
      }

      // Calculate distance using Gemini AI
      const distanceData = await this.co2Service.calculateDistance(
        request.workerPostcode,
        request.companyAddress
      );

      // Calculate CO2 emissions
      const transportMethod = request.transportMethod || 'car_diesel';
      const workingDays = request.workingDaysPerMonth || 22;
      
      const co2Data = this.co2Service.calculateCO2Emissions(
        distanceData.distanceMiles,
        transportMethod,
        workingDays
      );

      // Store in database
      const emissionsRecord: InsertCO2EmissionsData = {
        customerId,
        workerId: request.workerId,
        companyId,
        workerPostcode: request.workerPostcode,
        companyAddress: request.companyAddress,
        distanceMiles: distanceData.distanceMiles,
        distanceKm: distanceData.distanceKm,
        routeType: distanceData.routeType,
        estimatedTravelTime: distanceData.estimatedTravelTime,
        transportMethod,
        emissionFactor: co2Data.emissionFactor.toString(),
        dailyCO2kg: co2Data.totalCO2kg.toString(),
        monthlyCO2kg: co2Data.monthlyProjection.toString(),
        annualCO2kg: co2Data.annualProjection.toString(),
        workingDaysPerMonth: workingDays,
        calculatedBy: 'gemini',
        isActive: true,
      };

      // Store emissions data
      const savedData = await this.databaseService.storeCO2EmissionsData(emissionsRecord);

      // Update monthly summary
      await this.updateMonthlySummary(customerId, companyId);

      return savedData;
    } catch (error) {
      console.error('Error calculating worker CO2 emissions:', error);
      throw new Error(`Failed to calculate CO2 emissions: ${error}`);
    }
  }

  /**
   * Get CO2 data for all workers in a company
   */
  async getCompanyCO2Summary(
    customerId: string,
    companyId: string
  ): Promise<{
    totalWorkers: number;
    totalMonthlyCO2kg: number;
    totalAnnualCO2kg: number;
    averageDistance: number;
    averageCO2PerWorker: number;
    transportBreakdown: Record<string, number>;
    workers: WorkerCO2Summary[];
  }> {
    const emissionsData = await this.databaseService.getCO2EmissionsByCompany(customerId, companyId);
    const context = { customerId }; // Create context for customer isolation
    const workers = await this.databaseService.getWorkersByCompany(context, companyId);

    const workerSummaries: WorkerCO2Summary[] = emissionsData.map(emission => {
      const worker = workers.find(w => w.id === emission.workerId);
      return {
        workerId: emission.workerId,
        workerName: worker ? `${worker.firstName} ${worker.lastName}` : 'Unknown',
        companyName: worker?.companyName || 'Unknown',
        postcode: emission.workerPostcode,
        distanceMiles: emission.distanceMiles,
        transportMethod: emission.transportMethod,
        dailyCO2kg: parseFloat(emission.dailyCO2kg),
        monthlyCO2kg: parseFloat(emission.monthlyCO2kg),
        annualCO2kg: parseFloat(emission.annualCO2kg),
      };
    });

    const totalMonthlyCO2 = workerSummaries.reduce((sum, w) => sum + w.monthlyCO2kg, 0);
    const totalAnnualCO2 = workerSummaries.reduce((sum, w) => sum + w.annualCO2kg, 0);
    const totalDistance = workerSummaries.reduce((sum, w) => sum + w.distanceMiles, 0);
    const averageDistance = workerSummaries.length > 0 ? totalDistance / workerSummaries.length : 0;
    
    const transportBreakdown = workerSummaries.reduce((acc, worker) => {
      acc[worker.transportMethod] = (acc[worker.transportMethod] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalWorkers: workerSummaries.length,
      totalMonthlyCO2kg: totalMonthlyCO2,
      totalAnnualCO2kg: totalAnnualCO2,
      averageDistance: averageDistance,
      averageCO2PerWorker: workerSummaries.length > 0 ? totalMonthlyCO2 / workerSummaries.length : 0,
      transportBreakdown,
      workers: workerSummaries,
    };
  }

  /**
   * Update monthly CO2 summary for a company
   */
  async updateMonthlySummary(customerId: string, companyId: string): Promise<void> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const companySummary = await this.getCompanyCO2Summary(customerId, companyId);

    // Get previous month's data for comparison
    const previousMonth = month === 1 ? 12 : month - 1;
    const previousYear = month === 1 ? year - 1 : year;
    const previousSummary = await this.databaseService.getMonthlySummary(
      customerId, 
      companyId, 
      previousYear, 
      previousMonth
    );

    const previousCO2 = previousSummary ? parseFloat(previousSummary.totalMonthlyCO2kg) : 0;
    const percentageChange = previousCO2 > 0 
      ? ((companySummary.totalMonthlyCO2kg - previousCO2) / previousCO2 * 100).toFixed(1)
      : '0';

    // Calculate sustainability score (0-100)
    const averageEmissionsPerWorker = companySummary.averageCO2PerWorker;
    const sustainabilityScore = Math.max(0, Math.min(100, 
      100 - Math.floor(averageEmissionsPerWorker / 10) // Lower emissions = higher score
    ));

    const summaryData: InsertCO2MonthlySummary = {
      customerId,
      companyId,
      year,
      month,
      totalWorkers: companySummary.totalWorkers,
      totalMonthlyCO2kg: companySummary.totalMonthlyCO2kg.toString(),
      averageCO2PerWorker: companySummary.averageCO2PerWorker.toString(),
      transportBreakdown: JSON.stringify(companySummary.transportBreakdown),
      averageDistanceMiles: Math.round(
        companySummary.workers.reduce((sum, w) => sum + w.distanceMiles, 0) / companySummary.workers.length
      ),
      longestCommuteMiles: Math.max(...companySummary.workers.map(w => w.distanceMiles)),
      shortestCommuteMiles: Math.min(...companySummary.workers.map(w => w.distanceMiles)),
      previousMonthCO2kg: previousCO2.toString(),
      percentageChange,
      sustainabilityScore,
      targetAchieved: parseFloat(percentageChange) < 0, // Reduction = target achieved
    };

    await this.databaseService.upsertMonthlySummary(summaryData);
  }

  /**
   * Generate AI-powered sustainability report
   */
  async generateSustainabilityReport(
    customerId: string,
    companyId: string,
    reportType: 'monthly' | 'quarterly' | 'annual' = 'monthly'
  ): Promise<CO2SustainabilityReport> {
    const startTime = Date.now();
    
    // Get company data with customer isolation
    const context = { customerId }; // Create context for customer isolation
    const company = await this.databaseService.getContractorCompany(context, companyId);
    if (!company) {
      throw new Error('Company not found');
    }

    const companySummary = await this.getCompanyCO2Summary(customerId, companyId);
    
    // Generate report using Gemini AI
    const reportContent = await this.co2Service.generateSustainabilityReport(
      company.name,
      companySummary.totalWorkers,
      companySummary.totalMonthlyCO2kg,
      companySummary.workers.map(w => ({
        name: w.workerName,
        company: w.companyName,
        postcode: w.postcode,
        distanceMiles: w.distanceMiles,
        transportMethod: w.transportMethod,
        monthlyCO2: w.monthlyCO2kg,
      }))
    );

    const generationTime = Date.now() - startTime;
    const now = new Date();
    const reportPeriod = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;

    // Extract sections from the report (AI-generated content might need parsing)
    const sections = this.parseReportSections(reportContent);

    const reportData: InsertCO2SustainabilityReport = {
      customerId,
      companyId,
      reportType,
      reportPeriod,
      reportTitle: `${company.name} CO2 Emissions ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`,
      executiveSummary: sections.executiveSummary,
      currentEmissionsStatus: sections.currentEmissionsStatus,
      environmentalImpactAnalysis: sections.environmentalImpactAnalysis,
      reductionRecommendations: sections.reductionRecommendations,
      industryComparison: sections.industryComparison,
      actionPlan: sections.actionPlan,
      fullReportContent: reportContent,
      totalWorkersCovered: companySummary.totalWorkers,
      totalCO2Analyzed: companySummary.totalMonthlyCO2kg.toString(),
      topRecommendation: sections.topRecommendation,
      potentialSavings: this.calculatePotentialSavings(companySummary.workers).toString(),
      generatedBy: 'gemini',
      aiModel: 'gemini-2.5-flash',
      generationTimeMs: generationTime,
      isPublished: false,
    };

    return await this.databaseService.storeSustainabilityReport(reportData);
  }

  /**
   * Get emission reduction suggestions for a worker
   */
  async getReductionSuggestions(
    customerId: string,
    workerId: string
  ): Promise<Array<{
    method: string;
    reduction: string;
    savings: number;
    difficulty: string;
    costImpact: string;
  }>> {
    const emissionsData = await this.databaseService.getCO2EmissionsByWorker(customerId, workerId);
    
    if (!emissionsData || emissionsData.length === 0) {
      return [];
    }

    const latestData = emissionsData[0]; // Get most recent
    const suggestions = this.co2Service.getEmissionReductionSuggestions(
      latestData.distanceMiles,
      latestData.transportMethod as any
    );

    return suggestions.map(s => ({
      method: s.method,
      reduction: s.reduction,
      savings: s.savings,
      difficulty: s.savings > 100 ? 'medium' : 'easy',
      costImpact: s.method.includes('Electric') ? 'high' : 'low',
    }));
  }

  /**
   * Parse AI-generated report into sections
   */
  private parseReportSections(reportContent: string): {
    executiveSummary: string;
    currentEmissionsStatus: string;
    environmentalImpactAnalysis: string;
    reductionRecommendations: string;
    industryComparison: string;
    actionPlan: string;
    topRecommendation: string;
  } {
    // Simple parsing logic - in production, this could be more sophisticated
    const sections = reportContent.split('\n\n');
    
    return {
      executiveSummary: sections[0] || 'Executive summary section',
      currentEmissionsStatus: sections[1] || 'Current emissions status section',
      environmentalImpactAnalysis: sections[2] || 'Environmental impact analysis section',
      reductionRecommendations: sections[3] || 'Reduction recommendations section',
      industryComparison: sections[4] || 'Industry comparison section',
      actionPlan: sections[5] || 'Action plan section',
      topRecommendation: 'Switch to electric vehicles for workers with commutes over 20 miles',
    };
  }

  /**
   * Calculate potential CO2 savings from transport method improvements
   */
  private calculatePotentialSavings(workers: WorkerCO2Summary[]): number {
    return workers.reduce((total, worker) => {
      // Estimate savings if switched to electric
      if (worker.transportMethod !== 'electric') {
        const electricEmissions = worker.distanceMiles * 2 * 0.05 * 22; // Electric factor
        const currentEmissions = worker.monthlyCO2kg;
        const savings = Math.max(0, currentEmissions - electricEmissions);
        return total + savings;
      }
      return total;
    }, 0);
  }
}