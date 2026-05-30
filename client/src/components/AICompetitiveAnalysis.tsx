import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, Shield, Trophy, Zap, Crown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CompetitiveAnalysis {
  timeEfficiency: string;
  costComparison: string;
  securityAdvantage: string;
  complianceSuperiority: string;
  competitiveEdge: string[];
  marketPosition: string;
}

export default function AICompetitiveAnalysis() {
  const [companySize, setCompanySize] = useState("50");
  const [currentSystem, setCurrentSystem] = useState("manual system");
  const [monthlyVisitors, setMonthlyVisitors] = useState("200");
  const { toast } = useToast();

  const analysisMutation = useMutation({
    mutationFn: async (data: { companySize: string; currentSystem: string; monthlyVisitors: string }): Promise<{
      success: boolean;
      analysis: CompetitiveAnalysis;
      timestamp: string;
    }> => {
      const response = await fetch('/api/ai/competitive-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate competitive analysis');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Competitive Analysis Complete",
        description: "AI analysis shows TPR's advantages",
      });
    },
    onError: () => {
      toast({
        title: "Analysis Failed",
        description: "Unable to generate competitive analysis",
        variant: "destructive"
      });
    }
  });

  const handleAnalyze = () => {
    analysisMutation.mutate({ companySize, currentSystem, monthlyVisitors });
  };

  return (
    <GlassCard className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-slate-200 dark:border-slate-800">
      <div className="flex items-center space-x-3 mb-6">
        <Target className="text-blue-600 dark:text-blue-400" size={32} />
        <h2 className="text-xl font-bold text-blue-800 dark:text-blue-200">AI Competitive Analysis</h2>
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
          VS Competition
        </Badge>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="company-size" className="text-slate-700 dark:text-slate-300">
              Company Size (Employees)
            </Label>
            <Input
              id="company-size"
              type="number"
              value={companySize}
              onChange={(e) => setCompanySize(e.target.value)}
              placeholder=""
              className="mt-1"
              data-testid="input-company-size"
            />
          </div>
          
          <div>
            <Label htmlFor="current-system" className="text-slate-700 dark:text-slate-300">
              Current System
            </Label>
            <Select value={currentSystem} onValueChange={setCurrentSystem}>
              <SelectTrigger className="mt-1" data-testid="select-current-system">
                <SelectValue placeholder="Select current system" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual system">Manual Paper System</SelectItem>
                <SelectItem value="basic digital">Basic Digital Check-in</SelectItem>
                <SelectItem value="competitor system">Competitor System</SelectItem>
                <SelectItem value="spreadsheet tracking">Spreadsheet Tracking</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="monthly-visitors" className="text-slate-700 dark:text-slate-300">
              Monthly Visitors
            </Label>
            <Input
              id="monthly-visitors"
              type="number"
              value={monthlyVisitors}
              onChange={(e) => setMonthlyVisitors(e.target.value)}
              placeholder=""
              className="mt-1"
              data-testid="input-monthly-visitors"
            />
          </div>
          
          <Button 
            onClick={handleAnalyze}
            disabled={analysisMutation.isPending}
            className="w-full mt-4"
            data-testid="button-analyze-competition"
          >
            {analysisMutation.isPending ? 'Analyzing...' : 'Generate AI Competitive Analysis'}
          </Button>
        </div>

        {/* Results Section */}
        <div className="space-y-4">
          {analysisMutation.data ? (
            <div className="space-y-4">
              <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center space-x-2 mb-2">
                  <TrendingUp className="text-green-600" size={18} />
                  <h3 className="font-semibold text-green-800 dark:text-green-200">Time Efficiency</h3>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300" data-testid="time-efficiency">
                  {analysisMutation.data.analysis.timeEfficiency}
                </p>
              </div>

              <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <div className="flex items-center space-x-2 mb-2">
                  <Zap className="text-emerald-600" size={18} />
                  <h3 className="font-semibold text-emerald-800 dark:text-emerald-200">Cost Savings</h3>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300" data-testid="cost-comparison">
                  {analysisMutation.data.analysis.costComparison}
                </p>
              </div>

              <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg border border-red-200 dark:border-red-800">
                <div className="flex items-center space-x-2 mb-2">
                  <Shield className="text-red-600" size={18} />
                  <h3 className="font-semibold text-red-800 dark:text-red-200">Security Advantage</h3>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300" data-testid="security-advantage">
                  {analysisMutation.data.analysis.securityAdvantage}
                </p>
              </div>

              <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="flex items-center space-x-2 mb-2">
                  <Trophy className="text-purple-600" size={18} />
                  <h3 className="font-semibold text-purple-800 dark:text-purple-200">Competitive Edge</h3>
                </div>
                <ul className="space-y-1" data-testid="competitive-edge">
                  {analysisMutation.data.analysis.competitiveEdge.map((edge, index) => (
                    <li key={index} className="text-sm text-slate-700 dark:text-slate-300 flex items-start">
                      <span className="text-purple-600 mr-2">•</span>
                      {edge}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-2 mb-2">
                  <Crown className="text-blue-600" size={18} />
                  <h3 className="font-semibold text-blue-800 dark:text-blue-200">Market Position</h3>
                </div>
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300" data-testid="market-position">
                  {analysisMutation.data.analysis.marketPosition}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white/50 dark:bg-slate-800/50 p-8 rounded-lg text-center">
              <Target className="mx-auto text-slate-400 mb-4" size={48} />
              <p className="text-slate-600 dark:text-slate-400">
                Generate AI analysis to see how TPR outperforms your current system
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 bg-blue-100 dark:bg-blue-900/30 p-4 rounded-lg">
        <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Why This Matters for Sales:</h4>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <li>• <strong>Quantified Value:</strong> Show exact savings and efficiency gains to prospects</li>
          <li>• <strong>Competitive Positioning:</strong> Demonstrate clear advantages over alternatives</li>
          <li>• <strong>ROI Justification:</strong> Provide concrete data for budget approvals</li>
          <li>• <strong>Risk Mitigation:</strong> Highlight security and compliance improvements</li>
        </ul>
      </div>
    </GlassCard>
  );
}