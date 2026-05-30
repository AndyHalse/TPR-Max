import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calculator, TrendingUp, DollarSign, Clock, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ROIAnalysis {
  annualSavings: number;
  efficiencyGain: number;
  paybackPeriod: number;
  productivityIncrease: number;
  complianceImprovement: number;
  recommendation: string;
}

export default function AIROICalculator() {
  const [monthlyVisitors, setMonthlyVisitors] = useState("100");
  const [staffCount, setStaffCount] = useState("25");
  const [manualProcessTime, setManualProcessTime] = useState("15");
  const { toast } = useToast();

  const roiMutation = useMutation({
    mutationFn: async (data: { monthlyVisitors: string; staffCount: string; manualProcessTime: string }): Promise<{
      success: boolean;
      roi: ROIAnalysis;
      timestamp: string;
    }> => {
      const response = await fetch('/api/ai/roi-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error('Failed to calculate ROI');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "AI ROI Analysis Complete",
        description: "Investment analysis calculated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Analysis Failed",
        description: "Unable to calculate ROI analysis",
        variant: "destructive"
      });
    }
  });

  const handleCalculate = () => {
    roiMutation.mutate({ monthlyVisitors, staffCount, manualProcessTime });
  };

  return (
    <GlassCard className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-slate-200 dark:border-slate-800">
      <div className="flex items-center space-x-3 mb-6">
        <Calculator className="text-green-600 dark:text-green-400" size={32} />
        <h2 className="text-xl font-bold text-green-800 dark:text-green-200">AI-Powered ROI Calculator</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Input Section */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="monthlyVisitors" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Monthly Visitors
            </Label>
            <Input
              id="monthlyVisitors"
              type="number"
              value={monthlyVisitors}
              onChange={(e) => setMonthlyVisitors(e.target.value)}
              placeholder=""
              className="mt-1"
              data-testid="input-monthly-visitors"
            />
          </div>
          
          <div>
            <Label htmlFor="staffCount" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Staff Count
            </Label>
            <Input
              id="staffCount"
              type="number"
              value={staffCount}
              onChange={(e) => setStaffCount(e.target.value)}
              placeholder=""
              className="mt-1"
              data-testid="input-staff-count"
            />
          </div>
          
          <div>
            <Label htmlFor="manualProcessTime" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Manual Process Time (minutes/visitor)
            </Label>
            <Input
              id="manualProcessTime"
              type="number"
              value={manualProcessTime}
              onChange={(e) => setManualProcessTime(e.target.value)}
              placeholder=""
              className="mt-1"
              data-testid="input-manual-time"
            />
          </div>
          
          <Button 
            onClick={handleCalculate}
            disabled={roiMutation.isPending}
            className="w-full"
            data-testid="button-calculate-roi"
          >
            {roiMutation.isPending ? 'Calculating...' : 'Calculate AI-Powered ROI'}
          </Button>
        </div>

        {/* Results Section */}
        <div className="space-y-4">
          {roiMutation.data && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/70 dark:bg-slate-800/70 p-3 rounded-lg text-center">
                  <DollarSign className="mx-auto mb-1 text-green-600" size={20} />
                  <p className="text-xs text-slate-600 dark:text-slate-400">Annual Savings</p>
                  <p className="font-bold text-lg text-green-600" data-testid="annual-savings">
                    £{roiMutation.data.roi.annualSavings.toLocaleString()}
                  </p>
                </div>
                
                <div className="bg-white/70 dark:bg-slate-800/70 p-3 rounded-lg text-center">
                  <TrendingUp className="mx-auto mb-1 text-blue-600" size={20} />
                  <p className="text-xs text-slate-600 dark:text-slate-400">Efficiency Gain</p>
                  <p className="font-bold text-lg text-blue-600" data-testid="efficiency-gain">
                    {roiMutation.data.roi.efficiencyGain}%
                  </p>
                </div>
                
                <div className="bg-white/70 dark:bg-slate-800/70 p-3 rounded-lg text-center">
                  <Clock className="mx-auto mb-1 text-purple-600" size={20} />
                  <p className="text-xs text-slate-600 dark:text-slate-400">Payback Period</p>
                  <p className="font-bold text-lg text-purple-600" data-testid="payback-period">
                    {roiMutation.data.roi.paybackPeriod} months
                  </p>
                </div>
                
                <div className="bg-white/70 dark:bg-slate-800/70 p-3 rounded-lg text-center">
                  <CheckCircle className="mx-auto mb-1 text-orange-600" size={20} />
                  <p className="text-xs text-slate-600 dark:text-slate-400">Productivity+</p>
                  <p className="font-bold text-lg text-orange-600" data-testid="productivity-increase">
                    {roiMutation.data.roi.productivityIncrease}%
                  </p>
                </div>
              </div>
              
              <div className="bg-green-100 dark:bg-green-900/30 p-4 rounded-lg">
                <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">AI Recommendation</h4>
                <p className="text-sm text-green-700 dark:text-green-300" data-testid="ai-recommendation">
                  {roiMutation.data.roi.recommendation}
                </p>
              </div>
              
              <div className="flex justify-center">
                <Badge variant="outline" className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
                  Compliance Improvement: {roiMutation.data.roi.complianceImprovement}%
                </Badge>
              </div>
            </>
          )}
          
          {!roiMutation.data && (
            <div className="bg-white/70 dark:bg-slate-800/70 p-6 rounded-lg text-center">
              <Calculator className="mx-auto mb-4 text-slate-400" size={48} />
              <p className="text-slate-600 dark:text-slate-400">
                Enter your details to see AI-calculated ROI and business benefits
              </p>
            </div>
          )}
        </div>
      </div>
      
      <div className="mt-6 bg-blue-100 dark:bg-blue-900/30 p-4 rounded-lg">
        <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Why TPR ROI is Outstanding:</h3>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <li>• <strong>AI Automation:</strong> Reduces manual admin by 85%+</li>
          <li>• <strong>Staff Productivity:</strong> Frees up valuable time for core business</li>
          <li>• <strong>Compliance Assurance:</strong> Automatic H&S and regulatory compliance</li>
          <li>• <strong>Professional Image:</strong> Modern system enhances company reputation</li>
          <li>• <strong>Security Enhancement:</strong> AI-powered threat detection and monitoring</li>
        </ul>
      </div>
    </GlassCard>
  );
}