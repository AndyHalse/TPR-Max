import { useQuery } from "@tanstack/react-query";
import GlassCard from "@/components/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain, Shield, TrendingUp, AlertTriangle, Lightbulb } from "lucide-react";
import { useState } from "react";

interface AIInsightsData {
  insights: string[];
  recommendations: string[];
  riskAssessment: string;
  prediction: string;
}

interface PredictiveAnalytics {
  nextWeekPrediction: string;
  peakHoursForecast: string;
  capacityRecommendation: string;
  departmentInsights: string[];
}

export default function AIInsights() {
  const [showDetails, setShowDetails] = useState(false);

  const { data: insights, isLoading: insightsLoading } = useQuery<{
    success: boolean;
    timestamp: string;
    insights: AIInsightsData;
  }>({
    queryKey: ["/api/ai/insights"],
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<{
    success: boolean;
    timestamp: string;
    analytics: PredictiveAnalytics;
  }>({
    queryKey: ["/api/ai/analytics"],
    refetchInterval: 600000, // Refresh every 10 minutes
  });

  const getRiskColor = (risk: string) => {
    if (!risk || typeof risk !== 'string') return 'text-green-600';
    if (risk.toLowerCase().includes('high')) return 'text-red-600';
    if (risk.toLowerCase().includes('medium')) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getRiskBadgeVariant = (risk: string) => {
    if (!risk || typeof risk !== 'string') return 'default';
    if (risk.toLowerCase().includes('high')) return 'destructive';
    if (risk.toLowerCase().includes('medium')) return 'secondary';
    return 'default';
  };

  if (insightsLoading || analyticsLoading) {
    return (
      <GlassCard className="animate-pulse">
        <div className="flex items-center space-x-3 mb-4">
          <Brain className="text-blue-600" size={24} />
          <h3 className="text-lg font-semibold text-slate-800">AI Insights</h3>
        </div>
        <p className="text-slate-600">Generating intelligent insights...</p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* AI Security Assessment */}
      <GlassCard className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-2 border-blue-200 dark:border-blue-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Brain className="text-blue-600 dark:text-blue-400" size={28} />
            <h3 className="text-xl font-bold text-blue-800 dark:text-blue-200">AI Security Intelligence</h3>
          </div>
          <Badge 
            variant={getRiskBadgeVariant(insights?.insights?.riskAssessment || 'low')}
            className="text-sm px-3 py-1"
            data-testid="ai-risk-badge"
          >
            Risk: {typeof insights?.insights?.riskAssessment === 'string' ? insights.insights.riskAssessment.split(' ')[0] : 'Unknown'}
          </Badge>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <h4 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center">
              <Lightbulb className="mr-2 text-yellow-600" size={18} />
              Key Insights
            </h4>
            {insights?.insights?.insights?.slice(0, 2).map((insight, index) => (
              <div key={index} className="bg-white/70 dark:bg-slate-800/70 p-3 rounded-lg">
                <p className="text-sm text-slate-700 dark:text-slate-300">{insight}</p>
              </div>
            ))}
          </div>
          
          <div className="space-y-3">
            <h4 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center">
              <Shield className="mr-2 text-green-600" size={18} />
              Recommendations
            </h4>
            {insights?.insights?.recommendations?.slice(0, 2).map((rec, index) => (
              <div key={index} className="bg-white/70 dark:bg-slate-800/70 p-3 rounded-lg">
                <p className="text-sm text-slate-700 dark:text-slate-300">{rec}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 bg-blue-100 dark:bg-blue-900/30 p-4 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Risk Assessment:</strong> {insights?.insights?.riskAssessment || 'Assessment in progress...'}
          </p>
        </div>
        
        <Button 
          variant="outline" 
          size="sm" 
          className="mt-4"
          onClick={() => setShowDetails(!showDetails)}
          data-testid="button-ai-details"
        >
          {showDetails ? 'Hide Details' : 'View Full Analysis'}
        </Button>
      </GlassCard>

      {/* AI Predictive Analytics */}
      <GlassCard className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-200 dark:border-green-800">
        <div className="flex items-center space-x-3 mb-4">
          <TrendingUp className="text-green-600 dark:text-green-400" size={28} />
          <h3 className="text-xl font-bold text-green-800 dark:text-green-200">AI Predictive Analytics</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg">
              <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Next Week Forecast</h4>
              <p className="text-sm text-slate-700 dark:text-slate-300">{analytics?.analytics?.nextWeekPrediction || 'Analyzing trends...'}</p>
            </div>
            
            <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg">
              <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Peak Hours Prediction</h4>
              <p className="text-sm text-slate-700 dark:text-slate-300">{analytics?.analytics?.peakHoursForecast || 'Calculating peak hours...'}</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg">
              <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Capacity Planning</h4>
              <p className="text-sm text-slate-700 dark:text-slate-300">{analytics?.analytics?.capacityRecommendation || 'Evaluating capacity...'}</p>
            </div>
            
            <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg">
              <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Department Insights</h4>
              <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                {analytics?.analytics?.departmentInsights?.slice(0, 3).map((insight, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-green-600 mr-2">•</span>
                    {typeof insight === 'string' ? insight : JSON.stringify(insight)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Detailed Analysis Panel */}
      {showDetails && (
        <GlassCard className="border-2 border-purple-200 dark:border-purple-800">
          <div className="flex items-center space-x-3 mb-4">
            <AlertTriangle className="text-purple-600" size={24} />
            <h3 className="text-lg font-semibold text-purple-800 dark:text-purple-200">Detailed AI Analysis</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">All Insights</h4>
              <ul className="space-y-2">
                {insights?.insights?.insights?.map((insight, index) => (
                  <li key={index} className="text-sm text-slate-700 dark:text-slate-300 bg-white/50 dark:bg-slate-800/50 p-2 rounded">
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">All Recommendations</h4>
              <ul className="space-y-2">
                {insights?.insights?.recommendations?.map((rec, index) => (
                  <li key={index} className="text-sm text-slate-700 dark:text-slate-300 bg-white/50 dark:bg-slate-800/50 p-2 rounded">
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="bg-purple-100 dark:bg-purple-900/30 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-800 dark:text-purple-200 mb-2">AI Prediction</h4>
              <p className="text-sm text-purple-700 dark:text-purple-300">{insights?.insights?.prediction || 'Generating prediction...'}</p>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}