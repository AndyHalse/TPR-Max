import { useQuery } from "@tanstack/react-query";
import GlassCard from "@/components/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Award, TrendingUp, Users, CheckCircle, Star, Target } from "lucide-react";

interface SuccessMetrics {
  performanceScore: number;
  keyAchievements: string[];
  benchmarkComparison: string;
  customerSatisfaction: number;
  businessImpact: string;
  nextMilestones: string[];
}

export default function AISuccessMetrics() {
  const { data: metricsData, isLoading } = useQuery<{
    success: boolean;
    metrics: SuccessMetrics;
    timestamp: string;
  }>({
    queryKey: ["/api/ai/success-metrics"],
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  if (isLoading) {
    return (
      <GlassCard className="animate-pulse">
        <div className="flex items-center space-x-3 mb-4">
          <Award className="text-green-600" size={24} />
          <h3 className="text-lg font-semibold text-slate-800">AI Success Metrics</h3>
        </div>
        <p className="text-slate-600">Calculating performance metrics...</p>
      </GlassCard>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 80) return 'text-blue-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBadge = (score: number) => {
    if (score >= 90) return 'default';
    if (score >= 80) return 'secondary';
    return 'destructive';
  };

  return (
    <GlassCard className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-200 dark:border-green-800">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Award className="text-green-600 dark:text-green-400" size={32} />
          <h2 className="text-xl font-bold text-green-800 dark:text-green-200">AI Customer Success Metrics</h2>
        </div>
        <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          Live Performance
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Performance Scores */}
        <div className="space-y-4">
          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">Overall Performance</h3>
              <Badge 
                variant={getScoreBadge(metricsData?.metrics.performanceScore || 0)}
                data-testid="performance-badge"
              >
                {metricsData?.metrics.performanceScore || 0}%
              </Badge>
            </div>
            <Progress 
              value={metricsData?.metrics.performanceScore || 0} 
              className="h-3"
              data-testid="performance-progress"
            />
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Industry benchmark: 70%
            </p>
          </div>

          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">Customer Satisfaction</h3>
              <div className="flex items-center space-x-1">
                <Star className="text-yellow-500 fill-current" size={16} />
                <span className="font-bold text-slate-800 dark:text-slate-200" data-testid="satisfaction-score">
                  {(metricsData?.metrics.customerSatisfaction || 0) / 20}/5
                </span>
              </div>
            </div>
            <Progress 
              value={metricsData?.metrics.customerSatisfaction || 0} 
              className="h-3"
              data-testid="satisfaction-progress"
            />
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Target: 85% satisfaction
            </p>
          </div>

          <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center space-x-2 mb-2">
              <TrendingUp className="text-green-600" size={18} />
              <h3 className="font-semibold text-green-800 dark:text-green-200">Benchmark Comparison</h3>
            </div>
            <p className="text-sm text-green-700 dark:text-green-300" data-testid="benchmark-comparison">
              {metricsData?.metrics.benchmarkComparison || 'Calculating comparison...'}
            </p>
          </div>
        </div>

        {/* Key Achievements */}
        <div className="space-y-4">
          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg">
            <div className="flex items-center space-x-2 mb-3">
              <CheckCircle className="text-green-600" size={20} />
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">Key Achievements</h3>
            </div>
            <ul className="space-y-2" data-testid="key-achievements">
              {metricsData?.metrics.keyAchievements.map((achievement, index) => (
                <li key={index} className="text-sm text-slate-700 dark:text-slate-300 flex items-start">
                  <span className="text-green-600 mr-2 mt-1">✓</span>
                  {achievement}
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg">
            <div className="flex items-center space-x-2 mb-3">
              <Target className="text-blue-600" size={20} />
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">Next Milestones</h3>
            </div>
            <ul className="space-y-2" data-testid="next-milestones">
              {metricsData?.metrics.nextMilestones.map((milestone, index) => (
                <li key={index} className="text-sm text-slate-700 dark:text-slate-300 flex items-start">
                  <span className="text-blue-600 mr-2 mt-1">→</span>
                  {milestone}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-green-100 dark:bg-green-900/30 p-4 rounded-lg">
        <div className="flex items-center space-x-2 mb-2">
          <Users className="text-green-600" size={20} />
          <h4 className="font-semibold text-green-800 dark:text-green-200">Business Impact Summary</h4>
        </div>
        <p className="text-sm text-green-700 dark:text-green-300" data-testid="business-impact">
          {metricsData?.metrics.businessImpact || 'Calculating business impact...'}
        </p>
      </div>

      <div className="mt-4 bg-blue-100 dark:bg-blue-900/30 p-4 rounded-lg">
        <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Sales Value Proposition:</h4>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <li>• <strong>Proven ROI:</strong> Demonstrate measurable success to prospects</li>
          <li>• <strong>Customer Validation:</strong> Show real satisfaction scores and achievements</li>
          <li>• <strong>Competitive Advantage:</strong> Highlight above-industry performance</li>
          <li>• <strong>Growth Trajectory:</strong> Present clear improvement roadmap</li>
        </ul>
      </div>
    </GlassCard>
  );
}