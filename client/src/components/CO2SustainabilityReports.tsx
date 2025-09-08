import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
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
  Target
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

  const getTransportIcon = (method: string) => {
    const transport = transportMethods.find(t => t.value === method);
    return transport ? transport.icon : Car;
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
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
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
                          <span className="text-2xl font-bold">{co2Summary.data.totalMonthlyCO2kg.toFixed(1)}</span>
                          <span className="text-sm text-muted-foreground ml-1">kg</span>
                        </div>
                        <Badge 
                          variant="secondary"
                          className={`mt-2 ${getEmissionLevel(co2Summary.data.totalMonthlyCO2kg).bgColor} ${getEmissionLevel(co2Summary.data.totalMonthlyCO2kg).color}`}
                        >
                          {getEmissionLevel(co2Summary.data.totalMonthlyCO2kg).level}
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
                          <span className="text-2xl font-bold">{co2Summary.data.totalAnnualCO2kg.toFixed(1)}</span>
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
                          <span className="text-2xl font-bold">{co2Summary.data.averageDistance.toFixed(1)}</span>
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
                        {Object.entries(co2Summary.data.transportBreakdown).map(([method, count]) => {
                          const transport = transportMethods.find(t => t.value === method);
                          const percentage = (count / co2Summary.data.totalWorkers) * 100;
                          
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
                                  {count} ({percentage.toFixed(0)}%)
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
                                    {worker.postcode} • {worker.distanceMiles.toFixed(1)} miles
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
                                  <p className="font-semibold">{worker.monthlyCO2kg.toFixed(1)} kg CO2</p>
                                  <p className="text-sm text-muted-foreground">per month</p>
                                </div>
                                
                                <Badge 
                                  variant="secondary"
                                  className={`${getEmissionLevel(worker.monthlyCO2kg).bgColor} ${getEmissionLevel(worker.monthlyCO2kg).color}`}
                                >
                                  {getEmissionLevel(worker.monthlyCO2kg).level}
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
                                      -{calculateCO2Savings(worker.transportMethod, 'electric_car', worker.monthlyCO2kg).toFixed(1)} kg/month
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
                    <Card key={report.id}>
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
                            <Badge variant="secondary" className={`${getEmissionLevel(report.totalCO2kg).bgColor} ${getEmissionLevel(report.totalCO2kg).color}`}>
                              {report.totalCO2kg.toFixed(1)} kg CO2
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(report.generatedAt), 'MMM d, yyyy')}
                            </span>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* AI Insights */}
                        {report.insights.length > 0 && (
                          <div>
                            <h5 className="font-medium text-sm mb-2 flex items-center gap-2">
                              <BarChart3 className="w-4 h-4 text-blue-600" />
                              AI Insights
                            </h5>
                            <div className="space-y-2">
                              {report.insights.slice(0, 3).map((insight, index) => (
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
                        {report.recommendations.length > 0 && (
                          <div>
                            <h5 className="font-medium text-sm mb-2 flex items-center gap-2">
                              <Target className="w-4 h-4 text-green-600" />
                              Recommendations
                            </h5>
                            <div className="space-y-2">
                              {report.recommendations.slice(0, 3).map((recommendation, index) => (
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
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}