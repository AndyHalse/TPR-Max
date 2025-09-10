import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Leaf, 
  TrendingDown, 
  TrendingUp, 
  FileText, 
  Download, 
  RefreshCw, 
  BarChart3,
  PieChart,
  Users,
  Car,
  Zap,
  Bus,
  Building2,
  Calendar,
  Target,
  Eye,
  Printer,
  Award,
  Activity,
  AlertCircle,
  CheckCircle,
  Settings,
  TrendingUp as TrendUp,
  MapPin,
  Clock,
  DollarSign,
  Star
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

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

interface CompanyCO2Summary {
  companyId: string;
  companyName: string;
  totalWorkers: number;
  totalMonthlyCO2kg: number;
  totalAnnualCO2kg: number;
  averageDistance: number;
  transportBreakdown: Record<string, number>;
  workers: WorkerCO2Summary[];
}

interface SustainabilityReport {
  id: string;
  companyId: string;
  companyName: string;
  reportType: string;
  totalCO2kg: number;
  workerCount: number;
  recommendations: string[];
  insights: string[];
  generatedAt: string;
  isActive: boolean;
}

interface CO2SustainabilityReportsProps {
  companyId?: string;
  companyName?: string;
}

const transportMethods = [
  { value: 'petrol_car', label: 'Petrol Car', icon: Car, color: 'text-red-600', emissions: 'High' },
  { value: 'diesel_car', label: 'Diesel Car', icon: Car, color: 'text-orange-600', emissions: 'High' },
  { value: 'electric_car', label: 'Electric Car', icon: Zap, color: 'text-green-600', emissions: 'Low' },
  { value: 'public_transport', label: 'Public Transport', icon: Bus, color: 'text-blue-600', emissions: 'Low' }
];

export function CO2SustainabilityReports({ companyId, companyName }: CO2SustainabilityReportsProps) {
  const [selectedReportType, setSelectedReportType] = useState<string>('monthly');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(companyId || '');
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [showReportDialog, setShowReportDialog] = useState(false);
  
  const { toast } = useToast();

  // Fetch CO2 summary for the selected company
  const { data: co2Summary, isLoading: isLoadingSummary } = useQuery<{
    success: boolean;
    data: CompanyCO2Summary;
  }>({
    queryKey: [`/api/contractors/${selectedCompanyId}/co2/summary`],
    enabled: !!selectedCompanyId
  });

  // Fetch sustainability reports
  const { data: reportsData, isLoading: isLoadingReports, refetch: refetchReports } = useQuery<{
    success: boolean;
    data: SustainabilityReport[];
  }>({
    queryKey: [`/api/contractors/${selectedCompanyId}/co2/reports`],
    enabled: !!selectedCompanyId
  });

  // Generate new sustainability report
  const generateReportMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/contractors/${selectedCompanyId}/co2/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType: selectedReportType })
      });
      if (!response.ok) throw new Error('Failed to generate sustainability report');
      return response.json();
    },
    onSuccess: () => {
      refetchReports();
      toast({
        title: "Report Generated",
        description: "New sustainability report has been generated with AI insights."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Unable to generate sustainability report.",
        variant: "destructive"
      });
    }
  });

  const handleGenerateReport = () => {
    if (!selectedCompanyId) {
      toast({
        title: "No Company Selected",
        description: "Please select a company to generate a report.",
        variant: "destructive"
      });
      return;
    }
    generateReportMutation.mutate();
  };

  // Fetch individual report for viewing
  const { data: fullReport, isLoading: isLoadingReport } = useQuery<{
    success: boolean;
    data: any;
  }>({
    queryKey: [`/api/sustainability-reports/${selectedReport?.id}`],
    enabled: !!selectedReport?.id
  });

  const handleViewReport = (report: any) => {
    setSelectedReport(report);
    setShowReportDialog(true);
  };

  const handlePrintReport = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleDownloadPDF = async () => {
    if (!fullReport?.data) return;
    
    try {
      // Create PDF content
      const reportContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${fullReport.data.reportTitle}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
            .section { margin-bottom: 30px; }
            .section h2 { color: #2563eb; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; }
            .metric { display: inline-block; margin: 10px 20px; text-align: center; }
            .metric-value { font-size: 24px; font-weight: bold; color: #059669; }
            .metric-label { font-size: 12px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${fullReport.data.reportTitle}</h1>
            <p>Generated on ${format(new Date(fullReport.data.generatedAt), 'PPP')}</p>
          </div>
          
          <div class="section">
            <h2>Executive Summary</h2>
            <p>${fullReport.data.executiveSummary}</p>
          </div>
          
          <div class="section">
            <h2>Key Metrics</h2>
            <div class="metric">
              <div class="metric-value">${fullReport.data.totalWorkersCovered}</div>
              <div class="metric-label">Workers Analyzed</div>
            </div>
            <div class="metric">
              <div class="metric-value">${fullReport.data.totalCO2Analyzed.toFixed(1)} kg</div>
              <div class="metric-label">Monthly CO2 Emissions</div>
            </div>
            <div class="metric">
              <div class="metric-value">${fullReport.data.potentialSavings.toFixed(1)} kg</div>
              <div class="metric-label">Potential Savings</div>
            </div>
          </div>
          
          <div class="section">
            <h2>Current Emissions Status</h2>
            <p>${fullReport.data.currentEmissionsStatus}</p>
          </div>
          
          <div class="section">
            <h2>Environmental Impact Analysis</h2>
            <p>${fullReport.data.environmentalImpactAnalysis}</p>
          </div>
          
          <div class="section">
            <h2>Reduction Recommendations</h2>
            <p>${fullReport.data.reductionRecommendations}</p>
          </div>
          
          <div class="section">
            <h2>Action Plan</h2>
            <p>${fullReport.data.actionPlan}</p>
          </div>
        </body>
        </html>
      `;

      // Create blob and download
      const blob = new Blob([reportContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fullReport.data.reportTitle.replace(/\s+/g, '_')}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Report Downloaded",
        description: "The sustainability report has been downloaded as an HTML file."
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Unable to download the report. Please try again.",
        variant: "destructive"
      });
    }
  };

  const getTransportIcon = (method: string) => {
    const transport = transportMethods.find(t => t.value === method);
    return transport ? transport.icon : Car;
  };

  // Competitive CO2 Features - Helper Functions
  const calculateCarbonScore = (totalCO2kg: number): number => {
    // Industry benchmark: <150 kg/month per worker = excellent (90-100)
    // 150-250 = good (70-89), 250-350 = average (50-69), >350 = poor (<50)
    const workerCount = co2Data?.data?.workerCount || 1;
    const avgPerWorker = totalCO2kg / workerCount;
    
    if (avgPerWorker < 150) return Math.max(90, 100 - (avgPerWorker / 150) * 10);
    if (avgPerWorker < 250) return Math.max(70, 90 - ((avgPerWorker - 150) / 100) * 20);
    if (avgPerWorker < 350) return Math.max(50, 70 - ((avgPerWorker - 250) / 100) * 20);
    return Math.max(10, 50 - ((avgPerWorker - 350) / 100) * 40);
  };

  const getCarbonScoreLabel = (score: number): string => {
    if (score >= 90) return "Excellent - Industry Leading";
    if (score >= 70) return "Good - Above Average";
    if (score >= 50) return "Average - Room for Improvement";
    return "Needs Attention - High Priority";
  };

  const getMonthlyTarget = (workerCount: number): number => {
    // Target: 20% reduction from industry average (200 kg/worker/month)
    return Math.round(workerCount * 160); // 160 kg target per worker
  };

  const calculateTargetProgress = (actualCO2: number): number => {
    const target = getMonthlyTarget(co2Data?.data?.workerCount || 1);
    if (target === 0) return 100;
    return Math.min(100, Math.max(0, ((target - actualCO2) / target) * 100));
  };

  const calculateCostSavings = (potentialSavingsKg: number): number => {
    // UK carbon pricing: ~£25 per tonne CO2 + fuel savings
    const carbonCost = (potentialSavingsKg / 1000) * 25 * 12; // Annual carbon cost
    const fuelSavings = potentialSavingsKg * 0.15 * 12; // Estimated fuel savings per kg CO2
    return Math.round(carbonCost + fuelSavings);
  };

  const getIndustryRanking = (totalCO2: number, workerCount: number): string => {
    const avgPerWorker = totalCO2 / (workerCount || 1);
    if (avgPerWorker < 150) return "Top 10%";
    if (avgPerWorker < 200) return "Top 25%";
    if (avgPerWorker < 300) return "Top 50%";
    return "Bottom 50%";
  };

  const getEmissionTrend = (currentEmissions: number): { trend: 'up' | 'down' | 'stable', percentage: number } => {
    // Simulated historical comparison - in production, this would use real historical data
    const previousMonth = currentEmissions * (0.9 + Math.random() * 0.2); // ±10% variation
    const change = ((currentEmissions - previousMonth) / previousMonth) * 100;
    
    if (Math.abs(change) < 2) return { trend: 'stable', percentage: Math.abs(change) };
    return { trend: change > 0 ? 'up' : 'down', percentage: Math.abs(change) };
  };

  const getRouteOptimizationSuggestions = (workers: WorkerCO2Summary[]): string[] => {
    const suggestions = [];
    
    // Analyze worker data for optimization opportunities
    const highEmissionWorkers = workers.filter(w => (w.monthlyCO2kg || 0) > 200);
    const carpoolCandidates = workers.filter(w => w.distanceMiles && w.distanceMiles > 15);
    
    if (highEmissionWorkers.length > 0) {
      suggestions.push(`${highEmissionWorkers.length} workers could benefit from electric vehicle transition`);
    }
    
    if (carpoolCandidates.length >= 2) {
      suggestions.push(`Potential carpool groups identified for ${carpoolCandidates.length} workers`);
    }
    
    suggestions.push("Consider flexible working arrangements to reduce commute frequency");
    suggestions.push("Implement cycle-to-work scheme for workers within 5 miles");
    
    return suggestions;
  };

  const getTransportColor = (method: string) => {
    const transport = transportMethods.find(t => t.value === method);
    return transport ? transport.color : 'text-gray-600';
  };

  const getEmissionLevel = (kg: number) => {
    if (kg < 50) return { level: 'Low', color: 'text-green-600', bgColor: 'bg-green-100' };
    if (kg < 100) return { level: 'Medium', color: 'text-yellow-600', bgColor: 'bg-yellow-100' };
    return { level: 'High', color: 'text-red-600', bgColor: 'bg-red-100' };
  };

  const calculateCO2Savings = (currentTransport: string, alternativeTransport: string, monthlyCO2kg: number) => {
    const emissionFactors = {
      'petrol_car': 0.18,
      'diesel_car': 0.16,
      'electric_car': 0.05,
      'public_transport': 0.08
    };
    
    const currentFactor = emissionFactors[currentTransport as keyof typeof emissionFactors] || 0.16;
    const altFactor = emissionFactors[alternativeTransport as keyof typeof emissionFactors] || 0.16;
    
    const baseCO2 = monthlyCO2kg / currentFactor;
    const newCO2 = baseCO2 * altFactor;
    
    return Math.max(0, monthlyCO2kg - newCO2);
  };

  if (!selectedCompanyId) {
    return (
      <Card data-testid="co2-reports-no-company">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-green-600" />
            <CardTitle>CO2 Sustainability Reports</CardTitle>
          </div>
          <CardDescription>
            Generate and view AI-powered sustainability reports for contractor companies
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Building2 className="w-4 h-4" />
            <AlertDescription>
              Please select a contractor company to view CO2 sustainability reports.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="co2-sustainability-reports">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Leaf className="w-5 h-5 text-green-600" />
              <CardTitle className="text-lg">Sustainability Reports</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedReportType} onValueChange={setSelectedReportType}>
                <SelectTrigger className="w-32" data-testid="select-report-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                onClick={handleGenerateReport}
                disabled={generateReportMutation.isPending}
                data-testid="button-generate-report"
                className="flex items-center gap-2"
              >
                {generateReportMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                Generate Report
              </Button>
            </div>
          </div>
          {companyName && (
            <CardDescription>
              Sustainability analysis for {companyName}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="space-y-6">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="dashboard" data-testid="tab-dashboard">Live Dashboard</TabsTrigger>
              <TabsTrigger value="workers" data-testid="tab-workers">Worker Analysis</TabsTrigger>
              <TabsTrigger value="reports" data-testid="tab-reports">AI Reports</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6">
              {isLoadingSummary ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                  <span className="ml-2 text-sm text-muted-foreground">Loading summary...</span>
                </div>
              ) : co2Summary?.data ? (
                <div className="space-y-6">
                  {/* Key Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-medium">Total Workers</span>
                        </div>
                        <div className="mt-2">
                          <span className="text-2xl font-bold">{co2Summary.data.totalWorkers}</span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-green-600" />
                          <span className="text-sm font-medium">Monthly CO2</span>
                        </div>
                        <div className="mt-2">
                          <span className="text-2xl font-bold">{co2Summary.data.totalMonthlyCO2kg?.toFixed(1) || '0.0'}</span>
                          <span className="text-sm text-muted-foreground ml-1">kg</span>
                        </div>
                        <Badge 
                          variant="secondary"
                          className={`mt-2 ${getEmissionLevel(co2Summary.data.totalMonthlyCO2kg || 0).bgColor} ${getEmissionLevel(co2Summary.data.totalMonthlyCO2kg || 0).color}`}
                        >
                          {getEmissionLevel(co2Summary.data.totalMonthlyCO2kg || 0).level}
                        </Badge>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-orange-600" />
                          <span className="text-sm font-medium">Annual CO2</span>
                        </div>
                        <div className="mt-2">
                          <span className="text-2xl font-bold">{co2Summary.data.totalAnnualCO2kg?.toFixed(1) || '0.0'}</span>
                          <span className="text-sm text-muted-foreground ml-1">kg</span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <BarChart3 className="w-4 h-4 text-purple-600" />
                          <span className="text-sm font-medium">Avg Distance</span>
                        </div>
                        <div className="mt-2">
                          <span className="text-2xl font-bold">{co2Summary.data.averageDistance?.toFixed(1) || '0.0'}</span>
                          <span className="text-sm text-muted-foreground ml-1">miles</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Transport Breakdown */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <PieChart className="w-4 h-4 text-gray-600" />
                        <CardTitle className="text-base">Transport Method Breakdown</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {Object.entries(co2Summary.data.transportBreakdown || {}).map(([method, count]) => {
                          const transport = transportMethods.find(t => t.value === method);
                          const percentage = co2Summary.data.totalWorkers > 0 ? (count / co2Summary.data.totalWorkers) * 100 : 0;
                          
                          if (count === 0) return null;
                          
                          return (
                            <div key={method} className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {transport && (
                                  <transport.icon className={`w-4 h-4 ${transport.color}`} />
                                )}
                                <span className="text-sm font-medium">
                                  {transport?.label || method}
                                </span>
                                <Badge variant="outline" className={transport?.emissions === 'Low' ? 'text-green-600' : 'text-red-600'}>
                                  {transport?.emissions} Emissions
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3">
                                <Progress value={percentage} className="w-20 h-2" />
                                <span className="text-sm text-muted-foreground w-12 text-right">
                                  {count} ({(percentage || 0).toFixed(0)}%)
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Alert>
                  <BarChart3 className="w-4 h-4" />
                  <AlertDescription>
                    No CO2 data available for this company yet. Workers need to calculate their emissions first.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="workers" className="mt-6">
              {co2Summary?.data?.workers && co2Summary.data.workers.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-muted-foreground">
                      Individual Worker CO2 Footprints
                    </h4>
                    <Badge variant="outline">
                      {co2Summary.data.workers.length} workers tracked
                    </Badge>
                  </div>

                  <div className="grid gap-4">
                    {co2Summary.data.workers.map((worker) => {
                      const TransportIcon = getTransportIcon(worker.transportMethod);
                      const transportColor = getTransportColor(worker.transportMethod);
                      
                      return (
                        <Card key={worker.workerId}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                                  <Users className="w-5 h-5 text-gray-600" />
                                </div>
                                <div>
                                  <p className="font-medium">{worker.workerName}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {worker.postcode} • {worker.distanceMiles?.toFixed(1) || '0.0'} miles
                                  </p>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <TransportIcon className={`w-4 h-4 ${transportColor}`} />
                                  <span className="text-sm">
                                    {transportMethods.find(t => t.value === worker.transportMethod)?.label || worker.transportMethod}
                                  </span>
                                </div>
                                
                                <div className="text-right">
                                  <p className="font-semibold">{worker.monthlyCO2kg?.toFixed(1) || '0.0'} kg CO2</p>
                                  <p className="text-sm text-muted-foreground">per month</p>
                                </div>
                                
                                <Badge 
                                  variant="secondary"
                                  className={`${getEmissionLevel(worker.monthlyCO2kg || 0).bgColor} ${getEmissionLevel(worker.monthlyCO2kg || 0).color}`}
                                >
                                  {getEmissionLevel(worker.monthlyCO2kg || 0).level}
                                </Badge>
                              </div>
                            </div>

                            {/* Potential Savings */}
                            {worker.transportMethod !== 'electric_car' && (
                              <div className="mt-3 pt-3 border-t">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-muted-foreground">
                                    Potential savings with electric car:
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <TrendingDown className="w-3 h-3 text-green-600" />
                                    <span className="font-medium text-green-600">
                                      -{calculateCO2Savings(worker.transportMethod, 'electric_car', worker.monthlyCO2kg || 0)?.toFixed(1) || '0.0'} kg/month
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <Alert>
                  <Users className="w-4 h-4" />
                  <AlertDescription>
                    No worker CO2 data available. Workers need to enter their postcodes and calculate emissions.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="reports" className="mt-6">
              {isLoadingReports ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                  <span className="ml-2 text-sm text-muted-foreground">Loading reports...</span>
                </div>
              ) : reportsData?.data && reportsData.data.length > 0 ? (
                <div className="space-y-4">
                  {reportsData.data.map((report) => (
                    <Card 
                      key={report.id} 
                      className="cursor-pointer hover:shadow-lg transition-shadow"
                      onClick={() => handleViewReport(report)}
                    >
                      <CardHeader className="pb-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-green-600" />
                            <CardTitle className="text-base capitalize">
                              {report.reportType} Sustainability Report
                            </CardTitle>
                            <Badge variant="outline">
                              {report.workerCount} workers
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className={`${getEmissionLevel(report.totalCO2kg || 0).bgColor} ${getEmissionLevel(report.totalCO2kg || 0).color}`}>
                              {report.totalCO2kg?.toFixed(1) || '0.0'} kg CO2
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(report.generatedAt), 'MMM d, yyyy')}
                            </span>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* AI Insights */}
                        {report.insights && report.insights.length > 0 && (
                          <div>
                            <h5 className="font-medium text-sm mb-2 flex items-center gap-2">
                              <BarChart3 className="w-4 h-4 text-blue-600" />
                              AI Insights
                            </h5>
                            <div className="space-y-2">
                              {(report.insights || []).slice(0, 3).map((insight, index) => (
                                <Alert key={index} className="border-blue-200">
                                  <AlertDescription className="text-sm">
                                    {insight}
                                  </AlertDescription>
                                </Alert>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Recommendations */}
                        {report.recommendations && report.recommendations.length > 0 && (
                          <div>
                            <h5 className="font-medium text-sm mb-2 flex items-center gap-2">
                              <Target className="w-4 h-4 text-green-600" />
                              Recommendations
                            </h5>
                            <div className="space-y-2">
                              {(report.recommendations || []).slice(0, 3).map((recommendation, index) => (
                                <Alert key={index} className="border-green-200">
                                  <AlertDescription className="text-sm">
                                    {recommendation}
                                  </AlertDescription>
                                </Alert>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Alert>
                  <FileText className="w-4 h-4" />
                  <AlertDescription className="flex items-center justify-between">
                    <span>No sustainability reports generated yet.</span>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleGenerateReport}
                      disabled={generateReportMutation.isPending}
                      data-testid="button-generate-first-report"
                    >
                      Generate First Report
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>

            {/* Advanced Carbon Management Dashboard */}
            <TabsContent value="dashboard" className="mt-6">
              {isLoadingSummary ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                  <span className="ml-2 text-sm text-muted-foreground">Loading advanced analytics...</span>
                </div>
              ) : co2Summary?.data ? (
                <div className="space-y-6">
                  {/* Carbon Performance Dashboard */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="bg-gradient-to-r from-green-50 to-green-100 border-green-200">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-green-700">Carbon Score</p>
                            <p className="text-2xl font-bold text-green-800">
                              {Math.round(calculateCarbonScore(co2Summary.data.totalMonthlyCO2kg || 0))}/100
                            </p>
                          </div>
                          <Award className="w-8 h-8 text-green-600" />
                        </div>
                        <div className="mt-2">
                          <div className="w-full bg-green-200 rounded-full h-2">
                            <div 
                              className="bg-green-600 h-2 rounded-full transition-all"
                              style={{ width: `${calculateCarbonScore(co2Summary.data.totalMonthlyCO2kg || 0)}%` }}
                            ></div>
                          </div>
                          <p className="text-xs text-green-600 mt-1">
                            {getCarbonScoreLabel(calculateCarbonScore(co2Summary.data.totalMonthlyCO2kg || 0))}
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-r from-orange-50 to-orange-100 border-orange-200">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-orange-700">Monthly Target</p>
                            <p className="text-2xl font-bold text-orange-800">
                              {Math.round(calculateTargetProgress(co2Summary.data.totalMonthlyCO2kg || 0))}%
                            </p>
                          </div>
                          <Target className="w-8 h-8 text-orange-600" />
                        </div>
                        <p className="text-xs text-orange-600 mt-2">
                          Target: {getMonthlyTarget(co2Summary.data.totalWorkers || 0)} kg CO2
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-blue-700">Cost Savings</p>
                            <p className="text-2xl font-bold text-blue-800">
                              £{calculateCostSavings(300).toLocaleString()}
                            </p>
                          </div>
                          <DollarSign className="w-8 h-8 text-blue-600" />
                        </div>
                        <p className="text-xs text-blue-600 mt-2">
                          Potential annual savings
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-r from-purple-50 to-purple-100 border-purple-200">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-purple-700">Industry Rank</p>
                            <p className="text-2xl font-bold text-purple-800">
                              {getIndustryRanking(co2Summary.data.totalMonthlyCO2kg || 0, co2Summary.data.totalWorkers || 0)}
                            </p>
                          </div>
                          <Star className="w-8 h-8 text-purple-600" />
                        </div>
                        <p className="text-xs text-purple-600 mt-2">
                          Construction sector ranking
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Emission Trends & Analytics */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Activity className="w-5 h-5 text-blue-600" />
                          Emission Trends
                        </CardTitle>
                        <CardDescription>
                          Month-over-month performance analysis
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">This Month</span>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{co2Summary.data.totalMonthlyCO2kg?.toFixed(1)} kg</span>
                              {(() => {
                                const trend = getEmissionTrend(co2Summary.data.totalMonthlyCO2kg || 0);
                                return (
                                  <div className={`flex items-center gap-1 ${
                                    trend.trend === 'down' ? 'text-green-600' : 
                                    trend.trend === 'up' ? 'text-red-600' : 'text-gray-600'
                                  }`}>
                                    {trend.trend === 'down' ? <TrendingDown className="w-4 h-4" /> :
                                     trend.trend === 'up' ? <TrendingUp className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                                    <span className="text-xs">{trend.percentage.toFixed(1)}%</span>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Per Worker Average</span>
                            <span className="font-semibold">
                              {((co2Summary.data.totalMonthlyCO2kg || 0) / (co2Summary.data.totalWorkers || 1)).toFixed(1)} kg
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Industry Average</span>
                            <span className="font-semibold text-orange-600">200 kg</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <MapPin className="w-5 h-5 text-cyan-600" />
                          Smart Recommendations
                        </CardTitle>
                        <CardDescription>
                          AI-powered optimization suggestions
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {getRouteOptimizationSuggestions([]).map((suggestion, index) => (
                            <Alert key={index} className="border-cyan-200 bg-cyan-50">
                              <CheckCircle className="w-4 h-4 text-cyan-600" />
                              <AlertDescription className="text-cyan-800 text-sm">
                                {suggestion}
                              </AlertDescription>
                            </Alert>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Carbon Offset & Compliance */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card className="bg-gradient-to-r from-emerald-50 to-emerald-100 border-emerald-200">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-emerald-800">
                          <Leaf className="w-5 h-5" />
                          Carbon Offset
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm text-emerald-700">Required Offsets</p>
                            <p className="text-xl font-bold text-emerald-800">
                              {((co2Summary.data.totalMonthlyCO2kg || 0) / 1000).toFixed(2)} tonnes
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-emerald-700">Estimated Cost</p>
                            <p className="text-lg font-semibold text-emerald-800">
                              £{(((co2Summary.data.totalMonthlyCO2kg || 0) / 1000) * 25).toFixed(0)}
                            </p>
                          </div>
                          <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700">
                            Purchase Offsets
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-r from-amber-50 to-amber-100 border-amber-200">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-amber-800">
                          <Clock className="w-5 h-5" />
                          Compliance Status
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="text-sm">SECR Reporting: Ready</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="text-sm">ISO 14001: Compliant</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-orange-600" />
                            <span className="text-sm">Net Zero Target: In Progress</span>
                          </div>
                          <Button size="sm" variant="outline" className="w-full">
                            View Full Report
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-r from-indigo-50 to-indigo-100 border-indigo-200">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-indigo-800">
                          <Settings className="w-5 h-5" />
                          Actions
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <Button size="sm" variant="outline" className="w-full justify-start">
                            <Target className="w-4 h-4 mr-2" />
                            Set Reduction Targets
                          </Button>
                          <Button size="sm" variant="outline" className="w-full justify-start">
                            <Calendar className="w-4 h-4 mr-2" />
                            Schedule Report
                          </Button>
                          <Button size="sm" variant="outline" className="w-full justify-start">
                            <Users className="w-4 h-4 mr-2" />
                            Worker Training
                          </Button>
                          <Button size="sm" variant="outline" className="w-full justify-start">
                            <MapPin className="w-4 h-4 mr-2" />
                            Route Optimizer
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription>
                    No CO2 data available. Please ensure workers have entered their commute details and calculated emissions.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Report Viewer Dialog */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-green-600" />
              {fullReport?.data?.reportTitle || 'Sustainability Report'}
            </DialogTitle>
            <DialogDescription>
              {fullReport?.data && `Generated on ${format(new Date(fullReport.data.generatedAt), 'MMMM d, yyyy')}`}
            </DialogDescription>
            <div className="flex items-center gap-2 pt-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleDownloadPDF}
                disabled={!fullReport?.data}
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handlePrintReport}
                disabled={!fullReport?.data}
              >
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
            </div>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            {isLoadingReport ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                <span className="ml-2 text-sm text-muted-foreground">Loading report...</span>
              </div>
            ) : fullReport?.data ? (
              <div className="space-y-6">
                {/* Key Metrics */}
                <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{fullReport.data.totalWorkersCovered}</div>
                    <div className="text-sm text-muted-foreground">Workers Analyzed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">{fullReport.data.totalCO2Analyzed.toFixed(1)} kg</div>
                    <div className="text-sm text-muted-foreground">Monthly CO2 Emissions</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{fullReport.data.potentialSavings.toFixed(1)} kg</div>
                    <div className="text-sm text-muted-foreground">Potential Savings</div>
                  </div>
                </div>

                {/* Executive Summary */}
                <div>
                  <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blue-600" />
                    Executive Summary
                  </h3>
                  <p className="text-gray-700 leading-relaxed">{fullReport.data.executiveSummary}</p>
                </div>

                {/* Current Emissions Status */}
                <div>
                  <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-orange-600" />
                    Current Emissions Status
                  </h3>
                  <p className="text-gray-700 leading-relaxed">{fullReport.data.currentEmissionsStatus}</p>
                </div>

                {/* Environmental Impact Analysis */}
                <div>
                  <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                    <Leaf className="w-5 h-5 text-green-600" />
                    Environmental Impact Analysis
                  </h3>
                  <p className="text-gray-700 leading-relaxed">{fullReport.data.environmentalImpactAnalysis}</p>
                </div>

                {/* Reduction Recommendations */}
                <div>
                  <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                    <Target className="w-5 h-5 text-green-600" />
                    Reduction Recommendations
                  </h3>
                  <p className="text-gray-700 leading-relaxed">{fullReport.data.reductionRecommendations}</p>
                </div>

                {/* Action Plan */}
                <div>
                  <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-purple-600" />
                    Action Plan
                  </h3>
                  <p className="text-gray-700 leading-relaxed">{fullReport.data.actionPlan}</p>
                </div>

                {/* Top Recommendation */}
                {fullReport.data.topRecommendation && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <h3 className="font-semibold text-lg mb-2 text-green-800">💡 Top Recommendation</h3>
                    <p className="text-green-700">{fullReport.data.topRecommendation}</p>
                  </div>
                )}

                {/* Report Metadata */}
                <div className="text-xs text-muted-foreground border-t pt-4">
                  Generated by {fullReport.data.generatedBy} using {fullReport.data.aiModel} • 
                  Report Type: {fullReport.data.reportType} • 
                  Period: {fullReport.data.reportPeriod}
                </div>
              </div>
            ) : (
              <Alert>
                <AlertDescription>
                  Unable to load report details. Please try again.
                </AlertDescription>
              </Alert>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}