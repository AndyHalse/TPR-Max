import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Brain, 
  Camera, 
  Shield, 
  AlertTriangle, 
  Sparkles, 
  Calculator, 
  TrendingUp,
  FileText,
  Calendar as CalendarIcon,
  Mail,
  Download,
  Plus,
  Clock,
  Users,
  Target,
  Send,
  BarChart3,
  PieChart,
  Activity,
  Star
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { Report } from "@shared/schema";

interface SecurityAlert {
  success: boolean;
  alert: string;
  riskLevel: string;
  timestamp: string;
}

export default function AIDemo() {
  const [securityPattern, setSecurityPattern] = useState("");
  const [demoPhoto, setDemoPhoto] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<Date>(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [reportType, setReportType] = useState("weekly");
  const [emailRecipients, setEmailRecipients] = useState("");
  const { toast } = useToast();

  const { data: reports, isLoading: reportsLoading } = useQuery<Report[]>({
    queryKey: ["/api/reports"],
  });

  const { data: settings } = useQuery<{ email?: string; reportRecipients?: string }>({
    queryKey: ["/api/settings"],
  });

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

  const generateReportMutation = useMutation({
    mutationFn: async (data: { reportType: string; dateFrom: Date; dateTo: Date }) => {
      const response = await apiRequest("POST", "/api/reports/generate", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Success",
        description: "Report generated successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate report",
        variant: "destructive",
      });
    },
  });

  const emailReportMutation = useMutation({
    mutationFn: async (data: { id: string; recipients: string[] }) => {
      const response = await apiRequest("POST", `/api/reports/${data.id}/email`, {
        recipients: data.recipients,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Success",
        description: "Report emailed successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to email report",
        variant: "destructive",
      });
    },
  });

  const handleGenerateReport = () => {
    generateReportMutation.mutate({
      reportType,
      dateFrom,
      dateTo,
    });
  };

  const handleEmailReport = (reportId: string) => {
    const recipients = emailRecipients
      ? emailRecipients.split(",").map(email => email.trim())
      : [settings?.email || settings?.reportRecipients?.[0] || "admin@company.com"];

    if (recipients.length === 0) {
      toast({
        title: "Error",
        description: "Please provide email recipients",
        variant: "destructive",
      });
      return;
    }

    emailReportMutation.mutate({
      id: reportId,
      recipients,
    });
  };

  const formatReportType = (type: string | undefined) => {
    if (!type) return "Unknown";
    if (type.startsWith("auto_")) {
      return `Auto ${type.replace("auto_", "").charAt(0).toUpperCase() + type.replace("auto_", "").slice(1)}`;
    }
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const getReportTypeColor = (type: string | undefined) => {
    if (!type) return "bg-gray-100 text-gray-800";
    if (type.startsWith("auto_")) return "bg-green-100 text-green-800";
    return "bg-blue-100 text-blue-800";
  };

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
    <div className="space-y-8 p-6 rounded-xl bg-background min-h-screen">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200">
          AI-Powered Features Demo
        </h1>
        <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
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
          <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-200 mb-4">
            🚀 Sales-Focused AI Features
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-3xl mx-auto">
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
                placeholder="e.g., 'Multiple visitors from unknown companies arriving at the same time' or 'Visitor attempting to access restricted areas'"
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
                  <h3 className="font-semibold text-slate-800 dark:text-slate-200">AI Assessment</h3>
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
                <p className="text-xs text-slate-500 dark:text-slate-400">
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
                  <div className="text-center text-sm text-slate-600 dark:text-slate-400">
                    AI analyzing photo quality...
                  </div>
                )}
                
                {photoMutation.data && (
                  <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-slate-800 dark:text-slate-200">AI Photo Analysis</h3>
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
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1" data-testid="ai-photo-summary">
                          {photoMutation.data.analysis.aiSummary}
                        </p>
                      </div>
                      
                      {photoMutation.data.analysis.enhancementSuggestions.length > 0 && (
                        <div>
                          <strong className="text-sm text-slate-700 dark:text-slate-300">Suggestions:</strong>
                          <ul className="text-sm text-slate-600 dark:text-slate-400 mt-1 space-y-1">
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
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Security AI</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">Threat assessment & risk analysis</p>
          </div>
          
          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg text-center">
            <Camera className="mx-auto mb-2 text-purple-600" size={24} />
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Photo AI</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">Quality assessment for ID badges</p>
          </div>
          
          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg text-center">
            <Brain className="mx-auto mb-2 text-blue-600" size={24} />
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Predictive AI</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">Visitor patterns & capacity forecasting</p>
          </div>
          
          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg text-center">
            <Sparkles className="mx-auto mb-2 text-yellow-600" size={24} />
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Smart Insights</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">Business recommendations & intelligence</p>
          </div>
          
          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg text-center">
            <Calculator className="mx-auto mb-2 text-green-600" size={24} />
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">ROI AI</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">Business value & savings calculation</p>
          </div>
          
          <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg text-center">
            <TrendingUp className="mx-auto mb-2 text-pink-600" size={24} />
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Experience AI</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">Visitor satisfaction & compliance analysis</p>
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

      {/* Reports & Analytics Section */}
      <div className="space-y-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-200 mb-4">
            📊 Advanced Reports & Analytics
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-3xl mx-auto">
            Comprehensive reporting system with automated generation, email distribution, and detailed analytics 
            showing measurable business value and ROI.
          </p>
        </div>

        {/* Advanced Analytics Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
          <GlassCard className="dark:glass-dark">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">ROI Impact</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                  £12.5K
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">Saved annually</p>
              </div>
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                <Target className="text-green-600 dark:text-green-400" size={24} />
              </div>
            </div>
          </GlassCard>
          
          <GlassCard className="dark:glass-dark">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Efficiency Gain</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                  89%
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">vs manual logging</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                <Activity className="text-blue-600 dark:text-blue-400" size={24} />
              </div>
            </div>
          </GlassCard>
          
          <GlassCard className="dark:glass-dark">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">User Rating</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">
                  4.9/5
                </p>
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">98% satisfaction</p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl flex items-center justify-center">
                <Star className="text-yellow-600 dark:text-yellow-400" size={24} />
              </div>
            </div>
          </GlassCard>
          
          <GlassCard className="dark:glass-dark">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Cost Savings</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                  67%
                </p>
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">vs traditional systems</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                <PieChart className="text-purple-600 dark:text-purple-400" size={24} />
              </div>
            </div>
          </GlassCard>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Generate New Report */}
          <GlassCard>
            <div className="flex items-center mb-6">
              <Plus className="mr-3 text-blue-600" size={24} />
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Generate New Report</h3>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reportType" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Report Type
                </Label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 dark:bg-slate-800/50" data-testid="select-report-type">
                    <SelectValue placeholder="Select report type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily Report</SelectItem>
                    <SelectItem value="weekly">Weekly Report</SelectItem>
                    <SelectItem value="monthly">Monthly Report</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">From Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 dark:bg-slate-800/50 justify-start text-left font-normal"
                        data-testid="button-date-from"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateFrom ? format(dateFrom, "MMM dd, yyyy") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateFrom}
                        onSelect={(date) => date && setDateFrom(date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">To Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 dark:bg-slate-800/50 justify-start text-left font-normal"
                        data-testid="button-date-to"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateTo ? format(dateTo, "MMM dd, yyyy") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateTo}
                        onSelect={(date) => date && setDateTo(date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              
              <Button
                onClick={handleGenerateReport}
                disabled={generateReportMutation.isPending}
                className="w-full gradient-blue text-white font-medium hover:shadow-lg transition-all duration-300"
                data-testid="button-generate-report"
              >
                <FileText className="mr-2" size={16} />
                {generateReportMutation.isPending ? "Generating..." : "Generate Report"}
              </Button>
            </div>
          </GlassCard>

          {/* Quick Stats */}
          <GlassCard>
            <div className="flex items-center mb-6">
              <TrendingUp className="mr-3 text-blue-600" size={24} />
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Quick Stats</h3>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl">
                  <div className="text-2xl font-bold text-blue-600 mb-1">
                    {reports?.length || 0}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">Total Reports</div>
                </div>
                
                <div className="text-center p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl">
                  <div className="text-2xl font-bold text-green-600 mb-1">
                    {reports?.filter(r => r.emailSent).length || 0}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">Reports Emailed</div>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Email Recipients (optional - defaults to administrator)
                </Label>
                <Input
                  type="text"
                  placeholder={`Default: ${settings?.email || settings?.reportRecipients?.[0] || 'admin@company.com'}`}
                  value={emailRecipients}
                  onChange={(e) => setEmailRecipients(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
                  data-testid="input-email-recipients"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Leave empty to send to administrator email: {settings?.email || settings?.reportRecipients?.[0] || 'admin@company.com'}
                </p>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Reports List */}
        <GlassCard>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Generated Reports</h3>
            <Button
              variant="outline"
              className="bg-gradient-to-r from-green-600 to-emerald-600 text-white font-medium hover:shadow-lg transition-all duration-300"
              data-testid="button-export-all"
            >
              <Download className="mr-2" size={16} />
              Export All
            </Button>
          </div>
          
          {!reports || reports.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-slate-600 dark:text-slate-400 text-lg">No reports generated yet</p>
              <p className="text-slate-500 dark:text-slate-500 text-sm mt-2">Generate your first report to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/50 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Report
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Period
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Stats
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/20 dark:divide-slate-700/20">
                  {reports.map((report) => (
                    <tr key={report.id} className="hover:bg-white/20 dark:hover:bg-slate-800/20" data-testid={`report-${report.id}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <FileText className="mr-3 text-blue-600" size={16} />
                          <div>
                            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {formatReportType(report.type)} Report
                            </div>
                            <div className="text-sm text-slate-500 dark:text-slate-400">
                              {format(new Date(report.generatedAt), "MMM dd, yyyy 'at' h:mm a")}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">
                        {format(new Date(report.dateFrom), "MMM dd")} - {format(new Date(report.dateTo), "MMM dd, yyyy")}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">
                        <div className="space-y-1">
                          <div>Visitors: {report.totalVisitors}</div>
                          <div>Staff: {report.totalStaff}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col space-y-2">
                          <Badge 
                            className={getReportTypeColor(report.type)}
                            data-testid={`report-type-${report.id}`}
                          >
                            {formatReportType(report.type)}
                          </Badge>
                          {report.emailSent && (
                            <Badge 
                              variant="secondary" 
                              className="bg-green-100 text-green-800"
                              data-testid={`email-status-${report.id}`}
                            >
                              <Mail className="mr-1" size={12} />
                              Emailed
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="hover:bg-blue-50"
                          data-testid={`download-report-${report.id}`}
                        >
                          <Download className="mr-1" size={12} />
                          Download
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEmailReport(report.id)}
                          disabled={emailReportMutation.isPending}
                          className="hover:bg-green-50"
                          data-testid={`email-report-${report.id}`}
                        >
                          <Send className="mr-1" size={12} />
                          Email
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}