import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Users, Video, FileQuestion, Eye, Sparkles, CheckCircle, XCircle,
  Maximize2, List, RefreshCw, Trash2, AlertCircle, Clock, ChevronRight,
  BookOpen, Shield, Flame, HardHat, ClipboardList, Send, Monitor,
  ChevronDown, Settings, Mail, Loader2
} from "lucide-react";
import type { InductionQuestion, CompanySettings } from "@shared/schema";

interface InductionSettingRow {
  id: string;
  roleType: string;
  videoTitle: string;
  videoUrl: string;
  videoFormat: string;
  modelType: string;
  passPercentage: number;
  isActive?: boolean;
  kioskEnabled?: boolean;
  sendLinkEnabled?: boolean;
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
  companySettings?: CompanySettings | null;
}

const RoleCard = ({ roleType, settings, questions, onQuestionsRefetch, companySettings }: RoleCardProps) => {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>({ status: 'idle', step: 0, totalSteps: 5, message: '' });
  const [showQuestions, setShowQuestions] = useState(false);
  const [showSendLink, setShowSendLink] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [isRegeneratingQuestions, setIsRegeneratingQuestions] = useState(false);
  const [isTogglingKiosk, setIsTogglingKiosk] = useState(false);
  const [kioskEnabled, setKioskEnabled] = useState<boolean>(settings?.kioskEnabled ?? false);
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [sendName, setSendName] = useState('');
  const [sendEmail, setSendEmail] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [personFilter, setPersonFilter] = useState('');
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const isGenerating = ['pending', 'generating_script', 'building_slides', 'creating_questions', 'saving'].includes(generationStatus.status);

  useEffect(() => {
    setKioskEnabled(settings?.kioskEnabled ?? false);
  }, [settings?.kioskEnabled]);

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
        if (!res.ok) {
          if (res.status === 401) stopPolling();
          return;
        }
        const statusData: GenerationStatus = await res.json();
        setGenerationStatus(statusData);

        if (statusData.status === 'done') {
          stopPolling();
          toast({ title: "Video Generated", description: statusData.message });
          queryClient.invalidateQueries({ queryKey: ['/api/induction/questions', roleType] });
          queryClient.invalidateQueries({ queryKey: ['/api/induction/settings'] });
          onQuestionsRefetch();
        } else if (statusData.status === 'failed') {
          stopPolling();
          toast({ title: "Generation Failed", description: statusData.error || 'Please try again.', variant: 'destructive' });
        }
      } catch (_e) {}
    }, 3000);
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  // Person list queries — enabled only when send dialog is open
  const { data: workersList = [], isLoading: workersLoading } = useQuery<any[]>({
    queryKey: ['/api/contractors/workers/all'],
    enabled: showSendLink && roleType === 'contractor',
  });
  const { data: staffListRaw = [], isLoading: staffLoading } = useQuery<any[]>({
    queryKey: ['/api/staff'],
    enabled: showSendLink && roleType === 'staff',
  });
  const { data: visitorsListRaw = [], isLoading: visitorsLoading } = useQuery<any>({
    queryKey: ['/api/visitors'],
    enabled: showSendLink && roleType === 'visitor',
  });
  const staffList: any[] = Array.isArray(staffListRaw) ? staffListRaw : (staffListRaw as any)?.staff ?? [];
  const visitorsList: any[] = Array.isArray(visitorsListRaw) ? visitorsListRaw : (visitorsListRaw as any)?.visitors ?? [];

  const peopleLoading = (roleType === 'contractor' && workersLoading) || (roleType === 'staff' && staffLoading) || (roleType === 'visitor' && visitorsLoading);
  const peopleList: { id: string; name: string; email: string; subtitle: string }[] = (() => {
    if (roleType === 'contractor') return workersList.map((w: any) => ({ id: w.id, name: `${w.firstName} ${w.lastName}`, email: w.email || '', subtitle: w.companyName || '' }));
    if (roleType === 'staff') return staffList.map((s: any) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, email: s.email || '', subtitle: s.department || s.jobTitle || '' }));
    if (roleType === 'visitor') return visitorsList.map((v: any) => ({ id: v.id, name: `${v.firstName} ${v.lastName}`, email: v.email || '', subtitle: v.company || v.organisation || '' }));
    return [];
  })();
  const filteredPeople = personFilter.trim()
    ? peopleList.filter(p => `${p.name} ${p.subtitle} ${p.email}`.toLowerCase().includes(personFilter.toLowerCase()))
    : peopleList;

  const handlePersonSelect = (person: { id: string; name: string; email: string }) => {
    setSelectedPersonId(person.id);
    setSendName(person.name);
    setSendEmail(person.email);
  };

  const handleCloseSendDialog = (open: boolean) => {
    setShowSendLink(open);
    if (!open) {
      setSelectedPersonId(null);
      setSendName('');
      setSendEmail('');
      setManualMode(false);
      setPersonFilter('');
    }
  };

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
        toast({ title: "Questions Cleared", description: `All questions removed — regenerate to get fresh ones` });
        queryClient.invalidateQueries({ queryKey: ['/api/induction/questions', roleType] });
        onQuestionsRefetch();
      }
    } catch (error: any) {
      toast({ title: "Failed", description: 'Could not clear questions', variant: 'destructive' });
    } finally {
      setIsCleaningUp(false);
    }
  };

  const handleKioskToggle = async (enabled: boolean) => {
    setIsTogglingKiosk(true);
    const prev = kioskEnabled;
    setKioskEnabled(enabled);
    try {
      await apiRequest('PATCH', `/api/induction/settings/${roleType}/toggle`, { kioskEnabled: enabled });
      queryClient.invalidateQueries({ queryKey: ['/api/induction/settings'] });
      toast({
        title: enabled ? "Kiosk induction enabled" : "Kiosk induction disabled",
        description: enabled
          ? `${getRoleDisplayName(roleType)} will complete induction during walk-in check-in`
          : `Induction will not be shown during ${getRoleDisplayName(roleType).toLowerCase()} check-in`
      });
    } catch (error: any) {
      setKioskEnabled(prev);
      toast({ title: "Failed", description: 'Could not update kiosk setting', variant: 'destructive' });
    } finally {
      setIsTogglingKiosk(false);
    }
  };

  const handleSendLink = async () => {
    if (!sendName.trim() || !sendEmail.trim()) {
      toast({ title: "Missing details", description: "Please enter a name and email address", variant: 'destructive' });
      return;
    }
    setIsSendingLink(true);
    try {
      const personType = roleType === 'visitor' ? 'visitor' : roleType === 'staff' ? 'staff' : 'contractor';
      const body: Record<string, any> = {
        personType,
        personName: sendName.trim(),
        personEmail: sendEmail.trim(),
      };
      if (!manualMode && selectedPersonId) {
        if (roleType === 'contractor') body.workerId = selectedPersonId;
        else if (roleType === 'staff') body.staffId = selectedPersonId;
        else if (roleType === 'visitor') body.visitorId = selectedPersonId;
      }
      const response = await apiRequest('POST', '/api/induction/send', body);
      const data = await response.json();
      if (data.message) {
        toast({ title: "Induction link sent", description: `Email sent to ${sendEmail}` });
        handleCloseSendDialog(false);
      } else {
        toast({ title: "Failed", description: data.error || 'Could not send link', variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: "Failed", description: error?.message || 'Could not send link', variant: 'destructive' });
    } finally {
      setIsSendingLink(false);
    }
  };

  const handleOpenPreview = () => {
    setLocation(`/induction-preview/${roleType}`);
  };

  const handleOpenFullscreen = () => {
    window.open(`/induction-preview/${roleType}`, '_blank');
  };

  const hasVideo = settings?.generatedAt != null;
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
            <div className="space-y-3 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">{generationStatus.message}</p>
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
                        isDone ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' :
                        isCurrent ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium' :
                        'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                      }`}>
                        <StepIcon className="h-3 w-3" />
                        <span>{step.label}</span>
                      </div>
                      {idx < GENERATION_STEPS.length - 1 && (
                        <ChevronRight className="h-3 w-3 text-gray-300 dark:text-gray-600" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : generationStatus.status === 'failed' ? (
            <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-600" />
                <p className="text-sm font-medium text-red-900 dark:text-red-200">Generation Failed</p>
              </div>
              {generationStatus.error && (
                <p className="text-xs text-red-700 dark:text-red-300 mt-1 ml-6">{generationStatus.error}</p>
              )}
              <p className="text-xs text-red-600 dark:text-red-400 mt-2 ml-6">Click Generate Video to try again.</p>
            </div>
          ) : hasVideo ? (
            <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-green-900 dark:text-green-100">
                    <CheckCircle className="inline h-4 w-4 mr-1 text-green-600 dark:text-green-400" />
                    Video Ready
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300">
                    <Clock className="inline h-3 w-3 mr-1" />
                    {settings?.videoDurationMinutes ? `~${settings.videoDurationMinutes} min · ` : ''}
                    {settings?.generatedAt
                      ? `Generated ${new Date(settings.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                      : 'Ready to preview'}
                  </p>
                  {settings?.questionsGenerated && (
                    <p className="text-xs text-green-600 dark:text-green-400">
                      <CheckCircle className="inline h-3 w-3 mr-1" />
                      {questions.length > 0 ? `${questions.length} quiz questions ready` : 'Quiz questions generated'}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <Button variant="outline" size="sm" onClick={handleOpenPreview} className="gap-1">
                    <Eye className="h-3 w-3" />
                    Preview
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleOpenFullscreen} className="gap-1 text-xs h-7">
                    <Maximize2 className="h-3 w-3" />
                    Full Screen
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-300">
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
                      <Loader2 className="h-3 w-3 animate-spin" />
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
                      <Loader2 className="h-3 w-3 animate-spin text-red-600" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Clear All
                  </Button>
                </div>

                {/* Empty state */}
                {questions.length === 0 && (
                  <div className="py-8 text-center text-gray-500 dark:text-gray-400">
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
                          <CatIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          <h4 className="font-medium text-sm text-blue-900 dark:text-blue-200">{category}</h4>
                          <Badge variant="secondary" className="text-xs">{catQuestions.length}</Badge>
                        </div>
                        <div className="space-y-3">
                          {catQuestions.map((q, index) => (
                            <div key={q.id} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border dark:border-gray-700">
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
                                          className={`p-2 rounded flex items-start gap-2 ${isCorrect ? 'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800' : 'bg-white dark:bg-gray-900 border dark:border-gray-700'}`}
                                        >
                                          <span className={`font-semibold shrink-0 ${isCorrect ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>{opt}.</span>
                                          <span className={isCorrect ? 'text-green-800 dark:text-green-300' : ''}>{String(optionText)}</span>
                                          {isCorrect && <CheckCircle className="h-3 w-3 ml-auto shrink-0 text-green-600 dark:text-green-400 mt-0.5" />}
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {q.explanation && (
                                    <p className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 p-2 rounded border-l-2 border-blue-300 dark:border-blue-700 mt-1 italic">
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

          {/* Send Link button */}
          {hasVideo && (
            <Dialog open={showSendLink} onOpenChange={handleCloseSendDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2" data-testid={`button-send-link-${roleType}`}>
                  <Send className="h-4 w-4" />
                  Send Link
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-blue-600" />
                    Send {getRoleDisplayName(roleType)} Induction Link
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <p className="text-sm text-muted-foreground">
                    Select a {roleType === 'contractor' ? 'worker' : roleType === 'staff' ? 'staff member' : 'visitor'} to send a secure induction link. The recipient completes the video and quiz remotely.
                  </p>

                  {!manualMode ? (
                    <div className="space-y-2">
                      <Label>Select {roleType === 'contractor' ? 'Worker' : roleType === 'staff' ? 'Staff Member' : 'Visitor'}</Label>
                      <Input
                        placeholder="Search by name, company or email…"
                        value={personFilter}
                        onChange={e => setPersonFilter(e.target.value)}
                        className="text-sm"
                      />
                      <div className="border rounded-lg max-h-48 overflow-y-auto">
                        {peopleLoading ? (
                          <div className="py-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                          </div>
                        ) : filteredPeople.length === 0 ? (
                          <div className="py-6 text-center text-sm text-muted-foreground">
                            {personFilter ? 'No results match your search' : `No ${roleType === 'contractor' ? 'workers' : roleType === 'staff' ? 'staff' : 'visitors'} found`}
                          </div>
                        ) : (
                          filteredPeople.map(person => (
                            <button
                              key={person.id}
                              type="button"
                              onClick={() => handlePersonSelect(person)}
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors border-b dark:border-gray-700 last:border-b-0 ${selectedPersonId === person.id ? 'bg-blue-100 dark:bg-blue-900 border-l-2 border-l-blue-500' : ''}`}
                            >
                              <div className="font-medium">{person.name}</div>
                              <div className="text-xs text-muted-foreground">{person.subtitle}{person.email ? ` · ${person.email}` : ''}</div>
                            </button>
                          ))
                        )}
                      </div>
                      {selectedPersonId && (
                        <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg text-sm space-y-1">
                          <div className="font-medium text-green-900 dark:text-green-100 flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" /> Selected</div>
                          <div className="text-green-800 dark:text-green-200">{sendName}</div>
                          <div className="text-green-700 dark:text-green-300 text-xs">{sendEmail || <span className="text-amber-600 dark:text-amber-400">No email on file — cannot send</span>}</div>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setManualMode(true)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1"
                      >
                        Or enter details manually
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor={`send-name-${roleType}`}>Full Name</Label>
                        <Input
                          id={`send-name-${roleType}`}
                          placeholder="e.g. Jane Smith"
                          value={sendName}
                          onChange={e => setSendName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`send-email-${roleType}`}>Email Address</Label>
                        <Input
                          id={`send-email-${roleType}`}
                          type="email"
                          placeholder="e.g. jane@example.com"
                          value={sendEmail}
                          onChange={e => setSendEmail(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSendLink(); }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => { setManualMode(false); setSendName(''); setSendEmail(''); setSelectedPersonId(null); }}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        ← Back to person picker
                      </button>
                    </div>
                  )}

                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => handleCloseSendDialog(false)}>Cancel</Button>
                    <Button
                      onClick={handleSendLink}
                      disabled={isSendingLink || !sendName.trim() || !sendEmail.trim()}
                    >
                      {isSendingLink ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
                      ) : (
                        <><Send className="h-4 w-4 mr-2" /> Send Induction Link</>
                      )}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Kiosk Check-in Toggle */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg space-y-3">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            <h3 className="font-medium text-sm text-slate-800 dark:text-slate-200">Kiosk Check-in Integration</h3>
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor={`kiosk-toggle-${roleType}`} className="text-sm font-normal cursor-pointer">
                Show induction during walk-in check-in
              </Label>
              <p className="text-xs text-muted-foreground">
                {kioskEnabled
                  ? `${getRoleDisplayName(roleType)} must complete induction before checking in at the kiosk`
                  : `Induction is optional — ${getRoleDisplayName(roleType).toLowerCase()} can check in without completing it`}
              </p>
            </div>
            <Switch
              id={`kiosk-toggle-${roleType}`}
              checked={kioskEnabled}
              onCheckedChange={handleKioskToggle}
              disabled={isTogglingKiosk || !hasVideo}
            />
          </div>
          {!hasVideo && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Generate a video first to enable kiosk integration
            </p>
          )}
        </div>

        {/* What's included */}
        <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg text-sm">
          <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">What's included:</p>
          <ul className="space-y-1 text-xs text-blue-800 dark:text-blue-300">
            <li className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-blue-600 dark:text-blue-400" /> Professional AI-generated slides with company branding</li>
            <li className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-blue-600 dark:text-blue-400" /> UK HSE 2024 compliant content tailored to your industry</li>
            <li className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-blue-600 dark:text-blue-400" /> 10 scenario-based quiz questions covering 5 safety categories</li>
            <li className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-blue-600 dark:text-blue-400" /> 80% pass mark required for compliance certification</li>
            <li className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-blue-600 dark:text-blue-400" /> Role-specific content (Visitors / Staff / Contractors)</li>
          </ul>
        </div>

        {/* Advanced Options */}
        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
          <CollapsibleTrigger asChild>
            <button className="flex w-full items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
              <span className="flex items-center gap-1.5">
                <Settings className="h-3.5 w-3.5" />
                Advanced options
              </span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            <div className="p-3 bg-purple-50 dark:bg-purple-950 border border-purple-100 dark:border-purple-800 rounded-lg text-xs space-y-2">
              <div className="flex items-center gap-2 font-medium text-purple-800 dark:text-purple-200">
                <Sparkles className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                AI Generation Model
              </div>
              <div className="flex items-center justify-between">
                <span className="text-purple-700 dark:text-purple-300">Model in use</span>
                <Badge variant="outline" className="text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-600 text-xs">
                  {companySettings?.openaiModel || settings?.modelType || 'GPT-5'}
                </Badge>
              </div>
              {companySettings?.openaiModel && companySettings.openaiModel !== (settings?.modelType || 'gpt-5') && (
                <p className="text-purple-500 dark:text-purple-400 text-xs">
                  Using company AI setting — change in Settings → AI
                </p>
              )}
              <p className="text-purple-600 dark:text-purple-300 leading-relaxed">
                AI model via Replit AI Integrations — billed to Replit credits, no personal API key required. GPT-Image-1 generates photorealistic workplace safety images.
              </p>
            </div>
            <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-100 dark:border-green-800 rounded-lg text-xs space-y-1.5">
              <div className="flex items-center gap-2 font-medium text-green-800 dark:text-green-200">
                <Shield className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                UK HSE Compliance References
              </div>
              <ul className="text-green-700 dark:text-green-300 space-y-0.5 ml-1">
                <li>• Health and Safety at Work Act 1974 (HASAWA)</li>
                <li>• Management of Health and Safety Regulations 1999</li>
                <li>• PPE at Work Regulations 1992 (amended 2022)</li>
                <li>• RIDDOR 2013 — Incident reporting</li>
                <li>• COSHH 2002 — Hazardous substances</li>
                <li>• CDM Regulations 2015 — Construction (contractors)</li>
              </ul>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* AI Model badge */}
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Sparkles className="h-3 w-3 text-purple-500 dark:text-purple-400" />
          <span>Powered by <span className="font-medium text-purple-700 dark:text-purple-400">{companySettings?.openaiModel || settings?.modelType || 'GPT-5'}</span> via Replit AI — billed to Replit credits</span>
        </div>

      </CardContent>
    </Card>
  );
};

export default function InductionSettings() {
  const [activeRole, setActiveRole] = useState<'visitor' | 'staff' | 'contractor'>('visitor');
  const queryClient = useQueryClient();

  const { data: companySettings } = useQuery<CompanySettings>({ queryKey: ['/api/settings'] });

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
              companySettings={companySettings}
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
