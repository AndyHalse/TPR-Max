import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Leaf, Car, Zap, Bus, AlertTriangle, TrendingDown, Calculator } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { CO2EmissionsData } from '@shared/schema';

interface CO2EmissionsTrackerProps {
  workerId: string;
  workerName: string;
  currentPostcode?: string;
  onPostcodeUpdate?: (postcode: string) => void;
}

const transportMethods = [
  { value: 'car_petrol', label: 'Petrol Car', icon: Car, color: 'text-red-600' },
  { value: 'car_diesel', label: 'Diesel Car', icon: Car, color: 'text-orange-600' },
  { value: 'electric', label: 'Electric Car', icon: Zap, color: 'text-green-600' },
  { value: 'public_transport', label: 'Public Transport', icon: Bus, color: 'text-blue-600' }
];

export function CO2EmissionsTracker({ 
  workerId, 
  workerName, 
  currentPostcode, 
  onPostcodeUpdate 
}: CO2EmissionsTrackerProps) {
  const [postcode, setPostcode] = useState(currentPostcode || '');
  const [transportMethod, setTransportMethod] = useState<string>('');
  const [workingDays, setWorkingDays] = useState(20);
  const [showCalculator, setShowCalculator] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch existing CO2 data
  const { data: co2Data, isLoading: isLoadingData } = useQuery<{
    success: boolean;
    data: {
      emissions: CO2EmissionsData[];
      reductionSuggestions: string[];
    };
  }>({
    queryKey: [`/api/contractors/workers/${workerId}/co2`],
    enabled: !!workerId
  });

  // Calculate CO2 emissions mutation
  const calculateMutation = useMutation({
    mutationFn: async (params: { postcode: string; transportMethod: string; workingDaysPerMonth: number }) => {
      const response = await fetch(`/api/contractors/workers/${workerId}/co2/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      if (!response.ok) throw new Error('Failed to calculate CO2 emissions');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/workers/${workerId}/co2`] });
      toast({
        title: "CO2 Emissions Calculated",
        description: "CO2 footprint has been calculated and saved successfully."
      });
      if (onPostcodeUpdate && postcode !== currentPostcode) {
        onPostcodeUpdate(postcode);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Calculation Failed",
        description: error.message || "Unable to calculate CO2 emissions.",
        variant: "destructive"
      });
    }
  });

  // Update transport method mutation
  const updateTransportMutation = useMutation({
    mutationFn: async (params: { transportMethod: string; postcode?: string }) => {
      const response = await fetch(`/api/contractors/workers/${workerId}/transport`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      if (!response.ok) throw new Error('Failed to update transport method');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/workers/${workerId}/co2`] });
      toast({
        title: "Transport Updated",
        description: "Transport method updated and CO2 emissions recalculated."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Unable to update transport method.",
        variant: "destructive"
      });
    }
  });

  const handleCalculate = () => {
    if (!postcode || !transportMethod) {
      toast({
        title: "Missing Information",
        description: "Please enter postcode and select transport method.",
        variant: "destructive"
      });
      return;
    }

    calculateMutation.mutate({
      postcode,
      transportMethod,
      workingDaysPerMonth: workingDays
    });
  };

  const handleTransportUpdate = (newTransportMethod: string) => {
    updateTransportMutation.mutate({
      transportMethod: newTransportMethod,
      postcode: postcode !== currentPostcode ? postcode : undefined
    });
  };

  const currentEmissions = co2Data?.data?.emissions?.[0] as CO2EmissionsData | undefined;
  const suggestions = co2Data?.data?.reductionSuggestions || [];

  const getEmissionLevel = (kg: number) => {
    if (kg < 50) return { level: 'Low', color: 'text-green-600', bgColor: 'bg-green-100' };
    if (kg < 100) return { level: 'Medium', color: 'text-yellow-600', bgColor: 'bg-yellow-100' };
    return { level: 'High', color: 'text-red-600', bgColor: 'bg-red-100' };
  };

  const getCurrentTransportMethod = () => {
    return transportMethods.find(method => method.value === currentEmissions?.transportMethod);
  };

  if (isLoadingData) {
    return (
      <Card data-testid="co2-emissions-loading">
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
            <span className="ml-2 text-sm text-muted-foreground">Loading CO2 data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="co2-emissions-tracker" className="w-full">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <Leaf className="w-5 h-5 text-green-600" />
          <CardTitle className="text-lg">CO2 Emissions Tracking</CardTitle>
        </div>
        <CardDescription>
          Track and manage carbon footprint for {workerName}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="calculator" data-testid="tab-calculator">Calculator</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            {currentEmissions ? (
              <div className="space-y-4">
                {/* Current Emissions Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <Calculator className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-medium">Monthly CO2</span>
                      </div>
                      <div className="mt-1">
                        <span className="text-2xl font-bold">{parseFloat(currentEmissions.monthlyCO2kg).toFixed(1)}</span>
                        <span className="text-sm text-muted-foreground ml-1">kg</span>
                      </div>
                      <Badge 
                        variant="secondary" 
                        className={`mt-2 ${getEmissionLevel(parseFloat(currentEmissions.monthlyCO2kg)).bgColor} ${getEmissionLevel(parseFloat(currentEmissions.monthlyCO2kg)).color}`}
                      >
                        {getEmissionLevel(parseFloat(currentEmissions.monthlyCO2kg)).level} Impact
                      </Badge>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <TrendingDown className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium">Daily Distance</span>
                      </div>
                      <div className="mt-1">
                        <span className="text-2xl font-bold">{currentEmissions.distanceKm.toFixed(1)}</span>
                        <span className="text-sm text-muted-foreground ml-1">km</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Round trip to site
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        {getCurrentTransportMethod() && (
                          React.createElement(getCurrentTransportMethod()!.icon, { 
                            className: `w-4 h-4 ${getCurrentTransportMethod()?.color}` 
                          })
                        )}
                        <span className="text-sm font-medium">Transport</span>
                      </div>
                      <div className="mt-1">
                        <span className="text-lg font-semibold">
                          {getCurrentTransportMethod()?.label || currentEmissions.transportMethod}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {currentEmissions.workingDaysPerMonth} days/month
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Quick Transport Update */}
                <div>
                  <Label className="text-sm font-medium">Update Transport Method</Label>
                  <div className="flex gap-2 mt-2">
                    {transportMethods.map((method) => (
                      <Button
                        key={method.value}
                        variant={currentEmissions.transportMethod === method.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleTransportUpdate(method.value)}
                        disabled={updateTransportMutation.isPending}
                        data-testid={`transport-${method.value}`}
                        className="flex items-center gap-2"
                      >
                        <method.icon className={`w-4 h-4 ${method.color}`} />
                        {method.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Reduction Suggestions */}
                {suggestions.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Leaf className="w-4 h-4 text-green-600" />
                      Sustainability Suggestions
                    </Label>
                    <div className="mt-2 space-y-2">
                      {suggestions.slice(0, 3).map((suggestion: string, index: number) => (
                        <Alert key={index} className="border-green-200">
                          <AlertTriangle className="w-4 h-4" />
                          <AlertDescription className="text-sm">
                            {suggestion}
                          </AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Alert>
                <Calculator className="w-4 h-4" />
                <AlertDescription>
                  No CO2 data available yet. Use the Calculator tab to calculate emissions.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="calculator" className="mt-4">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="postcode" className="text-sm font-medium">Worker Postcode</Label>
                  <Input
                    id="postcode"
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                    placeholder="e.g., SW1A 1AA"
                    className="mt-1"
                    data-testid="input-postcode"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Worker's home postcode for distance calculation
                  </p>
                </div>

                <div>
                  <Label className="text-sm font-medium">Transport Method</Label>
                  <Select value={transportMethod} onValueChange={setTransportMethod}>
                    <SelectTrigger className="mt-1" data-testid="select-transport">
                      <SelectValue placeholder="Select transport method" />
                    </SelectTrigger>
                    <SelectContent>
                      {transportMethods.map((method) => (
                        <SelectItem key={method.value} value={method.value} data-testid={`option-${method.value}`}>
                          <div className="flex items-center gap-2">
                            <method.icon className={`w-4 h-4 ${method.color}`} />
                            {method.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="working-days" className="text-sm font-medium">Working Days per Month</Label>
                <div className="flex items-center gap-4 mt-2">
                  <Input
                    id="working-days"
                    type="number"
                    value={workingDays}
                    onChange={(e) => setWorkingDays(parseInt(e.target.value) || 20)}
                    min="1"
                    max="31"
                    className="w-20"
                    data-testid="input-working-days"
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                  <Progress value={(workingDays / 31) * 100} className="flex-1 max-w-40" />
                </div>
              </div>

              <Separator />

              <div className="flex gap-2">
                <Button
                  onClick={handleCalculate}
                  disabled={calculateMutation.isPending || !postcode || !transportMethod}
                  className="flex items-center gap-2"
                  data-testid="button-calculate"
                >
                  <Calculator className="w-4 h-4" />
                  {calculateMutation.isPending ? 'Calculating...' : 'Calculate CO2 Emissions'}
                </Button>
              </div>

              {(calculateMutation.isPending || updateTransportMutation.isPending) && (
                <Alert>
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    <span className="text-sm">Processing with OpenAI...</span>
                  </div>
                </Alert>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}