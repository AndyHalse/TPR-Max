import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Brain, 
  Eye, 
  EyeOff, 
  TestTube, 
  CheckCircle, 
  XCircle, 
  Settings, 
  Shield, 
  Key,
  RefreshCw,
  AlertTriangle,
  Info,
  Zap,
  Activity,
  Lock,
  Unlock,
  Sparkles
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ApiKeyStatus {
  id?: string;
  serviceType: 'openai' | 'gemini' | 'claude';
  hasKey: boolean;
  last4: string;
  isActive: boolean;
  lastUsed: string | null;
  usageCount: number;
  status: 'active' | 'inactive' | 'error';
}

interface TestResult {
  success: boolean;
  message: string;
  model?: string;
  credits?: number;
}

interface AppSettings {
  openaiModel?: string;
  [key: string]: unknown;
}

type ActiveProvider = 'openai' | 'gemini' | 'claude' | null;

function getActiveProvider(model: string | undefined): ActiveProvider {
  if (!model) return 'openai';
  if (model.startsWith('claude-')) return 'claude';
  if (model.startsWith('gemini-')) return 'gemini';
  return 'openai';
}

function getModelLabel(model: string | undefined): string {
  if (!model) return 'GPT-4o (OpenAI)';
  const labels: Record<string, string> = {
    'gpt-4':            'GPT-4 (OpenAI)',
    'gpt-4o':           'GPT-4o (OpenAI)',
    'gpt-5':            'GPT-5 (OpenAI)',
    'claude-3-5-sonnet': 'Claude 3.5 Sonnet (Anthropic)',
    'claude-3-opus':    'Claude 3 Opus (Anthropic)',
    'claude-3-haiku':   'Claude 3 Haiku (Anthropic)',
    'gemini-pro':       'Gemini Pro (Google)',
    'gemini-2.5-flash': 'Gemini 2.5 Flash (Google)',
  };
  if (labels[model]) return labels[model];
  if (model.startsWith('claude-')) return `${model} (Anthropic)`;
  if (model.startsWith('gemini-')) return `${model} (Google)`;
  return `${model} (OpenAI)`;
}

export default function AISettings() {
  const { toast } = useToast();
  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [claudeKey, setClaudeKey] = useState("");
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // Fetch general settings to read active AI model
  const { data: appSettings, isSuccess: settingsLoaded } = useQuery<AppSettings>({
    queryKey: ["/api/settings"],
  });

  const activeModel = appSettings?.openaiModel as string | undefined;
  const activeProvider = getActiveProvider(activeModel);
  const activeModelLabel = getModelLabel(activeModel);

  // Fetch current API key status
  const { data: apiKeyStatus, isLoading } = useQuery<{
    openai: ApiKeyStatus;
    gemini: ApiKeyStatus;
    claude: ApiKeyStatus;
  }>({
    queryKey: ["/api/settings/ai-keys"],
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  // Save API keys mutation
  const saveKeysMutation = useMutation({
    mutationFn: async (data: { openaiKey?: string; geminiKey?: string; claudeKey?: string }) => {
      const response = await apiRequest("PUT", "/api/settings/ai-keys", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ai-keys"] });
      toast({
        title: "API Keys Updated",
        description: "Your AI API keys have been securely saved and encrypted.",
      });
      setOpenaiKey("");
      setGeminiKey("");
      setClaudeKey("");
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save API keys. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Test API key mutations
  const testOpenaiMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/settings/ai-keys/test", { 
        serviceType: "openai",
        tempKey: openaiKey || undefined
      });
      return response.json();
    },
    onSuccess: (result: TestResult) => {
      toast({
        title: result.success ? "OpenAI Connection Successful" : "OpenAI Connection Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    },
    onError: (error: any) => {
      toast({
        title: "OpenAI Test Failed",
        description: error.message || "Failed to test OpenAI connection.",
        variant: "destructive",
      });
    },
  });

  const testGeminiMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/settings/ai-keys/test", { 
        serviceType: "gemini",
        tempKey: geminiKey || undefined
      });
      return response.json();
    },
    onSuccess: (result: TestResult) => {
      toast({
        title: result.success ? "Gemini Connection Successful" : "Gemini Connection Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Gemini Test Failed",
        description: error.message || "Failed to test Gemini connection.",
        variant: "destructive",
      });
    },
  });

  const testClaudeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/settings/ai-keys/test", {
        serviceType: "claude",
        tempKey: claudeKey || undefined,
      });
      return response.json();
    },
    onSuccess: (result: TestResult) => {
      toast({
        title: result.success ? "Claude Connection Successful" : "Claude Connection Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Claude Test Failed",
        description: error.message || "Failed to test Claude connection.",
        variant: "destructive",
      });
    },
  });

  // Revoke API key mutation
  const revokeKeyMutation = useMutation({
    mutationFn: async (serviceType: 'openai' | 'gemini' | 'claude') => {
      const response = await apiRequest("DELETE", `/api/settings/ai-keys/${serviceType}`);
      return response.json();
    },
    onSuccess: (_, serviceType) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ai-keys"] });
      const label = serviceType === 'openai' ? 'OpenAI' : serviceType === 'gemini' ? 'Gemini' : 'Claude';
      toast({
        title: "API Key Revoked",
        description: `Your ${label} API key has been securely removed.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Revoke Failed",
        description: error.message || "Failed to revoke API key. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSaveKeys = (provider?: 'openai' | 'gemini' | 'claude') => {
    const data: { openaiKey?: string; geminiKey?: string; claudeKey?: string } = {};
    if (!provider || provider === 'openai') if (openaiKey.trim()) data.openaiKey = openaiKey.trim();
    if (!provider || provider === 'gemini') if (geminiKey.trim()) data.geminiKey = geminiKey.trim();
    if (!provider || provider === 'claude') if (claudeKey.trim()) data.claudeKey = claudeKey.trim();
    
    if (Object.keys(data).length === 0) {
      toast({
        title: "No Keys to Save",
        description: "Please enter at least one API key to save.",
        variant: "destructive",
      });
      return;
    }
    
    saveKeysMutation.mutate(data);
  };

  const formatLastUsed = (timestamp: string | null) => {
    if (!timestamp) return "Never used";
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(timestamp));
  };

  const getStatusBadge = (status: ApiKeyStatus) => {
    if (!status.hasKey) {
      return <Badge variant="outline" data-testid="status-not-configured">Not Configured</Badge>;
    }
    
    switch (status.status) {
      case 'active':
        return <Badge variant="default" className="bg-green-500" data-testid="status-active">Active</Badge>;
      case 'inactive':
        return <Badge variant="secondary" data-testid="status-inactive">Inactive</Badge>;
      case 'error':
        return <Badge variant="destructive" data-testid="status-error">Error</Badge>;
      default:
        return <Badge variant="outline" data-testid="status-unknown">Unknown</Badge>;
    }
  };

  const validateApiKey = (key: string, type: 'openai' | 'gemini' | 'claude'): boolean => {
    if (!key.trim()) return false;
    
    if (type === 'openai') {
      return key.startsWith('sk-') && key.length >= 20;
    } else if (type === 'gemini') {
      return key.length >= 20 && /^[A-Za-z0-9_-]+$/.test(key);
    } else if (type === 'claude') {
      return key.startsWith('sk-ant-') && key.length >= 20;
    }
    
    return false;
  };

  const emptyStatus = (serviceType: 'openai' | 'gemini' | 'claude'): ApiKeyStatus => ({
    serviceType,
    hasKey: false,
    last4: '',
    isActive: false,
    lastUsed: null,
    usageCount: 0,
    status: 'inactive'
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Loading AI settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800 p-3 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Brain className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            <h1 className="text-xl sm:text-3xl font-bold text-slate-800 dark:text-slate-200">AI Settings</h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Securely manage your OpenAI, Gemini, and Claude API keys. All keys are encrypted and stored in your isolated customer database.
          </p>
        </div>

        {/* Security Alert */}
        <Alert className="max-w-4xl mx-auto" data-testid="security-alert">
          <Shield className="h-4 w-4" />
          <AlertTitle>Enterprise Security</AlertTitle>
          <AlertDescription>
            Your API keys are encrypted using AES-256 encryption and stored in your dedicated database. 
            Only the last 4 characters are displayed for security. All access is logged for audit purposes.
          </AlertDescription>
        </Alert>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="max-w-4xl mx-auto">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <Activity className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="openai" data-testid="tab-openai">
              <Zap className="h-4 w-4 mr-2" />
              OpenAI
            </TabsTrigger>
            <TabsTrigger value="gemini" data-testid="tab-gemini">
              <Brain className="h-4 w-4 mr-2" />
              Gemini
            </TabsTrigger>
            <TabsTrigger value="claude" data-testid="tab-claude">
              <Sparkles className="h-4 w-4 mr-2" />
              Claude
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">

            {/* Currently Active Banner */}
            {settingsLoaded && <div
              className="flex items-center gap-3 rounded-xl border-2 border-blue-500 bg-blue-50 dark:bg-blue-950/40 px-5 py-4"
              data-testid="active-provider-banner"
            >
              <CheckCircle className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                  Currently Active Model
                </p>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100" data-testid="active-model-label">
                  {activeModelLabel}
                </p>
              </div>
              <div className="ml-auto">
                <Badge className="bg-blue-600 text-white text-xs">Active</Badge>
              </div>
            </div>}

            <div className="grid md:grid-cols-3 gap-6">
              
              {/* OpenAI Status Card */}
              <GlassCard className={settingsLoaded && activeProvider === 'openai' ? "ring-2 ring-blue-500" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-orange-500" />
                      OpenAI
                      {settingsLoaded && activeProvider === 'openai' && (
                        <Badge className="ml-1 bg-blue-600 text-white text-xs" data-testid="badge-active-openai">Active</Badge>
                      )}
                    </CardTitle>
                    {getStatusBadge(apiKeyStatus?.openai || emptyStatus('openai'))}
                  </div>
                  <CardDescription>
                    GPT models for text generation and analysis
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {apiKeyStatus?.openai?.hasKey ? (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">API Key</span>
                        <span className="font-mono" data-testid="openai-key-display">
                          sk-...{apiKeyStatus.openai.last4}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Last Used</span>
                        <span data-testid="openai-last-used">
                          {formatLastUsed(apiKeyStatus.openai.lastUsed)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Total Requests</span>
                        <span data-testid="openai-usage-count">
                          {apiKeyStatus.openai.usageCount?.toLocaleString() || 0}
                        </span>
                      </div>
                      <div className="pt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => testOpenaiMutation.mutate()}
                          disabled={testOpenaiMutation.isPending}
                          data-testid="button-test-openai"
                        >
                          {testOpenaiMutation.isPending ? (
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <TestTube className="h-4 w-4 mr-2" />
                          )}
                          Test
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => revokeKeyMutation.mutate('openai')}
                          disabled={revokeKeyMutation.isPending}
                          data-testid="button-revoke-openai"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Revoke
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-4 text-slate-500 dark:text-slate-400">
                      <Key className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No API key configured</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2"
                        onClick={() => setActiveTab('openai')}
                        data-testid="button-configure-openai"
                      >
                        Configure
                      </Button>
                    </div>
                  )}
                </CardContent>
              </GlassCard>

              {/* Gemini Status Card */}
              <GlassCard className={settingsLoaded && activeProvider === 'gemini' ? "ring-2 ring-blue-500" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-blue-500" />
                      Gemini
                      {settingsLoaded && activeProvider === 'gemini' && (
                        <Badge className="ml-1 bg-blue-600 text-white text-xs" data-testid="badge-active-gemini">Active</Badge>
                      )}
                    </CardTitle>
                    {getStatusBadge(apiKeyStatus?.gemini || emptyStatus('gemini'))}
                  </div>
                  <CardDescription>
                    Google's Gemini models for text and image generation
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {apiKeyStatus?.gemini?.hasKey ? (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">API Key</span>
                        <span className="font-mono" data-testid="gemini-key-display">
                          ...{apiKeyStatus.gemini.last4}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Last Used</span>
                        <span data-testid="gemini-last-used">
                          {formatLastUsed(apiKeyStatus.gemini.lastUsed)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Total Requests</span>
                        <span data-testid="gemini-usage-count">
                          {apiKeyStatus.gemini.usageCount?.toLocaleString() || 0}
                        </span>
                      </div>
                      <div className="pt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => testGeminiMutation.mutate()}
                          disabled={testGeminiMutation.isPending}
                          data-testid="button-test-gemini"
                        >
                          {testGeminiMutation.isPending ? (
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <TestTube className="h-4 w-4 mr-2" />
                          )}
                          Test
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => revokeKeyMutation.mutate('gemini')}
                          disabled={revokeKeyMutation.isPending}
                          data-testid="button-revoke-gemini"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Revoke
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-4 text-slate-500 dark:text-slate-400">
                      <Key className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No API key configured</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2"
                        onClick={() => setActiveTab('gemini')}
                        data-testid="button-configure-gemini"
                      >
                        Configure
                      </Button>
                    </div>
                  )}
                </CardContent>
              </GlassCard>

              {/* Claude Status Card */}
              <GlassCard className={settingsLoaded && activeProvider === 'claude' ? "ring-2 ring-blue-500" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-purple-500" />
                      Claude
                      {settingsLoaded && activeProvider === 'claude' && (
                        <Badge className="ml-1 bg-blue-600 text-white text-xs" data-testid="badge-active-claude">Active</Badge>
                      )}
                    </CardTitle>
                    {getStatusBadge(apiKeyStatus?.claude || emptyStatus('claude'))}
                  </div>
                  <CardDescription>
                    Anthropic's Claude models for advanced text generation
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {apiKeyStatus?.claude?.hasKey ? (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">API Key</span>
                        <span className="font-mono" data-testid="claude-key-display">
                          sk-ant-...{apiKeyStatus.claude.last4}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Last Used</span>
                        <span data-testid="claude-last-used">
                          {formatLastUsed(apiKeyStatus.claude.lastUsed)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Total Requests</span>
                        <span data-testid="claude-usage-count">
                          {apiKeyStatus.claude.usageCount?.toLocaleString() || 0}
                        </span>
                      </div>
                      <div className="pt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => testClaudeMutation.mutate()}
                          disabled={testClaudeMutation.isPending}
                          data-testid="button-test-claude"
                        >
                          {testClaudeMutation.isPending ? (
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <TestTube className="h-4 w-4 mr-2" />
                          )}
                          Test Connection
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => revokeKeyMutation.mutate('claude')}
                          disabled={revokeKeyMutation.isPending}
                          data-testid="button-revoke-claude"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Revoke
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-4 text-slate-500 dark:text-slate-400">
                      <Key className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No API key configured</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => setActiveTab('claude')}
                        data-testid="button-configure-claude"
                      >
                        Configure Claude Key
                      </Button>
                    </div>
                  )}
                </CardContent>
              </GlassCard>
            </div>
          </TabsContent>

          {/* OpenAI Tab */}
          <TabsContent value="openai" className="space-y-6">
            <GlassCard>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-orange-500" />
                  OpenAI API Configuration
                </CardTitle>
                <CardDescription>
                  Configure your OpenAI API key for GPT models and text generation features.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                
                {/* Current Status */}
                {apiKeyStatus?.openai?.hasKey && (
                  <Alert data-testid="openai-current-status">
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Current key: <span className="font-mono">sk-...{apiKeyStatus.openai.last4}</span> • 
                      Status: {getStatusBadge(apiKeyStatus.openai)} • 
                      Last used: {formatLastUsed(apiKeyStatus.openai.lastUsed)}
                    </AlertDescription>
                  </Alert>
                )}

                {/* API Key Input */}
                <div className="space-y-2">
                  <Label htmlFor="openai-key">OpenAI API Key</Label>
                  <div className="relative">
                    <Input
                      id="openai-key"
                      type={showOpenaiKey ? "text" : "password"}
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      placeholder="sk-..."
                      className="pr-10"
                      data-testid="input-openai-key"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      data-testid="button-toggle-openai-visibility"
                    >
                      {showOpenaiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {openaiKey && !validateApiKey(openaiKey, 'openai') && (
                    <p className="text-sm text-red-500 flex items-center gap-1" data-testid="openai-validation-error">
                      <AlertTriangle className="h-4 w-4" />
                      Invalid OpenAI API key format. Keys should start with 'sk-'
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={() => testOpenaiMutation.mutate()}
                    disabled={!openaiKey || !validateApiKey(openaiKey, 'openai') || testOpenaiMutation.isPending}
                    variant="outline"
                    data-testid="button-test-openai-new"
                  >
                    {testOpenaiMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <TestTube className="h-4 w-4 mr-2" />
                    )}
                    Test Key
                  </Button>
                  <Button
                    onClick={() => handleSaveKeys('openai')}
                    disabled={!openaiKey || saveKeysMutation.isPending}
                    data-testid="button-save-keys"
                  >
                    {saveKeysMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Lock className="h-4 w-4 mr-2" />
                    )}
                    Save Encrypted
                  </Button>
                  {apiKeyStatus?.openai?.hasKey && (
                    <Button
                      variant="destructive"
                      onClick={() => revokeKeyMutation.mutate('openai')}
                      disabled={revokeKeyMutation.isPending}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Revoke Key
                    </Button>
                  )}
                </div>

                {/* Help Text */}
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Get your OpenAI API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 dark:text-blue-400">platform.openai.com/api-keys</a>. 
                    Your key will be encrypted and stored securely in your customer database.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </GlassCard>
          </TabsContent>

          {/* Gemini Tab */}
          <TabsContent value="gemini" className="space-y-6">
            <GlassCard>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-blue-500" />
                  Gemini API Configuration
                </CardTitle>
                <CardDescription>
                  Configure your Google Gemini API key for advanced text and image generation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                
                {/* Current Status */}
                {apiKeyStatus?.gemini?.hasKey && (
                  <Alert data-testid="gemini-current-status">
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Current key: <span className="font-mono">...{apiKeyStatus.gemini.last4}</span> • 
                      Status: {getStatusBadge(apiKeyStatus.gemini)} • 
                      Last used: {formatLastUsed(apiKeyStatus.gemini.lastUsed)}
                    </AlertDescription>
                  </Alert>
                )}

                {/* API Key Input */}
                <div className="space-y-2">
                  <Label htmlFor="gemini-key">Gemini API Key</Label>
                  <div className="relative">
                    <Input
                      id="gemini-key"
                      type={showGeminiKey ? "text" : "password"}
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      placeholder="AIza..."
                      className="pr-10"
                      data-testid="input-gemini-key"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGeminiKey(!showGeminiKey)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      data-testid="button-toggle-gemini-visibility"
                    >
                      {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {geminiKey && !validateApiKey(geminiKey, 'gemini') && (
                    <p className="text-sm text-red-500 flex items-center gap-1" data-testid="gemini-validation-error">
                      <AlertTriangle className="h-4 w-4" />
                      Invalid Gemini API key format. Keys should be alphanumeric.
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={() => testGeminiMutation.mutate()}
                    disabled={!geminiKey || !validateApiKey(geminiKey, 'gemini') || testGeminiMutation.isPending}
                    variant="outline"
                    data-testid="button-test-gemini-new"
                  >
                    {testGeminiMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <TestTube className="h-4 w-4 mr-2" />
                    )}
                    Test Key
                  </Button>
                  <Button
                    onClick={() => handleSaveKeys('gemini')}
                    disabled={!geminiKey || saveKeysMutation.isPending}
                    data-testid="button-save-keys-gemini"
                  >
                    {saveKeysMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Lock className="h-4 w-4 mr-2" />
                    )}
                    Save Encrypted
                  </Button>
                  {apiKeyStatus?.gemini?.hasKey && (
                    <Button
                      variant="destructive"
                      onClick={() => revokeKeyMutation.mutate('gemini')}
                      disabled={revokeKeyMutation.isPending}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Revoke Key
                    </Button>
                  )}
                </div>

                {/* Help Text */}
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Get your Gemini API key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 dark:text-blue-400">Google AI Studio</a>. 
                    Your key will be encrypted and stored securely in your customer database.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </GlassCard>
          </TabsContent>

          {/* Claude Tab */}
          <TabsContent value="claude" className="space-y-6">
            <GlassCard>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-purple-500" />
                  Anthropic / Claude API Configuration
                </CardTitle>
                <CardDescription>
                  Configure your Anthropic API key to use Claude models (claude-3-5-sonnet, claude-3-opus, claude-3-haiku) for AI features.
                  Use this when you need an alternative to OpenAI or want to use Claude's specific strengths.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                
                {/* Current Status */}
                {apiKeyStatus?.claude?.hasKey ? (
                  <Alert data-testid="claude-current-status">
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Current key: <span className="font-mono">sk-ant-...{apiKeyStatus.claude.last4}</span> • 
                      Status: {getStatusBadge(apiKeyStatus.claude)} • 
                      Last used: {formatLastUsed(apiKeyStatus.claude.lastUsed)}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert data-testid="claude-no-key-notice">
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      No Claude API key is configured. Claude models will appear as options in AI settings, but require a key to be active.
                      You can add a key below to enable Claude-powered features.
                    </AlertDescription>
                  </Alert>
                )}

                {/* API Key Input */}
                <div className="space-y-2">
                  <Label htmlFor="claude-key">Anthropic API Key</Label>
                  <div className="relative">
                    <Input
                      id="claude-key"
                      type={showClaudeKey ? "text" : "password"}
                      value={claudeKey}
                      onChange={(e) => setClaudeKey(e.target.value)}
                      placeholder="sk-ant-..."
                      className="pr-10"
                      data-testid="input-claude-key"
                    />
                    <button
                      type="button"
                      onClick={() => setShowClaudeKey(!showClaudeKey)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      data-testid="button-toggle-claude-visibility"
                    >
                      {showClaudeKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {claudeKey && !validateApiKey(claudeKey, 'claude') && (
                    <p className="text-sm text-red-500 flex items-center gap-1" data-testid="claude-validation-error">
                      <AlertTriangle className="h-4 w-4" />
                      Invalid Claude API key format. Keys should start with 'sk-ant-'
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={() => testClaudeMutation.mutate()}
                    disabled={!claudeKey || !validateApiKey(claudeKey, 'claude') || testClaudeMutation.isPending}
                    variant="outline"
                    data-testid="button-test-claude-new"
                  >
                    {testClaudeMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <TestTube className="h-4 w-4 mr-2" />
                    )}
                    Test Key
                  </Button>
                  <Button
                    onClick={() => handleSaveKeys('claude')}
                    disabled={!claudeKey || saveKeysMutation.isPending}
                    data-testid="button-save-keys-claude"
                  >
                    {saveKeysMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Lock className="h-4 w-4 mr-2" />
                    )}
                    Save Encrypted
                  </Button>
                  {apiKeyStatus?.claude?.hasKey && (
                    <Button
                      variant="destructive"
                      onClick={() => revokeKeyMutation.mutate('claude')}
                      disabled={revokeKeyMutation.isPending}
                      data-testid="button-revoke-claude-tab"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Revoke Key
                    </Button>
                  )}
                </div>

                {/* Help Text */}
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Get your Anthropic API key from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 dark:text-blue-400">console.anthropic.com</a>. 
                    Your key will be encrypted and stored securely. Once saved, select a Claude model in <strong>Settings &rarr; AI Settings</strong> to activate it.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </GlassCard>
          </TabsContent>
        </Tabs>

        {/* Footer Info */}
        <div className="max-w-4xl mx-auto">
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertTitle>Security & Privacy</AlertTitle>
            <AlertDescription className="mt-2">
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>All API keys are encrypted using AES-256 before storage</li>
                <li>Keys are stored in your isolated customer database</li>
                <li>Only the last 4 characters are displayed for identification</li>
                <li>All key management actions are logged for security auditing</li>
                <li>Keys can be revoked instantly and rotation is supported</li>
              </ul>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </div>
  );
}
