import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Users, Video, FileQuestion, Eye, Sparkles, CheckCircle, XCircle,
  Maximize2, List, RefreshCw, Trash2, AlertCircle, Clock, ChevronRight,
  BookOpen, Shield, Flame, HardHat, ClipboardList
} from "lucide-react";
import type { InductionQuestion } from "@shared/schema";

interface InductionSettingRow {
  id: string;
  roleType: string;
  videoTitle: string;
  videoUrl: string;
  videoFormat: string;
  modelType: string;
  passPercentage: number;
  generatedHtml?: string | null;
  scenesData?: string | null;
  generatedAt?: string | null;
  questionsGenerated?: boolean;
  videoDurationMinutes?: number;
  updatedAt?: string;
}

interface GenerationStatus {
  status: 'idle' | 'pending' | 'generating_script' | 'building_slides' | 'creating_questions' | 'saving' | 'done' | 'failed';
  step: number;
  totalSteps: number;
  message: string;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

const GENERATION_STEPS = [
  { key: 'generating_script', label: 'Generating AI script', icon: BookOpen },
  { key: 'building_slides', label: 'Building slides', icon: Video },
  { key: 'creating_questions', label: 'Creating quiz questions', icon: FileQuestion },
  { key: 'saving', label: 'Saving to database', icon: ClipboardList },
  { key: 'done', label: 'Complete', icon: CheckCircle },
];

const CATEGORY_ICONS: Record<string, any> = {
  'Emergency Procedures': Flame,
  'PPE & Equipment': HardHat,
  'Legal Responsibilities': Shield,
  'Hazard Identification': AlertCircle,
  'Site Rules & Safe Working': ClipboardList,
};

interface RoleCardProps {
  roleType: 'visitor' | 'staff' | 'contractor';
  settings: InductionSettingRow | null;
  questions: InductionQuestion[];
  onQuestionsRefetch: () => void;
}

const RoleCard = ({ roleType, settings, questions, onQuestionsRefetch }: RoleCardProps) => {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>({ status: 'idle', step: 0, totalSteps: 5, message: '' });
  const [showPreview, setShowPreview] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [isRegeneratingQuestions, setIsRegeneratingQuestions] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const isGenerating = ['pending', 'generating_script', 'building_slides', 'creating_questions', 'saving'].includes(generationStatus.status);

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'visitor': return 'Visitors';
      case 'staff': return 'Staff';
      case 'contractor': return 'Contractors';
      default: return role;
    }
  };

  const getRoleDescription = (role: string) => {
    switch (role) {
      case 'visitor': return 'Brief UK HSE-compliant overview for site visitors';
      case 'staff': return 'Comprehensive induction for permanent and temporary staff';
      case 'contractor': return 'Safety-focused induction including permit to work and CDM regulations';
      default: return '';
    }
  };

  const getProgressPercent = () => {
    if (generationStatus.status === 'idle') return 0;
    if (generationStatus.status === 'done') return 100;
    if (generationStatus.status === 'failed') return 0;
    return Math.round((generationStatus.step / generationStatus.totalSteps) * 100);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/induction/status/${roleType}`, { credentials: 'include' });
        if (!res.ok) return;
        const statusData: GenerationStatus = await res.json();
        setGenerationStatus(statusData);

        if (statusData.status === 'done') {
          stopPolling();
          toast({ title: "Video Generated", description: statusData.message });
          queryClient.invalidateQueries({ queryKey: ['/api/induction/questions', roleType] });
          queryClient.invalidateQueries({ queryKey: ['/api/induction/settings'] });
          onQuestionsRefetch();
          // Load preview HTML
          try {
            const videoRes = await fetch(`/api/induction/video/${roleType}`, { credentials: 'include' });
            if (videoRes.ok) {
              const html = await videoRes.text();
              setPreviewHtml(html);
            }
          } catch (_e) {}
        } else if (statusData.status === 'failed') {
          stopPolling();
          toast({ title: "Generation Failed", description: statusData.error || 'Please try again.', variant: 'destructive' });
        }
      } catch (_e) {}
    }, 3000);
  };

  // Auto-load existing video when settings shows it was generated
  useEffect(() => {
    if (settings?.generatedAt && !previewHtml && generationStatus.status === 'idle') {
      fetch(`/api/induction/video/${roleType}`, { credentials: 'include' })
        .then(res => {
          if (res.ok && res.headers.get('content-type')?.includes('text/html')) return res.text();
          return null;
        })
        .then(html => {
          if (html && !html.includes('No video generated yet')) setPreviewHtml(html);
        })
        .catch(() => {});
    }
  }, [settings?.generatedAt, roleType]);

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const handleGenerateVideo = async () => {
    try {
      setGenerationStatus({ status: 'pending', step: 0, totalSteps: 5, message: 'Starting generation...' });
      const response = await apiRequest('POST', `/api/induction/generate-video/${roleType}`, {});
      const data = await response.json();

      if (data.started) {
        setGenerationStatus({ status: 'generating_script', step: 1, totalSteps: 5, message: 'Generating AI safety script...' });
        startPolling();
      } else if (data.error) {
        setGenerationStatus({ status: 'failed', step: 0, totalSteps: 5, message: data.error, error: data.error });
        toast({ title: "Generation Failed", description: data.error, variant: 'destructive' });
      }
    } catch (error: any) {
      const msg = error?.message || 'Could not start generation. Please try again.';
      setGenerationStatus({ status: 'failed', step: 0, totalSteps: 5, message: msg, error: msg });
      toast({ title: "Generation Failed", description: msg, variant: 'destructive' });
    }
  };

  const handleRegenerateQuestions = async () => {
    setIsRegeneratingQuestions(true);
    try {
      const response = await apiRequest('POST', `/api/induction/generate-questions/${roleType}`, {});
      const data = await response.json();
      if (data.success) {
        toast({ title: "Questions Updated", description: `Generated ${data.questionsGenerated} new questions` });
        queryClient.invalidateQueries({ queryKey: ['/api/induction/questions', roleType] });
        onQuestionsRefetch();
      } else {
        toast({ title: "Failed", description: data.error || 'Could not regenerate questions', variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: "Failed", description: error?.message || 'Could not regenerate questions', variant: 'destructive' });
    } finally {
      setIsRegeneratingQuestions(false);
    }
  };

  const handleCleanupQuestions = async () => {
    setIsCleaningUp(true);
    try {
      const response = await fetch(`/api/induction/questions/cleanup?roleType=${roleType}&nuclear=true`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: "Questions Cleared", description: `All questions removed for ${getRoleDisplayName(roleType)} — regenerate to get fresh ones` });
        queryClient.invalidateQueries({ queryKey: ['/api/induction/questions', roleType] });
        onQuestionsRefetch();
      }
    } catch (error: any) {
      toast({ title: "Failed", description: 'Could not clear questions', variant: 'destructive' });
    } finally {
      setIsCleaningUp(false);
    }
  };

  const handleOpenPreview = async () => {
    if (previewHtml) {
      setShowPreview(true);
      return;
    }
    try {
      const res = await fetch(`/api/induction/video/${roleType}`, { credentials: 'include' });
      if (res.ok && res.headers.get('content-type')?.includes('text/html')) {
        const html = await res.text();
        if (!html.includes('No video generated yet')) {
          setPreviewHtml(html);
          setShowPreview(true);
          return;
        }
      }
    } catch (_e) {}
    toast({ title: "No video available", description: "Please generate a video first.", variant: 'destructive' });
  };

  const handleOpenFullscreen = () => {
    if (previewHtml) {
      const newWindow = window.open('', '_blank');
      if (newWindow) {
        newWindow.document.write(previewHtml);
        newWindow.document.close();
      }
    }
  };

  const hasVideo = settings?.generatedAt || previewHtml;
  const questionsByCategory = questions.reduce((acc, q) => {
    const cat = q.category || 'General Safety';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(q);
    return acc;
  }, {} as Record<string, InductionQuestion[]>);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              {getRoleDisplayName(roleType)} Induction
            </CardTitle>
            <CardDescription className="mt-1">{getRoleDescription(roleType)}</CardDescription>
          </div>
          {hasVideo && !isGenerating && (
            <Badge className="bg-green-600 text-white shrink-0">
              <CheckCircle className="h-3 w-3 mr-1" />
              Ready
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Video Status */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-blue-600" />
            <h3 className="font-medium text-sm">Video Status</h3>
          </div>

          {isGenerating ? (
            <div className="space-y-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                <p className="text-sm font-medium text-blue-900">{generationStatus.message}</p>
              </div>
              <Progress value={getProgressPercent()} className="h-2" />
              <div className="flex items-center gap-1 flex-wrap">
                {GENERATION_STEPS.map((step, idx) => {
                  const stepNum = idx + 1;
                  const isCurrent = generationStatus.step === stepNum;
                  const isDone = generationStatus.step > stepNum || generationStatus.status === 'done';
                  const StepIcon = step.icon;
                  return (
                    <div key={step.key} className="flex items-center gap-1">
                      <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-all ${
                        isDone ? 'bg-green-100 text-green-700' :
                        isCurrent ? 'bg-blue-100 text-blue-700 font-medium' :
                        'bg-gray-100 text-gray-400'
                      }`}>
                        <StepIcon className="h-3 w-3" />
                        <span>{step.label}</span>
                      </div>
                      {idx < GENERATION_STEPS.length - 1 && (
                        <ChevronRight className="h-3 w-3 text-gray-300" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : generationStatus.status === 'failed' ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-600" />
                <p className="text-sm font-medium text-red-900">Generation Failed</p>
              </div>
              {generationStatus.error && (
                <p className="text-xs text-red-700 mt-1 ml-6">{generationStatus.error}</p>
              )}
              <p className="text-xs text-red-600 mt-2 ml-6">Click Generate Video to try again.</p>
            </div>
          ) : hasVideo ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-green-900">
                    <CheckCircle className="inline h-4 w-4 mr-1 text-green-600" />
                    Video Ready
                  </p>
                  <p className="text-xs text-green-700">
                    <Clock className="inline h-3 w-3 mr-1" />
                    {settings?.videoDurationMinutes ? `~${settings.videoDurationMinutes} min · ` : ''}
                    {settings?.generatedAt
                      ? `Generated ${new Date(settings.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                      : 'Ready to preview'}
                  </p>
                  {settings?.questionsGenerated && (
                    <p className="text-xs text-green-600">
                      <CheckCircle className="inline h-3 w-3 mr-1" />
                      Quiz questions generated
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <Button variant="outline" size="sm" onClick={handleOpenPreview} className="gap-1">
                    <Eye className="h-3 w-3" />
                    Preview
                  </Button>
                  {previewHtml && (
                    <Button variant="ghost" size="sm" onClick={handleOpenFullscreen} className="gap-1 text-xs h-7">
                      <Maximize2 className="h-3 w-3" />
                      Full Screen
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-sm text-gray-600">
                No video generated yet. Click "Generate Video" to create a professional UK HSE-compliant induction.
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleGenerateVideo}
            disabled={isGenerating}
            className="flex-1 min-w-[160px] flex items-center gap-2"
            data-testid={`button-generate-video-${roleType}`}
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {hasVideo ? 'Regenerate Video' : 'Generate Video'}
              </>
            )}
          </Button>

          {/* Questions Button — always visible once video has been generated */}
          {(questions.length > 0 || hasVideo) && (
            <Dialog open={showQuestions} onOpenChange={setShowQuestions}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="flex items-center gap-2"
                  data-testid={`button-view-questions-${roleType}`}
                >
                  <List className="h-4 w-4" />
                  Questions ({questions.length})
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FileQuestion className="h-5 w-5" />
                    {getRoleDisplayName(roleType)} Quiz Questions
                    <Badge variant="outline" className="ml-auto">{questions.length} questions</Badge>
                  </DialogTitle>
                </DialogHeader>

                {/* Question management actions */}
                <div className="flex gap-2 pt-2 pb-1 border-b">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRegenerateQuestions}
                    disabled={isRegeneratingQuestions}
                    className="gap-1 text-xs"
                  >
                    {isRegeneratingQuestions ? (
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Regenerate Questions
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCleanupQuestions}
                    disabled={isCleaningUp}
                    className="gap-1 text-xs text-red-600 hover:bg-red-50"
                    title="Delete ALL questions and start fresh"
                  >
                    {isCleaningUp ? (
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Clear All
                  </Button>
                </div>

                {/* Empty state */}
                {questions.length === 0 && (
                  <div className="py-8 text-center text-gray-500">
                    <FileQuestion className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">No questions yet</p>
                    <p className="text-xs mt-1">Generate a video or click "Regenerate Questions" to create quiz questions.</p>
                  </div>
                )}

                {/* Questions grouped by category */}
                <div className="space-y-5 mt-2">
                  {Object.entries(questionsByCategory).map(([category, catQuestions]) => {
                    const CatIcon = CATEGORY_ICONS[category] || FileQuestion;
                    return (
                      <div key={category}>
                        <div className="flex items-center gap-2 mb-3">
                          <CatIcon className="h-4 w-4 text-blue-600" />
                          <h4 className="font-medium text-sm text-blue-900">{category}</h4>
                          <Badge variant="secondary" className="text-xs">{catQuestions.length}</Badge>
                        </div>
                        <div className="space-y-3">
                          {catQuestions.map((q, index) => (
                            <div key={q.id} className="p-4 bg-gray-50 rounded-lg border">
                              <div className="flex items-start gap-3">
                                <Badge variant="outline" className="shrink-0 text-xs">Q{index + 1}</Badge>
                                <div className="space-y-2 flex-1">
                                  <p className="font-medium text-sm">{q.questionText}</p>
                                  <div className="grid gap-1 text-xs">
                                    {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                                      const optKey = `option${opt}` as keyof typeof q;
                                      const optionText = q[optKey];
                                      if (!optionText) return null;
                                      const isCorrect = q.correctAnswer === opt;
                                      return (
                                        <div
                                          key={opt}
                                          className={`p-2 rounded flex items-start gap-2 ${isCorrect ? 'bg-green-50 border border-green-200' : 'bg-white border'}`}
                                        >
                                          <span className={`font-semibold shrink-0 ${isCorrect ? 'text-green-700' : 'text-gray-500'}`}>{opt}.</span>
                                          <span className={isCorrect ? 'text-green-800' : ''}>{String(optionText)}</span>
                                          {isCorrect && <CheckCircle className="h-3 w-3 ml-auto shrink-0 text-green-600 mt-0.5" />}
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {q.explanation && (
                                    <p className="text-xs text-blue-700 bg-blue-50 p-2 rounded border-l-2 border-blue-300 mt-1 italic">
                                      {q.explanation}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* What's included */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <p className="font-medium text-blue-900 mb-2">What's included:</p>
          <ul className="space-y-1 text-xs text-blue-800">
            <li className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-blue-600" /> Professional AI-generated slides with company branding</li>
            <li className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-blue-600" /> UK HSE 2024 compliant content tailored to your industry</li>
            <li className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-blue-600" /> 10 scenario-based quiz questions covering 5 safety categories</li>
            <li className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-blue-600" /> 80% pass mark required for compliance certification</li>
            <li className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-blue-600" /> Role-specific content (Visitors / Staff / Contractors)</li>
          </ul>
        </div>

        {/* AI Model badge */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Sparkles className="h-3 w-3 text-purple-500" />
          <span>Powered by <span className="font-medium text-purple-700">GPT-5</span> via Replit AI — billed to Replit credits</span>
        </div>

        {/* Inline Preview Dialog */}
        {showPreview && previewHtml && (
          <Dialog open={showPreview} onOpenChange={setShowPreview}>
            <DialogContent className="max-w-[96vw] max-h-[96vh] w-full h-full p-0">
              <DialogHeader className="p-4 pb-0 flex-row items-center justify-between">
                <DialogTitle>{getRoleDisplayName(roleType)} Induction Preview</DialogTitle>
                <Button variant="outline" size="sm" onClick={handleOpenFullscreen} className="gap-1 mr-8">
                  <Maximize2 className="h-4 w-4" />
                  Full Screen
                </Button>
              </DialogHeader>
              <div className="flex-1 h-[85vh] p-4 pt-2">
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-full border-0 rounded-lg"
                  title={`${roleType} Induction Preview`}
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
};

export default function InductionSettings() {
  const [activeRole, setActiveRole] = useState<'visitor' | 'staff' | 'contractor'>('visitor');
  const queryClient = useQueryClient();

  const { data: allSettings = [] } = useQuery<InductionSettingRow[]>({
    queryKey: ['/api/induction/settings'],
    queryFn: async () => {
      const res = await fetch('/api/induction/settings', { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.settings) ? data.settings : [];
    },
    staleTime: 30000
  });

  const settingsByRole = (allSettings as InductionSettingRow[]).reduce((acc, s) => {
    acc[s.roleType] = s;
    return acc;
  }, {} as Record<string, InductionSettingRow>);

  const { data: visitorQuestions = [], refetch: refetchVisitor } = useQuery<InductionQuestion[]>({
    queryKey: ['/api/induction/questions', 'visitor'],
    queryFn: async () => {
      const res = await fetch('/api/induction/questions?roleType=visitor', { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.questions) ? data.questions : [];
    }
  });

  const { data: staffQuestions = [], refetch: refetchStaff } = useQuery<InductionQuestion[]>({
    queryKey: ['/api/induction/questions', 'staff'],
    queryFn: async () => {
      const res = await fetch('/api/induction/questions?roleType=staff', { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.questions) ? data.questions : [];
    }
  });

  const { data: contractorQuestions = [], refetch: refetchContractor } = useQuery<InductionQuestion[]>({
    queryKey: ['/api/induction/questions', 'contractor'],
    queryFn: async () => {
      const res = await fetch('/api/induction/questions?roleType=contractor', { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.questions) ? data.questions : [];
    }
  });

  const getQuestions = (roleType: string) => {
    switch (roleType) {
      case 'visitor': return visitorQuestions;
      case 'staff': return staffQuestions;
      case 'contractor': return contractorQuestions;
      default: return [];
    }
  };

  const getRefetch = (roleType: string) => {
    switch (roleType) {
      case 'visitor': return refetchVisitor;
      case 'staff': return refetchStaff;
      case 'contractor': return refetchContractor;
      default: return refetchVisitor;
    }
  };

  const ROLES: Array<'visitor' | 'staff' | 'contractor'> = ['visitor', 'staff', 'contractor'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl sm:text-3xl font-bold">Health & Safety Induction</h1>
        <p className="text-muted-foreground text-sm">
          Create professional UK HSE-compliant induction presentations for your team
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeRole} onValueChange={(v) => setActiveRole(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="visitor" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Visitors</span>
            {visitorQuestions.length > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5">{visitorQuestions.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="staff" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Staff</span>
            {staffQuestions.length > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5">{staffQuestions.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="contractor" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Contractors</span>
            {contractorQuestions.length > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5">{contractorQuestions.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {ROLES.map(role => (
          <TabsContent key={role} value={role} className="space-y-4 mt-6">
            <RoleCard
              roleType={role}
              settings={settingsByRole[role] || null}
              questions={getQuestions(role)}
              onQuestionsRefetch={() => {
                getRefetch(role)();
                queryClient.invalidateQueries({ queryKey: ['/api/induction/settings'] });
              }}
            />
          </TabsContent>
        ))}
      </Tabs>

      {/* Help / About */}
      <Card className="bg-amber-50 border-amber-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-amber-700" />
            About Induction Videos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-amber-900">
          <p>
            Induction videos are AI-generated using your company settings and industry context, and are designed to meet
            <strong> UK Health & Safety Executive (HSE)</strong> compliance requirements.
          </p>
          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            <div className="space-y-1">
              <p className="font-semibold">What's covered:</p>
              <ul className="space-y-0.5 ml-2">
                <li>• Welcome & site orientation</li>
                <li>• UK legal framework (HASAWA 1974)</li>
                <li>• PPE requirements & usage</li>
                <li>• Hazard identification & control</li>
              </ul>
            </div>
            <div className="space-y-1">
              <p className="font-semibold">Plus role-specific:</p>
              <ul className="space-y-0.5 ml-2">
                <li>• Emergency procedures & evacuation</li>
                <li>• Incident & near-miss reporting</li>
                <li>• Contractor: Permit to Work / CDM</li>
                <li>• Staff: DSE, ergonomics, wellbeing</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-amber-700 pt-1">
            After completing the video, users must pass a 10-question knowledge assessment (80% pass mark) to confirm understanding and achieve compliance status.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
