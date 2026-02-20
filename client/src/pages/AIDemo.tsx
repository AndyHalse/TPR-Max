import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import GlassCard from "@/components/GlassCard";
import AIROICalculator from "@/components/AIROICalculator";
import AIBusinessInsights from "@/components/AIBusinessInsights";
import AICompetitiveAnalysis from "@/components/AICompetitiveAnalysis";
import AISuccessMetrics from "@/components/AISuccessMetrics";
import AIFlowOptimization from "@/components/AIFlowOptimization";
import AISalesPitchGenerator from "@/components/AISalesPitchGenerator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Brain, Camera, Shield, AlertTriangle, Sparkles, Calculator, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SecurityAlert {
  success: boolean;
  alert: string;
  riskLevel: string;
  timestamp: string;
}

export default function AIDemo() {
  const [securityPattern, setSecurityPattern] = useState("");
  const [demoPhoto, setDemoPhoto] = useState<string | null>(null);
  const { toast } = useToast();

  // Security alert mutation
  const securityMutation = useMutation({
    mutationFn: async (pattern: string): Promise<SecurityAlert> => {
      const response = await fetch('/api/ai/security-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern })
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate security alert');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "AI Security Analysis Complete",
        description: "Security assessment generated successfully",
      });
    },
    onError: () => {
      toast({
        title: "AI Analysis Failed",
        description: "Unable to generate security assessment",
        variant: "destructive"
      });
    }
  });

  // Photo analysis mutation
  const photoMutation = useMutation({
    mutationFn: async (imageData: string) => {
      const response = await fetch('/api/ai/analyze-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData })
      });
      
      if (!response.ok) {
        throw new Error('Failed to analyze photo');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "AI Photo Analysis Complete",
        description: "Photo quality assessment generated",
      });
    }
  });

  const handleSecurityAnalysis = () => {
    if (securityPattern.trim()) {
      securityMutation.mutate(securityPattern);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        const base64Data = base64.split(',')[1]; // Remove data:image/jpeg;base64, prefix
        setDemoPhoto(base64);
        photoMutation.mutate(base64Data);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-8 p-3 sm:p-6 rounded-xl bg-background min-h-screen">
      <div className="text-center space-y-4">
        <h1 className="text-xl sm:text-3xl font-bold text-fixed">
          AI-Powered Features Demo
        </h1>
        <p className="text-variable max-w-2xl mx-auto">
          Experience the cutting-edge AI capabilities that make VisiGate Pro the most intelligent visitor management system available.
        </p>
        <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
          <Sparkles className="mr-2" size={16} />
          Powered by OpenAI GPT-4o
        </Badge>
      </div>

      {/* AI ROI Calculator Section */}
      <AIROICalculator />
      
      {/* AI Business Intelligence Section */}
      <AIBusinessInsights />
      
      {/* AI Sales & Competitive Analysis Tools */}
      <div className="space-y-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-fixed mb-4">
            🚀 Sales-Focused AI Features
          </h2>
          <p className="text-lg text-variable max-w-3xl mx-auto">
            Powerful AI tools designed to demonstrate clear business value, competitive advantages, 
            and measurable ROI that help close deals and justify investments.
          </p>
        </div>
        
        {/* Competitive Analysis */}
        <AICompetitiveAnalysis />
        
        {/* Customer Success Metrics */}
        <AISuccessMetrics />
        
        {/* Flow Optimization */}
        <AIFlowOptimization />
        
        {/* Sales Pitch Generator */}
        <AISalesPitchGenerator />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* AI Security Analysis */}
        <GlassCard className="bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border-2 border-red-200 dark:border-red-800">
          <div className="flex items-center space-x-3 mb-6">
            <Shield className="text-red-600 dark:text-red-400" size={32} />
            <h2 className="text-xl font-bold text-red-800 dark:text-red-200">AI Security Intelligence</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Describe a security pattern or concern:
              </label>
              <Textarea
                value={securityPattern}
                onChange={(e) => setSecurityPattern(e.target.value)}
                placeholder=""
                className="min-h-[100px]"
                data-testid="security-pattern-input"
              />
            </div>
            
            <Button 
              onClick={handleSecurityAnalysis}
              disabled={!securityPattern.trim() || securityMutation.isPending}
              className="w-full"
              data-testid="analyze-security-button"
            >
              {securityMutation.isPending ? 'Analyzing...' : 'Generate AI Security Assessment'}
            </Button>
            
            {securityMutation.data && (
              <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-fixed">AI Assessment</h3>
                  <Badge 
                    variant={securityMutation.data.riskLevel === 'high' ? 'destructive' : 'secondary'}
                    data-testid="risk-level-badge"
                  >
                    {securityMutation.data.riskLevel.toUpperCase()} RISK
                  </Badge>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300" data-testid="security-assessment">
                  {securityMutation.data.alert}
                </p>
                <p className="text-xs text-variable">
                  Generated: {new Date(securityMutation.data.timestamp).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </GlassCard>

        {/* AI Photo Analysis */}
        <GlassCard className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-2 border-purple-200 dark:border-purple-800">
          <div className="flex items-center space-x-3 mb-6">
            <Camera className="text-purple-600 dark:text-purple-400" size={32} />
            <h2 className="text-xl font-bold text-purple-800 dark:text-purple-200">AI Photo Analysis</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Upload a visitor photo for AI quality analysis:
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg"
                data-testid="photo-upload-input"
              />
            </div>
            
            {demoPhoto && (
              <div className="space-y-3">
                <img 
                  src={demoPhoto} 
                  alt="Demo photo" 
                  className="w-32 h-32 object-cover rounded-lg mx-auto"
                  data-testid="uploaded-photo"
                />
                
                {photoMutation.isPending && (
                  <div className="text-center text-sm text-variable">
                    AI analyzing photo quality...
                  </div>
                )}
                
                {photoMutation.data && (
                  <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-fixed">AI Photo Analysis</h3>
                      <Badge 
                        variant={photoMutation.data.analysis.qualityScore >= 7 ? 'default' : 'secondary'}
                        data-testid="quality-score-badge"
                      >
                        Score: {photoMutation.data.analysis.qualityScore}/10
                      </Badge>
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        <strong>ID Badge Suitable:</strong> {photoMutation.data.analysis.suitabilityForID ? 'Yes' : 'No'}
                      </p>
                      
                      <div>
                        <strong className="text-sm text-slate-700 dark:text-slate-300">AI Summary:</strong>
                        <p className="text-sm text-variable mt-1" data-testid="ai-photo-summary">
                          {photoMutation.data.analysis.aiSummary}
                        </p>
                      </div>
                      
                      {photoMutation.data.analysis.enhancementSuggestions.length > 0 && (
                        <div>
                          <strong className="text-sm text-slate-700 dark:text-slate-300">Suggestions:</strong>
                          <ul className="text-sm text-variable mt-1 space-y-1">
                            {photoMutation.data.analysis.enhancementSuggestions.map((suggestion: string, index: number) => (
                              <li key={index} className="flex items-start">
                                <span className="text-purple-600 mr-2">•</span>
                                {suggestion}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      {/* AI Features Overview */}
      <GlassCard className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-2 border-blue-200 dark:border-blue-800">
        <div className="flex items-center space-x-3 mb-6">
          <Brain className="text-blue-600 dark:text-blue-400" size={32} />
          <h2 className="text-xl font-bold text-blue-800 dark:text-blue-200">Complete AI Feature Set</h2>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg text-center">
            <Shield className="mx-auto mb-2 text-green-600" size={24} />
            <h3 className="font-semibold text-fixed mb-1">Security AI</h3>
            <p className="text-xs text-variable">Threat assessment & risk analysis</p>
          </div>
          
          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg text-center">
            <Camera className="mx-auto mb-2 text-purple-600" size={24} />
            <h3 className="font-semibold text-fixed mb-1">Photo AI</h3>
            <p className="text-xs text-variable">Quality assessment for ID badges</p>
          </div>
          
          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg text-center">
            <Brain className="mx-auto mb-2 text-blue-600" size={24} />
            <h3 className="font-semibold text-fixed mb-1">Predictive AI</h3>
            <p className="text-xs text-variable">Visitor patterns & capacity forecasting</p>
          </div>
          
          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg text-center">
            <Sparkles className="mx-auto mb-2 text-yellow-600" size={24} />
            <h3 className="font-semibold text-fixed mb-1">Smart Insights</h3>
            <p className="text-xs text-variable">Business recommendations & intelligence</p>
          </div>
          
          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg text-center">
            <Calculator className="mx-auto mb-2 text-green-600" size={24} />
            <h3 className="font-semibold text-fixed mb-1">ROI AI</h3>
            <p className="text-xs text-variable">Business value & savings calculation</p>
          </div>
          
          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg text-center">
            <TrendingUp className="mx-auto mb-2 text-pink-600" size={24} />
            <h3 className="font-semibold text-fixed mb-1">Experience AI</h3>
            <p className="text-xs text-variable">Visitor satisfaction & compliance analysis</p>
          </div>
        </div>
        
        <div className="mt-6 bg-blue-100 dark:bg-blue-900/30 p-4 rounded-lg">
          <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">The Complete AI Business Solution</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700 dark:text-blue-300">
            <div>
              <h4 className="font-semibold mb-2">Operational Excellence:</h4>
              <ul className="space-y-1">
                <li>• Real-time threat detection & security analysis</li>
                <li>• Predictive visitor patterns & capacity planning</li>
                <li>• Automated photo quality assessment</li>
                <li>• Intelligent business recommendations</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Business Value:</h4>
              <ul className="space-y-1">
                <li>• ROI analysis with measurable savings</li>
                <li>• Visitor satisfaction & experience monitoring</li>
                <li>• Automated compliance & H&S assurance</li>
                <li>• Future-ready continuous learning system</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-white/50 dark:bg-slate-800/50 rounded-lg">
            <p className="text-center font-semibold text-blue-800 dark:text-blue-200">
              📊 Average Customer ROI: £12,500+ annual savings | 89% efficiency improvement | 3.2 month payback
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}