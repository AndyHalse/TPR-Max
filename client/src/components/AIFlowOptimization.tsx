import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Workflow, Clock, Zap, CheckSquare, ArrowRight, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FlowOptimization {
  optimizedFlow: string;
  waitTimeReduction: number;
  efficiencyGains: string[];
  implementationSteps: string[];
  predictedImprovement: string;
}

export default function AIFlowOptimization() {
  const [peakHourVisitors, setPeakHourVisitors] = useState("25");
  const [currentWaitTime, setCurrentWaitTime] = useState("8");
  const [facilityLayout, setFacilityLayout] = useState("standard office");
  const { toast } = useToast();

  const optimizationMutation = useMutation({
    mutationFn: async (data: { peakHourVisitors: string; currentWaitTime: string; facilityLayout: string }): Promise<{
      success: boolean;
      optimization: FlowOptimization;
      timestamp: string;
    }> => {
      const response = await fetch('/api/ai/flow-optimization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate flow optimization');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Flow Optimization Complete",
        description: "AI recommendations generated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Optimization Failed",
        description: "Unable to generate flow optimization",
        variant: "destructive"
      });
    }
  });

  const handleOptimize = () => {
    optimizationMutation.mutate({ peakHourVisitors, currentWaitTime, facilityLayout });
  };

  const getReductionColor = (reduction: number) => {
    if (reduction >= 60) return 'text-green-600';
    if (reduction >= 40) return 'text-blue-600';
    if (reduction >= 20) return 'text-yellow-600';
    return 'text-orange-600';
  };

  return (
    <GlassCard className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-slate-200 dark:border-slate-800">
      <div className="flex items-center space-x-3 mb-6">
        <Workflow className="text-purple-600 dark:text-purple-400" size={32} />
        <h2 className="text-xl font-bold text-purple-800 dark:text-purple-200">AI Flow Optimization</h2>
        <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
          Smart Efficiency
        </Badge>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="peak-visitors" className="text-slate-700 dark:text-slate-300">
              Peak Hour Visitors
            </Label>
            <Input
              id="peak-visitors"
              type="number"
              value={peakHourVisitors}
              onChange={(e) => setPeakHourVisitors(e.target.value)}
              placeholder=""
              className="mt-1"
              data-testid="input-peak-visitors"
            />
          </div>
          
          <div>
            <Label htmlFor="wait-time" className="text-slate-700 dark:text-slate-300">
              Current Wait Time (minutes)
            </Label>
            <Input
              id="wait-time"
              type="number"
              value={currentWaitTime}
              onChange={(e) => setCurrentWaitTime(e.target.value)}
              placeholder=""
              className="mt-1"
              data-testid="input-wait-time"
            />
          </div>
          
          <div>
            <Label htmlFor="facility-layout" className="text-slate-700 dark:text-slate-300">
              Facility Layout
            </Label>
            <Select value={facilityLayout} onValueChange={setFacilityLayout}>
              <SelectTrigger className="mt-1" data-testid="select-facility-layout">
                <SelectValue placeholder="Select facility type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard office">Standard Office</SelectItem>
                <SelectItem value="corporate campus">Corporate Campus</SelectItem>
                <SelectItem value="shared workspace">Shared Workspace</SelectItem>
                <SelectItem value="industrial facility">Industrial Facility</SelectItem>
                <SelectItem value="retail location">Retail Location</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Button 
            onClick={handleOptimize}
            disabled={optimizationMutation.isPending}
            className="w-full mt-4"
            data-testid="button-optimize-flow"
          >
            {optimizationMutation.isPending ? 'Optimizing...' : 'Generate AI Flow Optimization'}
          </Button>
        </div>

        {/* Results Section */}
        <div className="space-y-4">
          {optimizationMutation.data ? (
            <div className="space-y-4">
              <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="flex items-center space-x-2 mb-2">
                  <Workflow className="text-purple-600" size={18} />
                  <h3 className="font-semibold text-purple-800 dark:text-purple-200">Optimized Flow Strategy</h3>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300" data-testid="optimized-flow">
                  {optimizationMutation.data.optimization.optimizedFlow}
                </p>
              </div>

              <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Clock className="text-green-600" size={18} />
                    <h3 className="font-semibold text-green-800 dark:text-green-200">Wait Time Reduction</h3>
                  </div>
                  <Badge 
                    variant="default" 
                    className={`${getReductionColor(optimizationMutation.data.optimization.waitTimeReduction)} bg-white border-2`}
                    data-testid="reduction-badge"
                  >
                    -{optimizationMutation.data.optimization.waitTimeReduction}%
                  </Badge>
                </div>
                <Progress 
                  value={optimizationMutation.data.optimization.waitTimeReduction} 
                  className="h-3"
                  data-testid="reduction-progress"
                />
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  From {currentWaitTime} to ~{Math.round(parseInt(currentWaitTime) * (1 - optimizationMutation.data.optimization.waitTimeReduction / 100))} minutes
                </p>
              </div>

              <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center space-x-2 mb-3">
                  <Zap className="text-blue-600" size={18} />
                  <h3 className="font-semibold text-blue-800 dark:text-blue-200">Efficiency Gains</h3>
                </div>
                <ul className="space-y-2" data-testid="efficiency-gains">
                  {optimizationMutation.data.optimization.efficiencyGains.map((gain, index) => (
                    <li key={index} className="text-sm text-slate-700 dark:text-slate-300 flex items-start">
                      <span className="text-blue-600 mr-2 mt-1">⚡</span>
                      {gain}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg border border-orange-200 dark:border-orange-800">
                <div className="flex items-center space-x-2 mb-3">
                  <CheckSquare className="text-orange-600" size={18} />
                  <h3 className="font-semibold text-orange-800 dark:text-orange-200">Implementation Steps</h3>
                </div>
                <ul className="space-y-2" data-testid="implementation-steps">
                  {optimizationMutation.data.optimization.implementationSteps.map((step, index) => (
                    <li key={index} className="text-sm text-slate-700 dark:text-slate-300 flex items-start">
                      <span className="text-orange-600 mr-2 mt-1">{index + 1}.</span>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-2 mb-2">
                  <ArrowRight className="text-purple-600" size={18} />
                  <h3 className="font-semibold text-purple-800 dark:text-purple-200">Predicted Improvement</h3>
                </div>
                <p className="text-sm font-medium text-purple-700 dark:text-purple-300" data-testid="predicted-improvement">
                  {optimizationMutation.data.optimization.predictedImprovement}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white/50 dark:bg-slate-800/50 p-8 rounded-lg text-center">
              <Users className="mx-auto text-slate-400 mb-4" size={48} />
              <p className="text-slate-600 dark:text-slate-400">
                Generate AI optimization to improve visitor flow and reduce wait times
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 bg-purple-100 dark:bg-purple-900/30 p-4 rounded-lg">
        <h4 className="font-semibold text-purple-800 dark:text-purple-200 mb-2">Sales Impact & Value:</h4>
        <ul className="text-sm text-purple-700 dark:text-purple-300 space-y-1">
          <li>• <strong>Operational Excellence:</strong> Demonstrate AI-driven process improvements</li>
          <li>• <strong>Customer Experience:</strong> Show measurable visitor satisfaction gains</li>
          <li>• <strong>Resource Optimization:</strong> Prove staff efficiency and cost savings</li>
          <li>• <strong>Scalable Solutions:</strong> Highlight adaptability to growing business needs</li>
        </ul>
      </div>
    </GlassCard>
  );
}