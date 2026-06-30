import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  MapPin,
  Clock,
  DollarSign,
  Star
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

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
  workersWithCO2: number;
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
  { value: 'car_petrol', label: 'Petrol Car', icon: Car, color: 'text-red-600', emissions: 'High' },
  { value: 'car_diesel', label: 'Diesel Car', icon: Car, color: 'text-orange-600', emissions: 'High' },
  { value: 'electric', label: 'Electric Car', icon: Zap, color: 'text-green-600', emissions: 'Low' },
  { value: 'public_transport', label: 'Public Transport', icon: Bus, color: 'text-blue-600', emissions: 'Low' }
];

export function CO2SustainabilityReports({ companyId, companyName }: CO2SustainabilityReportsProps) {
  const [selectedReportType, setSelectedReportType] = useState<string>('monthly');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(companyId || '');
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [showTargetDialog, setShowTargetDialog] = useState(false);
  const [customTarget, setCustomTarget] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [showOffsetDialog, setShowOffsetDialog] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<any>(null);
  const [showWorkerDialog, setShowWorkerDialog] = useState(false);
  
  const { toast } = useToast();

  // Fetch CO2 summary for the selected company
  const { data: co2Summary, isLoading: isLoadingSummary } = useQuery<{
    success: boolean;
    data: CompanyCO2Summary;
  }>({
    queryKey: [`/api/contractors/${selectedCompanyId}/co2/summary`],
    enabled: !!selectedCompanyId
  });

  // Pre-flight: fetch all workers for this company to check postcodes + transport methods
  const { data: companyWorkersRaw } = useQuery<any[]>({
    queryKey: [`/api/contractors/${selectedCompanyId}/workers`],
    enabled: !!selectedCompanyId
  });

  // Pre-flight: fetch company settings to check if address is configured
  const { data: companySettingsRaw } = useQuery<any>({
    queryKey: ['/api/settings'],
    enabled: !!selectedCompanyId
  });

  const companyAddress = companySettingsRaw?.address || companySettingsRaw?.companySettings?.address || '';
  const companyWorkers: any[] = Array.isArray(companyWorkersRaw) ? companyWorkersRaw : [];
  const workersWithPostcode = companyWorkers.filter(w => w.postcode?.trim());
  const workersWithoutPostcode = companyWorkers.filter(w => !w.postcode?.trim());

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
      return await apiRequest('POST', `/api/contractors/${selectedCompanyId}/co2/report`, {
        reportType: selectedReportType
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${selectedCompanyId}/co2/reports`] });
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

  // Calculate CO2 for all workers
  const calculateCO2Mutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/contractors/${selectedCompanyId}/co2/calculate-all`, {});
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${selectedCompanyId}/co2/summary`] });
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${selectedCompanyId}/co2/reports`] });
      const successCount = response?.data?.successCount || response?.successCount || 0;
      toast({
        title: "CO2 Calculated",
        description: `Successfully calculated CO2 emissions for ${successCount} workers.`
      });
    },
    onError: (error: any) => {
      const isAddressError = error.status === 400 && (
        (error.message || "").toLowerCase().includes("address") ||
        (error.error || "").toLowerCase().includes("address")
      );
      toast({
        title: isAddressError ? "Company Address Required" : "Calculation Failed",
        description: isAddressError
          ? "Your company address is not configured. Go to Settings → Company Settings and add your site address, then try again."
          : (error.message || "Unable to calculate CO2 emissions."),
        variant: "destructive"
      });
    }
  });

  const handleCalculateCO2 = () => {
    if (!selectedCompanyId) {
      toast({
        title: "No Company Selected",
        description: "Please select a company to calculate CO2.",
        variant: "destructive"
      });
      return;
    }
    calculateCO2Mutation.mutate();
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
  const calculateCarbonScore = (totalCO2kg: number, workerCount?: number): number => {
    // Industry benchmark: <150 kg/month per worker = excellent (90-100)
    // 150-250 = good (70-89), 250-350 = average (50-69), >350 = poor (<50)
    const workers = workerCount || co2Summary?.data?.totalWorkers || 1;
    const avgPerWorker = totalCO2kg / workers;
    
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

  const calculateTargetProgress = (actualCO2: number, workerCount?: number): number => {
    const workers = workerCount || co2Summary?.data?.totalWorkers || 1;
    const target = getMonthlyTarget(workers);
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
    return transport ? transport.color : 'text-variable';
  };

  const getEmissionLevel = (kg: number) => {
    if (kg < 50) return { level: 'Low', color: 'text-green-600', bgColor: 'bg-green-100' };
    if (kg < 100) return { level: 'Medium', color: 'text-yellow-600', bgColor: 'bg-yellow-100' };
    return { level: 'High', color: 'text-red-600', bgColor: 'bg-red-100' };
  };

  const calculateCO2Savings = (currentTransport: string, alternativeTransport: string, monthlyCO2kg: number) => {
    // UK Government 2024/2025 emission factors (kg CO2 per mile)
    const emissionFactors = {
      'car_petrol': 0.268,
      'car_diesel': 0.257,
      'electric': 0.047,
      'public_transport': 0.103,
      'motorcycle': 0.186
    };
    
    const currentFactor = emissionFactors[currentTransport as keyof typeof emissionFactors] || 0.257;
    const altFactor = emissionFactors[alternativeTransport as keyof typeof emissionFactors] || 0.257;
    
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
                onClick={handleCalculateCO2}
                disabled={calculateCO2Mutation.isPending}
                data-testid="button-calculate-co2"
                variant="outline"
                className="flex items-center gap-2"
              >
                {calculateCO2Mutation.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Activity className="w-4 h-4" />
                )}
                Calculate CO2
              </Button>
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
          {/* Pre-flight readiness check */}
          {selectedCompanyId && (() => {
            if (!companyAddress) {
              return (
                <Alert className="border-red-200 bg-red-50">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    <strong>Company address not configured.</strong> CO2 calculations require your site address to measure commute distances. Go to <strong>Settings → Company Details</strong> and add your address.
                  </AlertDescription>
                </Alert>
              );
            }
            if (companyWorkers.length > 0 && workersWithoutPostcode.length > 0) {
              return (
                <Alert className="border-amber-200 bg-amber-50">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800">
                    <strong>{workersWithoutPostcode.length} worker{workersWithoutPostcode.length > 1 ? 's' : ''} missing home postcode</strong> — CO2 calculations need each worker's home postcode.
                    {workersWithPostcode.length > 0 && <> {workersWithPostcode.length} worker{workersWithPostcode.length > 1 ? 's are' : ' is'} ready to calculate.</>}
                    {' '}Edit the worker profiles to add postcodes, then click <strong>Calculate CO2</strong>.
                  </AlertDescription>
                </Alert>
              );
            }
            if (companyWorkers.length > 0 && workersWithPostcode.length === companyWorkers.length) {
              const allCalculated = co2Summary?.data?.workersWithCO2 === companyWorkers.length;
              if (!allCalculated) {
                return (
                  <Alert className="border-blue-200 bg-blue-50">
                    <CheckCircle className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800">
                      <strong>All {companyWorkers.length} workers have postcodes set</strong> and are ready for CO2 calculation. Click <strong>Calculate CO2</strong> to generate emissions data.
                    </AlertDescription>
                  </Alert>
                );
              }
            }
            return null;
          })()}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
                        {co2Summary.data.workersWithCO2 !== undefined && co2Summary.data.workersWithCO2 < co2Summary.data.totalWorkers && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {co2Summary.data.workersWithCO2} of {co2Summary.data.totalWorkers} calculated
                          </p>
                        )}
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

                  {/* Transport Breakdown with Pie Chart */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <PieChart className="w-4 h-4 text-variable" />
                        <CardTitle className="text-base">Transport Method Breakdown</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Pie Chart Visualization */}
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <RechartsPie>
                              <Pie
                                data={Object.entries(co2Summary.data.transportBreakdown || {})
                                  .filter(([_, count]) => count > 0)
                                  .map(([method, count]) => {
                                    const transport = transportMethods.find(t => t.value === method);
                                    return {
                                      name: transport?.label || method,
                                      value: count,
                                      method: method
                                    };
                                  })}
                                cx="50%"
                                cy="50%"
                                innerRadius={45}
                                outerRadius={75}
                                paddingAngle={3}
                                dataKey="value"
                                label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                                labelLine={false}
                              >
                                {Object.entries(co2Summary.data.transportBreakdown || {})
                                  .filter(([_, count]) => count > 0)
                                  .map(([method], index) => (
                                    <Cell 
                                      key={`cell-${index}`} 
                                      fill={method === 'car_petrol' ? '#dc2626' : 
                                            method === 'car_diesel' ? '#ea580c' : 
                                            method === 'electric' ? '#16a34a' : 
                                            method === 'public_transport' ? '#2563eb' :
                                            method === 'motorcycle' ? '#7c3aed' : '#6b7280'}
                                      stroke="#fff"
                                      strokeWidth={2}
                                    />
                                  ))}
                              </Pie>
                              <Tooltip 
                                formatter={(value: number, name: string) => [`${value} workers`, name]}
                                contentStyle={{ 
                                  backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                                  borderRadius: '8px',
                                  border: '1px solid #e5e7eb'
                                }}
                              />
                              <Legend 
                                verticalAlign="bottom" 
                                height={36}
                                formatter={(value) => <span className="text-xs">{value}</span>}
                              />
                            </RechartsPie>
                          </ResponsiveContainer>
                        </div>
                        
                        {/* Details List */}
                        <div className="space-y-3">
                          {Object.entries(co2Summary.data.transportBreakdown || {}).map(([method, count]) => {
                            const transport = transportMethods.find(t => t.value === method);
                            const percentage = co2Summary.data.totalWorkers > 0 ? (count / co2Summary.data.totalWorkers) * 100 : 0;
                            
                            if (count === 0) return null;
                            
                            return (
                              <div key={method} className="flex items-center justify-between p-3 rounded-lg bg-white/60 hover:bg-white/80 transition-colors">
                                <div className="flex items-center gap-3">
                                  <div 
                                    className="w-3 h-3 rounded-full"
                                    style={{ 
                                      backgroundColor: method === 'car_petrol' ? '#dc2626' : 
                                                       method === 'car_diesel' ? '#ea580c' : 
                                                       method === 'electric' ? '#16a34a' : 
                                                       method === 'public_transport' ? '#2563eb' :
                                                       method === 'motorcycle' ? '#7c3aed' : '#6b7280'
                                    }}
                                  />
                                  {transport && (
                                    <transport.icon className={`w-4 h-4 ${transport.color}`} />
                                  )}
                                  <span className="text-sm font-medium">
                                    {transport?.label || method}
                                  </span>
                                  <Badge 
                                    variant="outline" 
                                    className={transport?.emissions === 'Low' ? 'text-green-600 border-green-300 bg-green-50' : 'text-red-600 border-red-300 bg-red-50'}
                                  >
                                    {transport?.emissions || 'Medium'}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-3">
                                  <Progress value={percentage} className="w-16 h-2" />
                                  <span className="text-sm font-bold w-16 text-right">
                                    {count} ({(percentage || 0).toFixed(0)}%)
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
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
                        <Card 
                          key={worker.workerId} 
                          className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-green-500"
                          onClick={() => {
                            setSelectedWorker(worker);
                            setShowWorkerDialog(true);
                          }}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-[var(--background)] rounded-full flex items-center justify-center">
                                  <Users className="w-5 h-5 text-variable" />
                                </div>
                                <div>
                                  <p className="font-medium">{worker.workerName}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {worker.postcode} • {worker.distanceMiles?.toFixed(1) || '0.0'} miles
                                  </p>
                                  <p className="text-xs text-blue-600 mt-1">Click for detailed analysis</p>
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
                            {worker.transportMethod !== 'electric' && (
                              <div className="mt-3 pt-3 border-t">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-muted-foreground">
                                    Potential savings with electric car:
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <TrendingDown className="w-3 h-3 text-green-600" />
                                    <span className="font-medium text-green-600">
                                      -{calculateCO2Savings(worker.transportMethod, 'electric', worker.monthlyCO2kg || 0)?.toFixed(1) || '0.0'} kg/month
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
                              {Math.round(calculateCarbonScore(co2Summary.data.totalMonthlyCO2kg || 0, co2Summary.data.totalWorkers))}/100
                            </p>
                          </div>
                          <Award className="w-8 h-8 text-green-600" />
                        </div>
                        <div className="mt-2">
                          <div className="w-full bg-green-200 rounded-full h-2">
                            <div 
                              className="bg-green-600 h-2 rounded-full transition-all"
                              style={{ width: `${calculateCarbonScore(co2Summary.data.totalMonthlyCO2kg || 0, co2Summary.data.totalWorkers)}%` }}
                            ></div>
                          </div>
                          <p className="text-xs text-green-600 mt-1">
                            {getCarbonScoreLabel(calculateCarbonScore(co2Summary.data.totalMonthlyCO2kg || 0, co2Summary.data.totalWorkers))}
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card 
                      className="bg-gradient-to-r from-orange-50 to-orange-100 border-orange-200 cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => {
                        setCustomTarget(getMonthlyTarget(co2Summary.data.totalWorkers || 0));
                        setShowTargetDialog(true);
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-orange-700">Monthly Target</p>
                            <p className="text-2xl font-bold text-orange-800">
                              {Math.round(calculateTargetProgress(co2Summary.data.totalMonthlyCO2kg || 0, co2Summary.data.totalWorkers))}%
                            </p>
                          </div>
                          <Target className="w-8 h-8 text-orange-600" />
                        </div>
                        <p className="text-xs text-orange-600 mt-2">
                          Target: {getMonthlyTarget(co2Summary.data.totalWorkers || 0)} kg CO2
                        </p>
                        <p className="text-xs text-orange-500 mt-1">Click to customize</p>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-blue-700">Potential Savings</p>
                            <p className="text-2xl font-bold text-blue-800">
                              £{(() => {
                                const totalPotentialSavingsKg = (co2Summary.data.workers || [])
                                  .filter(w => w.transportMethod !== 'electric' && w.transportMethod !== 'bicycle' && w.transportMethod !== 'walking')
                                  .reduce((sum, w) => sum + calculateCO2Savings(w.transportMethod, 'electric', w.monthlyCO2kg || 0), 0);
                                return calculateCostSavings(totalPotentialSavingsKg).toLocaleString();
                              })()}
                            </p>
                          </div>
                          <DollarSign className="w-8 h-8 text-blue-600" />
                        </div>
                        <p className="text-xs text-blue-600 mt-2">
                          If all petrol/diesel workers switched to electric
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
                            <span className="font-semibold">{co2Summary.data.totalMonthlyCO2kg?.toFixed(1)} kg CO2</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Per Worker Average</span>
                            <span className="font-semibold">
                              {((co2Summary.data.totalMonthlyCO2kg || 0) / (co2Summary.data.totalWorkers || 1)).toFixed(1)} kg
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">UK Construction Average</span>
                            <span className="font-semibold text-orange-600">200 kg / worker</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">vs Industry</span>
                            {(() => {
                              const perWorker = (co2Summary.data.totalMonthlyCO2kg || 0) / (co2Summary.data.totalWorkers || 1);
                              const diff = perWorker - 200;
                              return diff <= 0 ? (
                                <span className="font-semibold text-green-600 flex items-center gap-1">
                                  <TrendingDown className="w-4 h-4" />
                                  {Math.abs(diff).toFixed(1)} kg below average
                                </span>
                              ) : (
                                <span className="font-semibold text-red-600 flex items-center gap-1">
                                  <TrendingUp className="w-4 h-4" />
                                  {diff.toFixed(1)} kg above average
                                </span>
                              );
                            })()}
                          </div>
                          <p className="text-xs text-muted-foreground pt-1 border-t">
                            Month-over-month trend will appear after your second monthly calculation.
                          </p>
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
                          {getRouteOptimizationSuggestions(co2Summary.data.workers || []).map((suggestion, index) => (
                            <Alert key={index} className="border-cyan-200 bg-cyan-50">
                              <CheckCircle className="w-4 h-4 text-cyan-600" />
                              <AlertDescription className="text-cyan-800 text-sm">
                                {suggestion}
                              </AlertDescription>
                            </Alert>
                          ))}
                          {(co2Summary.data.workers || []).length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              Calculate CO2 for workers to see personalised recommendations.
                            </p>
                          )}
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
                              {((co2Summary.data.totalAnnualCO2kg || 0) / 1000).toFixed(2)} tonnes
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-emerald-700">Estimated Cost</p>
                            <p className="text-lg font-semibold text-emerald-800">
                              £{(((co2Summary.data.totalAnnualCO2kg || 0) / 1000) * 25).toFixed(0)}
                            </p>
                          </div>
                          <Button 
                            size="sm" 
                            className="w-full bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => setShowOffsetDialog(true)}
                          >
                            <Leaf className="w-4 h-4 mr-2" />
                            UK Carbon Offset Schemes
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
                          {(() => {
                            const hasData = (co2Summary?.data?.totalWorkers || 0) > 0;
                            const targetProgress = calculateTargetProgress(co2Summary?.data?.totalMonthlyCO2kg || 0, co2Summary?.data?.totalWorkers);
                            const netZeroProgress = targetProgress >= 70 ? "On Track" : targetProgress >= 30 ? "In Progress" : "Behind Target";
                            
                            return (
                              <>
                                <div className="flex items-center gap-2">
                                  {hasData ? (
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <AlertCircle className="w-4 h-4 text-orange-600" />
                                  )}
                                  <span className="text-sm text-amber-900">
                                    SECR Scope 3: {hasData ? 'Data Collected' : 'Data Required'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {hasData ? (
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <AlertCircle className="w-4 h-4 text-orange-600" />
                                  )}
                                  <span className="text-sm text-amber-900">
                                    ISO 14001: {hasData ? 'Emissions Monitored' : 'Monitoring Required'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {netZeroProgress === "On Track" ? (
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                  ) : netZeroProgress === "In Progress" ? (
                                    <AlertCircle className="w-4 h-4 text-orange-600" />
                                  ) : (
                                    <AlertCircle className="w-4 h-4 text-red-600" />
                                  )}
                                  <span className="text-sm text-amber-900">Net Zero 2050: {netZeroProgress}</span>
                                </div>
                              </>
                            );
                          })()}
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="w-full border-amber-400 text-amber-900 hover:bg-amber-200"
                            onClick={() => setActiveTab('reports')}
                          >
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
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="w-full justify-start"
                            onClick={() => {
                              setCustomTarget(getMonthlyTarget(co2Summary?.data?.totalWorkers || 0));
                              setShowTargetDialog(true);
                            }}
                          >
                            <Target className="w-4 h-4 mr-2" />
                            Set Reduction Targets
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="w-full justify-start"
                            onClick={() => setActiveTab('reports')}
                          >
                            <Calendar className="w-4 h-4 mr-2" />
                            Generate AI Report
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="w-full justify-start"
                            onClick={() => setActiveTab('workers')}
                          >
                            <Users className="w-4 h-4 mr-2" />
                            View Worker Analysis
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="w-full justify-start"
                            onClick={() => {
                              window.open('https://www.gov.uk/guidance/transport-emissions-a-guide-to-reducing-your-carbon-footprint', '_blank', 'noopener,noreferrer');
                            }}
                          >
                            <MapPin className="w-4 h-4 mr-2" />
                            UK Transport Guidance
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
                <div className="grid grid-cols-3 gap-4 p-4 bg-[var(--background)] rounded-lg">
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
                  <p className="text-variable leading-relaxed">{fullReport.data.executiveSummary}</p>
                </div>

                {/* Current Emissions Status */}
                <div>
                  <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-orange-600" />
                    Current Emissions Status
                  </h3>
                  <p className="text-variable leading-relaxed">{fullReport.data.currentEmissionsStatus}</p>
                </div>

                {/* Environmental Impact Analysis */}
                <div>
                  <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                    <Leaf className="w-5 h-5 text-green-600" />
                    Environmental Impact Analysis
                  </h3>
                  <p className="text-variable leading-relaxed">{fullReport.data.environmentalImpactAnalysis}</p>
                </div>

                {/* Reduction Recommendations */}
                <div>
                  <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                    <Target className="w-5 h-5 text-green-600" />
                    Reduction Recommendations
                  </h3>
                  <p className="text-variable leading-relaxed">{fullReport.data.reductionRecommendations}</p>
                </div>

                {/* Action Plan */}
                <div>
                  <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-purple-600" />
                    Action Plan
                  </h3>
                  <p className="text-variable leading-relaxed">{fullReport.data.actionPlan}</p>
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

      {/* Target Setting Dialog */}
      <Dialog open={showTargetDialog} onOpenChange={setShowTargetDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-orange-600" />
              Set Monthly CO2 Target
            </DialogTitle>
            <DialogDescription>
              Set a custom monthly CO2 reduction target for {companyName || 'this company'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="target-input">Monthly CO2 Target (kg)</Label>
              <Input
                id="target-input"
                type="number"
                value={customTarget}
                onChange={(e) => setCustomTarget(Number(e.target.value))}
                placeholder="Enter target in kg CO2 per month"
              />
              <p className="text-sm text-muted-foreground">
                Current emissions: {co2Summary?.data?.totalMonthlyCO2kg?.toFixed(1) || '0'} kg/month
              </p>
              <p className="text-sm text-muted-foreground">
                Suggested target (20% reduction): {getMonthlyTarget(co2Summary?.data?.totalWorkers || 0)} kg/month
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  toast({
                    title: "Target Updated",
                    description: `Monthly CO2 target set to ${customTarget} kg for ${companyName}`,
                  });
                  setShowTargetDialog(false);
                }}
                className="flex-1"
              >
                Save Target
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowTargetDialog(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Worker Detailed Analysis Dialog */}
      <Dialog open={showWorkerDialog} onOpenChange={setShowWorkerDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-green-600" />
              Worker Analysis: {selectedWorker?.workerName}
            </DialogTitle>
            <DialogDescription>
              Detailed CO2 emissions analysis and recommendations for this worker
            </DialogDescription>
          </DialogHeader>
          {selectedWorker && (
            <ScrollArea className="max-h-[70vh]">
              <div className="space-y-6 p-4">
                {/* Worker Summary */}
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-medium">Location</span>
                      </div>
                      <p className="text-lg font-semibold">{selectedWorker.postcode}</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedWorker.distanceMiles?.toFixed(1)} miles to work
                      </p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Car className="w-4 h-4 text-orange-600" />
                        <span className="text-sm font-medium">Transport</span>
                      </div>
                      <p className="text-lg font-semibold">
                        {transportMethods.find(t => t.value === selectedWorker.transportMethod)?.label || selectedWorker.transportMethod}
                      </p>
                      <Badge 
                        variant="secondary"
                        className={`${getEmissionLevel(selectedWorker.monthlyCO2kg || 0).bgColor} ${getEmissionLevel(selectedWorker.monthlyCO2kg || 0).color}`}
                      >
                        {getEmissionLevel(selectedWorker.monthlyCO2kg || 0).level} Impact
                      </Badge>
                    </CardContent>
                  </Card>
                </div>

                {/* Emissions Breakdown */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-green-600" />
                      Emissions Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span>Daily CO2 (round trip):</span>
                        <span className="font-semibold">{(selectedWorker.monthlyCO2kg / 22)?.toFixed(2) || '0.00'} kg</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Monthly CO2:</span>
                        <span className="font-semibold">{selectedWorker.monthlyCO2kg?.toFixed(1) || '0.0'} kg</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Annual CO2 (projected):</span>
                        <span className="font-semibold">{(selectedWorker.monthlyCO2kg * 12)?.toFixed(1) || '0.0'} kg</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Carbon Score:</span>
                        <span className="font-semibold">
                          {calculateCarbonScore(selectedWorker.monthlyCO2kg || 0, 1)}/100
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Recommendations */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-blue-600" />
                      Optimization Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {selectedWorker.transportMethod !== 'electric' && (
                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <Zap className="w-4 h-4 text-green-600" />
                            <span className="font-medium text-green-800">Electric Vehicle</span>
                          </div>
                          <p className="text-sm text-green-700">
                            Switching to electric could save {calculateCO2Savings(selectedWorker.transportMethod, 'electric', selectedWorker.monthlyCO2kg || 0).toFixed(1)} kg CO2/month
                          </p>
                        </div>
                      )}
                      
                      {selectedWorker.transportMethod !== 'public_transport' && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <Bus className="w-4 h-4 text-blue-600" />
                            <span className="font-medium text-blue-800">Public Transport</span>
                          </div>
                          <p className="text-sm text-blue-700">
                            Using public transport could save {calculateCO2Savings(selectedWorker.transportMethod, 'public_transport', selectedWorker.monthlyCO2kg || 0).toFixed(1)} kg CO2/month
                          </p>
                        </div>
                      )}

                      <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <MapPin className="w-4 h-4 text-orange-600" />
                          <span className="font-medium text-orange-800">Route Optimization</span>
                        </div>
                        <p className="text-sm text-orange-700">
                          Consider carpooling or flexible working arrangements to reduce travel frequency
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      toast({
                        title: "Recommendations Sent",
                        description: `Personalized CO2 reduction recommendations sent to ${selectedWorker.workerName}`,
                      });
                    }}
                    className="flex-1"
                  >
                    Send Recommendations
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowWorkerDialog(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* UK Carbon Offset Schemes Dialog */}
      <Dialog open={showOffsetDialog} onOpenChange={setShowOffsetDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Leaf className="w-5 h-5 text-emerald-600" />
              UK Carbon Offset Schemes
            </DialogTitle>
            <DialogDescription>
              Voluntary carbon offset options recognised for UK Scope 3 reporting. These do not replace emission reductions — they complement them.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Your figures */}
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
              <p className="text-sm font-medium text-emerald-800 mb-1">Your estimated offset requirement</p>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-emerald-900">
                  {((co2Summary?.data?.totalAnnualCO2kg || 0) / 1000).toFixed(2)} tonnes CO₂e / year
                </span>
                <span className="text-sm text-emerald-700">
                  Based on contractor commuting data
                </span>
              </div>
              <p className="text-xs text-emerald-600 mt-1">
                Scope 3 — Category 7: Employee / Contractor Commuting (GHG Protocol)
              </p>
            </div>

            {/* Scheme 1 */}
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-base">🌳 Woodland Carbon Code (WCC)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">UK Government backed — DEFRA / Forestry Commission endorsed</p>
                </div>
                <span className="text-xs font-medium bg-green-100 text-green-800 rounded-full px-2 py-1 whitespace-nowrap">UK-specific</span>
              </div>
              <p className="text-sm text-muted-foreground">
                The gold standard for UK-based offsets. Funds new woodland creation across Great Britain. Credits (WCUs) are independently verified and listed on the UK Land Carbon Registry. Recognised by HMRC and widely used in UK ESG reporting.
              </p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Typical price: <span className="font-medium text-foreground">£10–30 / tonne</span></span>
                <Button size="sm" variant="outline" onClick={() => window.open('https://woodlandcarboncode.org.uk', '_blank', 'noopener,noreferrer')}>
                  woodlandcarboncode.org.uk ↗
                </Button>
              </div>
            </div>

            {/* Scheme 2 */}
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-base">🌿 Peatland Code</p>
                  <p className="text-xs text-muted-foreground mt-0.5">IUCN UK Peatland Programme / Scottish Government</p>
                </div>
                <span className="text-xs font-medium bg-green-100 text-green-800 rounded-full px-2 py-1 whitespace-nowrap">UK-specific</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Supports the restoration of degraded UK peatland — one of the most carbon-dense ecosystems. Credits listed on the UK Land Carbon Registry. Suitable for organisations wanting to demonstrate UK environmental stewardship.
              </p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Typical price: <span className="font-medium text-foreground">£10–25 / tonne</span></span>
                <Button size="sm" variant="outline" onClick={() => window.open('https://www.peatlandcode.org.uk', '_blank', 'noopener,noreferrer')}>
                  peatlandcode.org.uk ↗
                </Button>
              </div>
            </div>

            {/* Scheme 3 */}
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-base">🌐 Gold Standard</p>
                  <p className="text-xs text-muted-foreground mt-0.5">ICROA-accredited international standard</p>
                </div>
                <span className="text-xs font-medium bg-blue-100 text-blue-800 rounded-full px-2 py-1 whitespace-nowrap">International</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Widely used in UK voluntary reporting. ICROA-accredited and accepted for SECR Scope 3 disclosures. Projects span renewables, clean cookstoves, and reforestation globally. Suitable if UK-specific schemes are unavailable.
              </p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Typical price: <span className="font-medium text-foreground">£15–50 / tonne</span></span>
                <Button size="sm" variant="outline" onClick={() => window.open('https://www.goldstandard.org/impact-products', '_blank', 'noopener,noreferrer')}>
                  goldstandard.org ↗
                </Button>
              </div>
            </div>

            {/* UK rules note */}
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              <p className="font-medium mb-1">⚠️ UK regulatory note</p>
              <p>Carbon offsets are voluntary for Scope 3 commuting emissions. Under SECR, organisations must disclose their methodology. The CMA (Competition and Markets Authority) Green Claims Code requires that offset claims are not misleading — always pair offsets with a documented emissions reduction plan.</p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setShowOffsetDialog(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}