import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSettingsAutoSave } from "@/hooks/useSettingsAutoSave";
import GlassCard from "@/components/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Brain, Eye, EyeOff, CheckCircle, XCircle, Loader2, RefreshCw, Trash2, TestTube, Bot, Key, AlertTriangle, Info, Save, Video, Zap } from "lucide-react";

interface AiKeyStatus { hasKey: boolean; isActive: boolean; status: string; last4?: string; }
interface AiKeysResponse { openai: AiKeyStatus; gemini: AiKeyStatus; claude: AiKeyStatus; }

export default function AiSettings() {
  const { toast } = useToast();
  const { currentSettings, handleInputChange } = useSettingsAutoSave();
  const [aiKeyInputs, setAiKeyInputs] = useState<{ openai: string; claude: string; gemini: string }>({ openai: '', claude: '', gemini: '' });
  const [aiKeyVisible, setAiKeyVisible] = useState<{ openai: boolean; claude: boolean; gemini: boolean }>({ openai: false, claude: false, gemini: false });
  const [aiKeyTesting, setAiKeyTesting] = useState<{ openai: boolean; claude: boolean; gemini: boolean }>({ openai: false, claude: false, gemini: false });
  const [aiKeyTestResults, setAiKeyTestResults] = useState<{ openai?: string; claude?: string; gemini?: string }>({});

  const { data: aiKeyStatus, refetch: refetchAiKeys } = useQuery<AiKeysResponse>({
    queryKey: ["/api/settings/ai-keys"],
    staleTime: 60000,
  });

  const saveAiKeyMutation = useMutation({
    mutationFn: async (body: { openaiKey?: string; claudeKey?: string; geminiKey?: string }) => {
      const res = await apiRequest("PUT", "/api/settings/ai-keys", body);
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to save key"); }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ai-keys"] });
      const updated = vars.openaiKey ? 'OpenAI' : vars.claudeKey ? 'Claude' : 'Gemini';
      toast({ title: "Key saved", description: `${updated} API key saved successfully.` });
      setAiKeyInputs(prev => ({ ...prev, openai: '', claude: '', gemini: '' }));
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const revokeAiKeyMutation = useMutation({
    mutationFn: async (serviceType: 'openai' | 'claude' | 'gemini') => {
      const res = await apiRequest("DELETE", `/api/settings/ai-keys/${serviceType}`, {});
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to revoke key"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ai-keys"] });
      toast({ title: "Key revoked", description: "API key has been removed." });
    },
    onError: (err: Error) => toast({ title: "Revoke failed", description: err.message, variant: "destructive" }),
  });

  const testAiKey = async (serviceType: 'openai' | 'claude' | 'gemini', tempKey?: string) => {
    setAiKeyTesting(prev => ({ ...prev, [serviceType]: true }));
    setAiKeyTestResults(prev => ({ ...prev, [serviceType]: undefined }));
    try {
      const res = await apiRequest("POST", "/api/settings/ai-keys/test", { serviceType, tempKey: tempKey || undefined });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Test failed");
      setAiKeyTestResults(prev => ({ ...prev, [serviceType]: data.success ? `✓ ${data.message || "Connection successful"}` : `✗ ${data.message || "Test failed"}` }));
    } catch (err: any) {
      setAiKeyTestResults(prev => ({ ...prev, [serviceType]: `✗ ${err.message}` }));
    } finally {
      setAiKeyTesting(prev => ({ ...prev, [serviceType]: false }));
    }
  };

  return (
    <div className="space-y-6">
<TooltipProvider delayDuration={200}>
<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
  <GlassCard>
    <div className="flex items-center mb-6">
      <Brain className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
      <h3 className="text-lg font-semibold text-fixed">OpenAI Configuration</h3>
    </div>
    
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label className="text-sm font-medium text-fixed">AI Model</Label>
          <Tooltip>
            <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
            <TooltipContent className="max-w-xs">Controls which AI model generates induction scripts and safety content. Claude Sonnet 4 is recommended — best quality for multi-scene scripts. Claude and Gemini models require their respective API keys configured below. GPT models are billed via platform AI credits.</TooltipContent>
          </Tooltip>
        </div>
        <Select
          value={currentSettings?.openaiModel || "gpt-4o"}
          onValueChange={(value) => handleInputChange("openaiModel", value)}
        >
          <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50" data-testid="select-openai-model">
            <SelectValue placeholder="Select AI model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_openai_header" disabled className="text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-default pointer-events-none">── OpenAI ──</SelectItem>
            <SelectItem value="gpt-4">GPT-4 (Standard)</SelectItem>
            <SelectItem value="gpt-4o">GPT-4o (Optimised)</SelectItem>
            <SelectItem value="gpt-4.1">GPT-4.1</SelectItem>
            <SelectItem value="gpt-5">GPT-5 (Latest)</SelectItem>
            <SelectItem value="_claude_header" disabled className="text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-default pointer-events-none">── Anthropic (Claude) ──</SelectItem>
            <SelectItem value="claude-3-haiku-20240307">Claude 3 Haiku — Fast</SelectItem>
            <SelectItem value="claude-3-5-haiku-20241022">Claude 3.5 Haiku — Fast</SelectItem>
            <SelectItem value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</SelectItem>
            <SelectItem value="claude-sonnet-4-6">Claude Sonnet 4 ✦ Recommended</SelectItem>
            <SelectItem value="claude-opus-4-5">Claude Opus 4 — Most Capable</SelectItem>
            <SelectItem value="_gemini_header" disabled className="text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-default pointer-events-none">── Google (Gemini) ──</SelectItem>
            <SelectItem value="gemini-2.0-flash">Gemini 2.0 Flash</SelectItem>
            <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
            <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
            <SelectItem value="gemini-3.0-flash">Gemini 3.0 Flash</SelectItem>
            <SelectItem value="gemini-3.1-flash">Gemini 3.1 Flash</SelectItem>
          </SelectContent>
        </Select>
        {(currentSettings?.openaiModel || "gpt-4o").startsWith("claude-") && aiKeyStatus !== undefined && !aiKeyStatus.claude.hasKey && (
          <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-xl text-sm text-yellow-800 dark:text-yellow-300">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
            <span>A Claude model is selected but no Anthropic API key is configured. Add one below in <strong>AI Provider API Keys</strong>.</span>
          </div>
        )}
        {(currentSettings?.openaiModel || "gpt-4o").startsWith("gemini-") && aiKeyStatus !== undefined && !aiKeyStatus.gemini.hasKey && (
          <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-xl text-sm text-yellow-800 dark:text-yellow-300">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
            <span>A Gemini model is selected but no Google API key is configured. Add one below in <strong>AI Provider API Keys</strong>.</span>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="openaiMaxTokens" className="text-sm font-medium text-fixed">Max Response Length (Tokens)</Label>
          <Tooltip>
            <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
            <TooltipContent className="max-w-xs">Sets the maximum length of AI-generated text. 4,000 tokens is about 3,000 words — suitable for induction scripts. Longer settings cost more in credits. Only increase if your induction videos are being cut short.</TooltipContent>
          </Tooltip>
        </div>
        <Select
          value={currentSettings?.openaiMaxTokens || "4000"}
          onValueChange={(value) => handleInputChange("openaiMaxTokens", value)}
        >
          <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50" data-testid="select-max-tokens">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1000">1,000 tokens (Short responses)</SelectItem>
            <SelectItem value="2000">2,000 tokens (Medium responses)</SelectItem>
            <SelectItem value="4000">4,000 tokens (Long responses)</SelectItem>
            <SelectItem value="8000">8,000 tokens (Very long responses)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-variable">
          Higher token limits allow for more detailed AI responses
        </p>
      </div>
    </div>
  </GlassCard>
</div>
<GlassCard>
  <div className="flex items-center mb-6">
    <Key className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
    <div>
      <h3 className="text-lg font-semibold text-fixed">AI Provider API Keys</h3>
      <p className="text-xs text-variable mt-0.5">Keys are encrypted and stored securely. Only the last 4 characters are shown after saving.</p>
    </div>
  </div>
  <div className="space-y-6">
    {([ 
      { id: 'openai' as const, label: 'OpenAI', description: 'For GPT-4, GPT-4o, GPT-4.1, GPT-5 models', placeholder: 'sk-...', badgeClass: 'border-green-300 text-green-700 dark:text-green-400', fieldKey: 'openaiKey' },
      { id: 'claude' as const, label: 'Anthropic (Claude)', description: 'For Claude 3 Haiku, 3.5 Sonnet, Sonnet 4, Opus 4', placeholder: 'sk-ant-...', badgeClass: 'border-purple-300 text-purple-700 dark:text-purple-400', fieldKey: 'claudeKey' },
      { id: 'gemini' as const, label: 'Google Gemini', description: 'For Gemini 2.5 Flash, 2.5 Pro, Gemini 3 and Imagen 4 models', placeholder: 'AIza... or AQ...', badgeClass: 'border-blue-300 text-blue-700 dark:text-blue-400', fieldKey: 'geminiKey' },
    ]).map(({ id, label, description, placeholder, badgeClass, fieldKey }) => {
      const status = aiKeyStatus?.[id];
      const inputVal = aiKeyInputs[id];
      const visible = aiKeyVisible[id];
      const testing = aiKeyTesting[id];
      const testResult = aiKeyTestResults[id];
      return (
        <div key={id} className="border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-fixed">{label}</p>
              <p className="text-xs text-variable">{description}</p>
            </div>
            {status?.hasKey ? (
              <Badge variant="outline" className={`text-xs ${badgeClass}`}>
                Active — ···{status.last4}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground">Not configured</Badge>
            )}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={visible ? "text" : "password"}
                placeholder={status?.hasKey ? `Replace existing key (currently ···${status.last4})` : placeholder}
                value={inputVal}
                onChange={(e) => setAiKeyInputs(prev => ({ ...prev, [id]: e.target.value }))}
                className="pr-10 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setAiKeyVisible(prev => ({ ...prev, [id]: !prev[id] }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {visible ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!inputVal.trim() || testing || saveAiKeyMutation.isPending}
              onClick={() => saveAiKeyMutation.mutate({ [fieldKey]: inputVal })}
            >
              {saveAiKeyMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span className="ml-1 hidden sm:inline">Save</span>
            </Button>
          </div>
          {(status?.hasKey || inputVal.trim()) && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-2"
                disabled={testing}
                onClick={() => testAiKey(id, inputVal.trim() || undefined)}
              >
                {testing ? <Loader2 size={12} className="animate-spin mr-1" /> : <Zap size={12} className="mr-1" />}
                Test connection
              </Button>
              {status?.hasKey && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                  disabled={revokeAiKeyMutation.isPending}
                  onClick={() => revokeAiKeyMutation.mutate(id)}
                >
                  <Trash2 size={12} className="mr-1" /> Revoke
                </Button>
              )}
              {testResult && (
                <span className={`text-xs font-medium ${testResult.startsWith('✓') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {testResult}
                </span>
              )}
            </div>
          )}
        </div>
      );
    })}
  </div>
</GlassCard>
</TooltipProvider>
    </div>
  );
}
