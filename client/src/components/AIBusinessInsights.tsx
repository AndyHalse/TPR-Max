import { useQuery } from "@tanstack/react-query";
import GlassCard from "@/components/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Heart, Shield, TrendingUp, Award, Users, CheckCircle } from "lucide-react";

interface VisitorSentiment {
  satisfactionScore: number;
  experienceRating: string;
  improvements: string[];
  positiveHighlights: string[];
  businessImpact: string;
}

interface ComplianceAnalysis {
  complianceScore: number;
  riskAreas: string[];
  recommendations: string[];
  auditReadiness: string;
  hsCompliance: number;
}

export default function AIBusinessInsights() {
  const { data: sentimentData, isLoading: sentimentLoading } = useQuery<{
    success: boolean;
    sentiment: VisitorSentiment;
    timestamp: string;
  }>({
    queryKey: ["/api/ai/visitor-sentiment"],
    refetchInterval: 600000, // Refresh every 10 minutes
  });

  const { data: complianceData, isLoading: complianceLoading } = useQuery<{
    success: boolean;
    compliance: ComplianceAnalysis;
    timestamp: string;
  }>({
    queryKey: ["/api/ai/compliance"],
    refetchInterval: 600000, // Refresh every 10 minutes
  });

  if (sentimentLoading || complianceLoading) {
    return (
      <GlassCard className="animate-pulse">
        <div className="flex items-center space-x-3 mb-4">
          <TrendingUp className="text-blue-600" size={24} />
          <h3 className="text-lg font-semibold text-slate-800">AI Business Intelligence</h3>
        </div>
        <p className="text-slate-600">Analyzing business metrics...</p>
      </GlassCard>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 75) return 'text-blue-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBadge = (score: number) => {
    if (score >= 90) return 'default';
    if (score >= 75) return 'secondary';
    return 'destructive';
  };

  return (
    <div className="space-y-6">
      {/* Visitor Experience Intelligence */}
      <GlassCard className="bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20 border-2 border-pink-200 dark:border-pink-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Heart className="text-pink-600 dark:text-pink-400" size={28} />
            <h3 className="text-xl font-bold text-pink-800 dark:text-pink-200">AI Visitor Experience Analysis</h3>
          </div>
          <Badge 
            variant={getScoreBadge(sentimentData?.sentiment.satisfactionScore || 0)}
            className="text-sm px-3 py-1"
            data-testid="satisfaction-score-badge"
          >
            {sentimentData?.sentiment.satisfactionScore || 0}% Satisfaction
          </Badge>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg">
              <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center">
                <Award className="mr-2 text-yellow-600" size={18} />
                Experience Rating
              </h4>
              <p className="text-sm text-slate-700 dark:text-slate-300" data-testid="experience-rating">
                {sentimentData?.sentiment.experienceRating || 'Analyzing visitor experience...'}
              </p>
            </div>
            
            <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg">
              <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Positive Highlights</h4>
              <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                {sentimentData?.sentiment.positiveHighlights.map((highlight, index) => (
                  <li key={index} className="flex items-start">
                    <CheckCircle className="text-green-600 mr-2 mt-0.5 flex-shrink-0" size={14} />
                    {highlight}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="bg-pink-100 dark:bg-pink-900/30 p-4 rounded-lg">
              <h4 className="font-semibold text-pink-800 dark:text-pink-200 mb-2">Business Impact</h4>
              <p className="text-sm text-pink-700 dark:text-pink-300" data-testid="business-impact">
                {sentimentData?.sentiment.businessImpact}
              </p>
            </div>
            
            <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg">
              <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">AI Recommendations</h4>
              <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                {sentimentData?.sentiment.improvements.slice(0, 3).map((improvement, index) => (
                  <li key={index} className="flex items-start">
                    <TrendingUp className="text-blue-600 mr-2 mt-0.5 flex-shrink-0" size={14} />
                    {improvement}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Compliance & Security Intelligence */}
      <GlassCard className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-2 border-emerald-200 dark:border-emerald-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Shield className="text-emerald-600 dark:text-emerald-400" size={28} />
            <h3 className="text-xl font-bold text-emerald-800 dark:text-emerald-200">AI Compliance & Security Analysis</h3>
          </div>
          <div className="flex space-x-2">
            <Badge 
              variant={getScoreBadge(complianceData?.compliance.complianceScore || 0)}
              className="text-sm"
              data-testid="compliance-score-badge"
            >
              {complianceData?.compliance.complianceScore || 0}% Compliant
            </Badge>
            <Badge 
              variant={getScoreBadge(complianceData?.compliance.hsCompliance || 0)}
              className="text-sm bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              data-testid="hs-compliance-badge"
            >
              {complianceData?.compliance.hsCompliance || 0}% H&S
            </Badge>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg">
            <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Audit Readiness</h4>
            <p className="text-sm text-slate-700 dark:text-slate-300" data-testid="audit-readiness">
              {complianceData?.compliance.auditReadiness}
            </p>
          </div>
          
          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg">
            <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Risk Assessment</h4>
            <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
              {complianceData?.compliance.riskAreas.slice(0, 2).map((risk, index) => (
                <li key={index} className="flex items-start">
                  <CheckCircle className="text-green-600 mr-2 mt-0.5 flex-shrink-0" size={14} />
                  {risk}
                </li>
              ))}
            </ul>
          </div>
          
          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg">
            <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">AI Recommendations</h4>
            <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
              {complianceData?.compliance.recommendations.slice(0, 2).map((rec, index) => (
                <li key={index} className="flex items-start">
                  <Shield className="text-emerald-600 mr-2 mt-0.5 flex-shrink-0" size={14} />
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        <div className="mt-4 bg-emerald-100 dark:bg-emerald-900/30 p-4 rounded-lg">
          <h4 className="font-semibold text-emerald-800 dark:text-emerald-200 mb-2">Why AI Compliance Matters</h4>
          <ul className="text-sm text-emerald-700 dark:text-emerald-300 grid grid-cols-1 md:grid-cols-2 gap-2">
            <li>• Automatic regulatory compliance monitoring</li>
            <li>• Real-time risk assessment and mitigation</li>
            <li>• Audit-ready documentation generation</li>
            <li>• H&S compliance assurance with AI oversight</li>
            <li>• Proactive security threat detection</li>
            <li>• Continuous improvement recommendations</li>
          </ul>
        </div>
      </GlassCard>

      {/* AI Value Proposition Summary */}
      <GlassCard className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-2 border-blue-200 dark:border-blue-800">
        <div className="flex items-center space-x-3 mb-4">
          <Users className="text-blue-600 dark:text-blue-400" size={28} />
          <h3 className="text-xl font-bold text-blue-800 dark:text-blue-200">Complete AI Business Solution</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg text-center">
            <Heart className="mx-auto mb-2 text-pink-600" size={24} />
            <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Experience AI</h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">Real-time visitor satisfaction analysis</p>
          </div>
          
          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg text-center">
            <Shield className="mx-auto mb-2 text-emerald-600" size={24} />
            <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Compliance AI</h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">Automated H&S and regulatory monitoring</p>
          </div>
          
          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg text-center">
            <TrendingUp className="mx-auto mb-2 text-blue-600" size={24} />
            <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Predictive AI</h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">Future-ready business intelligence</p>
          </div>
          
          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg text-center">
            <Award className="mx-auto mb-2 text-yellow-600" size={24} />
            <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">ROI AI</h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">Measurable business value calculation</p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}