import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSettingsAutoSave } from "@/hooks/useSettingsAutoSave";
import GlassCard from "@/components/GlassCard";
import QRCodeImage from "@/components/QRCodeImage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getSessionToken, getCsrfToken } from "@/lib/queryClient";
import {
  Users, Video, FileQuestion, Eye, Sparkles, CheckCircle, XCircle,
  RefreshCw, Trash2, AlertCircle, Clock, ChevronRight,
  BookOpen, Shield, Flame, HardHat, ClipboardList, Send, Monitor,
  ChevronDown, ChevronUp, Settings, Mail, Loader2, Upload, Film,
  AlertTriangle, Lock, RotateCcw, MapPin, Layers, QrCode, Plus,
  Edit2, Check, X, ImageIcon, Info, Brain,
} from "lucide-react";
import type { InductionQuestion, CompanySettings } from "@shared/schema";

// ── Interfaces ──────────────────────────────────────────────────────────────

interface AiKeysResponse { openai: { hasKey: boolean; isActive: boolean; status: string; last4?: string }; gemini: { hasKey: boolean; isActive: boolean; status: string; last4?: string }; claude: { hasKey: boolean; isActive: boolean; status: string; last4?: string }; }

interface InductionSettingRow {
  id: string;
  roleType: string;
  videoTitle: string;
  videoUrl: string;
  videoFormat: string;
  modelType: string;
  passPercentage: number;
  failureFeedbackLevel?: string;
  isActive?: boolean;
  kioskEnabled?: boolean;
  sendLinkEnabled?: boolean;
  generatedHtml?: string | null;
  scenesData?: string | null;
  generatedAt?: string | null;
  questionsGenerated?: boolean;
  videoDurationMinutes?: number;
  updatedAt?: string;
  customVideoUrl?: string | null;
  hasGeneratedHtml?: boolean;
  hasScenes?: boolean;
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

interface InductionScene {
  title: string;
  content: string;
  duration?: number;
  imagePrompt?: string;
  imageUrl?: string;
}

interface Checkpoint {
  id: string;
  customerId: string;
  label: string;
  orderIndex: number;
  content: string;
  imageUrl?: string | null;
  qrToken: string;
  isActive: boolean;
}

interface InductionTokenRow {
  id: string;
  personName: string;
  personEmail: string;
  personType: string;
  status: string;
  quizAttempts: number | null;
  quizPassed: boolean | null;
  quizScore: number | null;
  emailSent: boolean | null;
  emailSentAt: string | null;
  expiresAt: string;
  createdAt: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const GENERATION_STEPS = [
  { key: 'generating_script', label: 'AI script', icon: BookOpen },
  { key: 'building_slides', label: 'Slides', icon: Video },
  { key: 'creating_questions', label: 'Questions', icon: FileQuestion },
  { key: 'saving', label: 'Saving', icon: ClipboardList },
  { key: 'done', label: 'Done', icon: CheckCircle },
];

const CATEGORY_ICONS: Record<string, any> = {
  'Emergency Procedures': Flame,
  'PPE & Equipment': HardHat,
  'Legal Responsibilities': Shield,
  'Hazard Identification': AlertCircle,
  'Site Rules & Safe Working': ClipboardList,
};

// ── SentLinksSection ─────────────────────────────────────────────────────

function SentLinksSection() {
  const { t } = useTranslation('inductionSettings');
  const { toast } = useToast();
  const { data: tokens, isLoading, refetch } = useQuery<InductionTokenRow[]>({
    queryKey: ['/api/induction/admin/tokens'],
  });

  const resetMutation = useMutation({
    mutationFn: (tokenId: string) => apiRequest('POST', `/api/induction/admin/tokens/${tokenId}/reset-attempts`),
    onSuccess: () => { toast({ title: t('sentLinks.quizReset'), description: t('sentLinks.quizResetDesc') }); refetch(); },
    onError: () => toast({ title: t('sentLinks.resetFailed'), description: t('sentLinks.resetFailedDesc'), variant: 'destructive' }),
  });

  const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const isExpired = (d: string) => new Date(d) < new Date();

  if (isLoading) return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Send className="h-4 w-4" />{t('sentLinks.title')}</CardTitle></CardHeader>
      <CardContent className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> {t('common:loading')}</CardContent>
    </Card>
  );

  if (!tokens?.length) return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Send className="h-4 w-4" />{t('sentLinks.title')}</CardTitle>
        <CardDescription>{t('sentLinks.linksDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground text-center py-6">{t('sentLinks.noLinks')}</CardContent>
    </Card>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Send className="h-4 w-4" />{t('sentLinks.title')}</CardTitle>
        <CardDescription>{t('sentLinks.desc')}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {tokens.map(tok => {
            const attempts = tok.quizAttempts ?? 0;
            const locked = attempts >= 5 && !tok.quizPassed;
            const exp = isExpired(tok.expiresAt);
            return (
              <div key={tok.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{tok.personName}</span>
                    <Badge variant="outline" className="text-xs capitalize">{tok.personType}</Badge>
                    {tok.quizPassed && <Badge className="text-xs bg-green-100 text-green-800 border-green-200">{t('sentLinks.passed', { score: tok.quizScore })}</Badge>}
                    {locked && <Badge className="text-xs bg-red-100 text-red-800 border-red-200 flex items-center gap-1"><Lock className="w-3 h-3" />{t('sentLinks.locked')}</Badge>}
                    {exp && !tok.quizPassed && <Badge className="text-xs bg-gray-100 text-gray-600 border-gray-200">{t('sentLinks.expired')}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{tok.personEmail} · {t('sentLinks.sent')} {fmt(tok.createdAt)} · {t('sentLinks.attempts', { count: attempts })}</p>
                </div>
                {attempts >= 5 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="outline"
                        className={`text-xs shrink-0 ${locked ? 'border-red-300 text-red-700 hover:bg-red-50' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                        onClick={() => resetMutation.mutate(tok.id)} disabled={resetMutation.isPending}>
                        {resetMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                        {t('sentLinks.resetQuiz')}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">Clears the attempt count so this person can retake the quiz. Use this if they've used all 5 attempts but still need to complete the induction.</TooltipContent>
                  </Tooltip>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── RoleCard ──────────────────────────────────────────────────────────────

interface RoleCardProps {
  roleType: 'visitor' | 'staff' | 'contractor';
  settings: InductionSettingRow | null;
  questions: InductionQuestion[];
  onQuestionsRefetch: () => void;
  companySettings?: CompanySettings | null;
}

const RoleCard = ({ roleType, settings, questions, onQuestionsRefetch, companySettings }: RoleCardProps) => {
  const { t } = useTranslation('inductionSettings');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: aiKeys } = useQuery<AiKeysResponse>({ queryKey: ['/api/settings/ai-keys'], staleTime: 60000 });

  // ── Generation state ──
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>({ status: 'idle', step: 0, totalSteps: 5, message: '' });
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [isRegeneratingQuestions, setIsRegeneratingQuestions] = useState(false);
  const [isTogglingKiosk, setIsTogglingKiosk] = useState(false);
  const [kioskEnabled, setKioskEnabled] = useState<boolean>(settings?.kioskEnabled ?? false);
  const [failureFeedbackLevel, setFailureFeedbackLevel] = useState<string>(settings?.failureFeedbackLevel ?? 'questions_topics');
  const [isSavingFeedbackLevel, setIsSavingFeedbackLevel] = useState(false);
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [showSendLink, setShowSendLink] = useState(false);
  const [sendName, setSendName] = useState('');
  const [sendEmail, setSendEmail] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [personFilter, setPersonFilter] = useState('');
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const isGenerating = ['pending', 'generating_script', 'building_slides', 'creating_questions', 'saving'].includes(generationStatus.status);

  // ── Video upload state ──
  const [videoSource, setVideoSource] = useState<'ai_generated' | 'custom_upload'>(settings?.customVideoUrl ? 'custom_upload' : 'ai_generated');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeletingVideo, setIsDeletingVideo] = useState(false);
  const [currentCustomVideoUrl, setCurrentCustomVideoUrl] = useState<string | null>(settings?.customVideoUrl ?? null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  // ── Slide editor state ──
  const [expandedScene, setExpandedScene] = useState<number | null>(null);
  const [editedScenes, setEditedScenes] = useState<InductionScene[]>([]);
  const photoInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // ── Checkpoint state ──
  const [cpForm, setCpForm] = useState({ label: '', content: '' });
  const [editingCp, setEditingCp] = useState<Checkpoint | null>(null);
  const [editCpForm, setEditCpForm] = useState({ label: '', content: '' });
  const [showQrFor, setShowQrFor] = useState<string | null>(null);
  const [uploadingCpPhotoId, setUploadingCpPhotoId] = useState<string | null>(null);
  const cpPhotoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── Manual question editor state ──
  const CORRECT_OPTIONS = ['A', 'B', 'C', 'D'] as const;
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [qForm, setQForm] = useState({ questionText: '', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: 'A' as typeof CORRECT_OPTIONS[number], explanation: '', category: 'General Safety' });
  const [editingQId, setEditingQId] = useState<string | null>(null);
  const [editQForm, setEditQForm] = useState({ questionText: '', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: 'A' as typeof CORRECT_OPTIONS[number], explanation: '', category: 'General Safety' });

  // ── Effects ──
  useEffect(() => {
    setVideoSource(settings?.customVideoUrl ? 'custom_upload' : 'ai_generated');
    setCurrentCustomVideoUrl(settings?.customVideoUrl ?? null);
  }, [settings?.customVideoUrl]);

  useEffect(() => { setKioskEnabled(settings?.kioskEnabled ?? false); }, [settings?.kioskEnabled]);
  useEffect(() => { setFailureFeedbackLevel(settings?.failureFeedbackLevel ?? 'questions_topics'); }, [settings?.failureFeedbackLevel]);

  // ── Queries ──
  const { data: slidesData, isLoading: slidesLoading, isError: slidesError, refetch: refetchSlides } = useQuery<{ scenes: InductionScene[] }>({
    queryKey: ['/api/induction/settings', roleType, 'scenes'],
    queryFn: async () => { const r = await apiRequest('GET', `/api/induction/settings/${roleType}/scenes`); return r.json(); },
  });

  useEffect(() => { if (slidesData?.scenes) setEditedScenes(slidesData.scenes); }, [slidesData?.scenes]);

  const { data: cpData, isError: cpError, refetch: refetchCpData } = useQuery<{ checkpoints: Checkpoint[] }>({
    queryKey: ['/api/induction/checkpoints'],
    queryFn: async () => { const r = await apiRequest('GET', '/api/induction/checkpoints'); return r.json(); },
  });

  // Person lists — loaded only when Send dialog is open
  const { data: workersList = [], isLoading: workersLoading } = useQuery<any[]>({ queryKey: ['/api/contractors/workers/all'], enabled: showSendLink && roleType === 'contractor' });
  const { data: staffListRaw = [], isLoading: staffLoading } = useQuery<any[]>({ queryKey: ['/api/staff'], enabled: showSendLink && roleType === 'staff' });
  const { data: visitorsListRaw = [], isLoading: visitorsLoading } = useQuery<any>({ queryKey: ['/api/visitors'], enabled: showSendLink && roleType === 'visitor' });
  const staffList: any[] = Array.isArray(staffListRaw) ? staffListRaw : (staffListRaw as any)?.staff ?? [];
  const visitorsList: any[] = Array.isArray(visitorsListRaw) ? visitorsListRaw : (visitorsListRaw as any)?.visitors ?? [];
  const peopleLoading = (roleType === 'contractor' && workersLoading) || (roleType === 'staff' && staffLoading) || (roleType === 'visitor' && visitorsLoading);
  const peopleList: { id: string; name: string; email: string; subtitle: string }[] = (() => {
    if (roleType === 'contractor') return workersList.map((w: any) => ({ id: w.id, name: `${w.firstName} ${w.lastName}`, email: w.email || '', subtitle: w.companyName || '' }));
    if (roleType === 'staff') return staffList.map((s: any) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, email: s.email || '', subtitle: s.department || s.jobTitle || '' }));
    return visitorsList.map((v: any) => ({ id: v.id, name: `${v.firstName} ${v.lastName}`, email: v.email || '', subtitle: v.company || v.organisation || '' }));
  })();
  const filteredPeople = personFilter.trim()
    ? peopleList.filter(p => `${p.name} ${p.subtitle} ${p.email}`.toLowerCase().includes(personFilter.toLowerCase()))
    : peopleList;

  // ── Mutations ──
  const saveScenesMutation = useMutation({
    mutationFn: async () => { const r = await apiRequest('PUT', `/api/induction/settings/${roleType}/scenes`, { scenes: editedScenes }); return r.json(); },
    onSuccess: () => { toast({ title: t('toasts.slidesSaved'), description: t('toasts.slidesSavedDesc') }); refetchSlides(); },
    onError: (err: any) => toast({ title: t('toasts.errorSavingSlides'), description: err?.detail || err?.message, variant: 'destructive' }),
  });

  const [uploadingSlideIdx, setUploadingSlideIdx] = useState<number | null>(null);
  const uploadSlidePictureMutation = useMutation({
    mutationFn: async ({ sceneIdx, file }: { sceneIdx: number; file: File }) => {
      setUploadingSlideIdx(sceneIdx);
      const fd = new FormData(); fd.append('photo', file);
      const sessionToken = getSessionToken();
      const csrfToken = getCsrfToken();
      const headers: Record<string, string> = {};
      if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
      if (csrfToken) headers['x-csrf-token'] = csrfToken;
      const r = await fetch(`/api/induction/settings/${roleType}/scenes/photo`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
        headers,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Upload failed (${r.status})`);
      return data as { url: string };
    },
    onSuccess: (data, { sceneIdx }) => {
      setUploadingSlideIdx(null);
      // Build the updated scenes synchronously so we can persist immediately
      const updatedScenes = editedScenes.map((s, i) => i === sceneIdx ? { ...s, imageUrl: data.url } : s);
      setEditedScenes(updatedScenes);
      // Auto-persist so imageUrl reaches the DB before any Generate run
      apiRequest('PUT', `/api/induction/settings/${roleType}/scenes`, { scenes: updatedScenes })
        .then(() => refetchSlides())
        .catch(() => {});
      toast({ title: t('toasts.photoUploaded'), description: t('toasts.photoUploadedDesc') });
    },
    onError: (err: any) => {
      setUploadingSlideIdx(null);
      toast({ title: t('toasts.photoUploadFailed'), description: err?.message || t('toasts.pleaseTryAgain'), variant: 'destructive' });
    },
  });

  const createCpMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest('POST', '/api/induction/checkpoints', { label: cpForm.label.trim(), content: cpForm.content.trim(), orderIndex: cpData?.checkpoints?.length ?? 0 });
      return r.json();
    },
    onSuccess: () => { toast({ title: t('toasts.checkpointCreated') }); setCpForm({ label: '', content: '' }); queryClient.invalidateQueries({ queryKey: ['/api/induction/checkpoints'] }); },
    onError: (err: any) => toast({ title: t('toasts.errorCreatingCheckpoint'), description: err?.detail || err?.message, variant: 'destructive' }),
  });

  const updateCpMutation = useMutation({
    mutationFn: async () => {
      if (!editingCp) return;
      const r = await apiRequest('PUT', `/api/induction/checkpoints/${editingCp.id}`, { label: editCpForm.label.trim(), content: editCpForm.content.trim() });
      return r.json();
    },
    onSuccess: () => { toast({ title: t('toasts.checkpointUpdated') }); setEditingCp(null); queryClient.invalidateQueries({ queryKey: ['/api/induction/checkpoints'] }); },
    onError: (err: any) => toast({ title: t('toasts.errorUpdatingCheckpoint'), description: err?.detail || err?.message, variant: 'destructive' }),
  });

  const uploadCpPhotoMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData(); fd.append('photo', file);
      const r = await fetch(`/api/induction/checkpoints/${id}/photo`, { method: 'POST', body: fd, credentials: 'include' });
      if (!r.ok) throw new Error('Upload failed');
      return r.json() as Promise<{ url: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/induction/checkpoints'] });
      toast({ title: t('toasts.photoSaved'), description: t('toasts.photoSavedDesc') });
      setUploadingCpPhotoId(null);
    },
    onError: () => { toast({ title: t('toasts.photoUploadFailed'), variant: 'destructive' }); setUploadingCpPhotoId(null); },
  });

  const addQuestionMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest('POST', '/api/induction/questions', { ...qForm, roleType });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: t('toasts.questionAdded') });
      setQForm({ questionText: '', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: 'A', explanation: '', category: 'General Safety' });
      setShowAddQuestion(false);
      queryClient.invalidateQueries({ queryKey: ['/api/induction/questions', roleType] });
      onQuestionsRefetch();
    },
    onError: (err: any) => toast({ title: t('toasts.failedAddQuestion'), description: err?.detail || err?.message, variant: 'destructive' }),
  });

  const updateQuestionMutation = useMutation({
    mutationFn: async () => {
      if (!editingQId) return;
      const r = await apiRequest('PATCH', `/api/induction/questions/${editingQId}`, editQForm);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: t('toasts.questionUpdated') });
      setEditingQId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/induction/questions', roleType] });
      onQuestionsRefetch();
    },
    onError: (err: any) => toast({ title: t('toasts.failedUpdateQuestion'), description: err?.detail || err?.message, variant: 'destructive' }),
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest('DELETE', `/api/induction/questions/${id}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/induction/questions', roleType] });
      onQuestionsRefetch();
    },
    onError: (err: any) => toast({ title: t('toasts.failedDeleteQuestion'), description: err?.detail || err?.message, variant: 'destructive' }),
  });

  const toggleCpMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const r = await apiRequest('PUT', `/api/induction/checkpoints/${id}`, { isActive }); return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/induction/checkpoints'] }),
  });

  const deleteCpMutation = useMutation({
    mutationFn: async (id: string) => { const r = await apiRequest('DELETE', `/api/induction/checkpoints/${id}`); return r.json(); },
    onSuccess: () => { toast({ title: t('toasts.checkpointDeleted') }); queryClient.invalidateQueries({ queryKey: ['/api/induction/checkpoints'] }); },
    onError: (err: any) => toast({ title: t('toasts.errorDeletingCheckpoint'), description: err?.detail || err?.message, variant: 'destructive' }),
  });

  // ── Helpers ──
  const getRoleDisplayName = (r: string) => ({ visitor: 'Visitors', staff: 'Staff', contractor: 'Contractors' }[r] || r);
  const getProgressPercent = () => {
    if (generationStatus.status === 'done') return 100;
    if (generationStatus.status === 'idle' || generationStatus.status === 'failed') return 0;
    return Math.round((generationStatus.step / generationStatus.totalSteps) * 100);
  };
  const getQrUrl = (qrToken: string) => `${window.location.origin}/induction/checkpoint/${qrToken}`;
  // "Has usable induction" — matches the same definition used by the worker player and kiosk:
  // AI video (generatedAt set OR generatedHtml/scenesData present) OR custom-uploaded MP4
  const hasVideo = settings?.generatedAt != null
    || !!currentCustomVideoUrl
    || !!settings?.hasGeneratedHtml
    || !!settings?.hasScenes;
  const questionsByCategory = questions.reduce((acc, q) => {
    const cat = q.category || 'General Safety';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(q);
    return acc;
  }, {} as Record<string, InductionQuestion[]>);

  // ── Polling ──
  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  const startPolling = () => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const sessionToken = getSessionToken();
        const pollHeaders: Record<string, string> = {};
        if (sessionToken) pollHeaders['Authorization'] = `Bearer ${sessionToken}`;
        const res = await fetch(`/api/induction/status/${roleType}`, { credentials: 'include', headers: pollHeaders });
        if (!res.ok) { if (res.status === 401) stopPolling(); return; }
        const sd: GenerationStatus = await res.json();
        setGenerationStatus(sd);
        if (sd.status === 'done') {
          stopPolling();
          toast({ title: t('toasts.inductionGenerated'), description: sd.message });
          queryClient.invalidateQueries({ queryKey: ['/api/induction/questions', roleType] });
          queryClient.invalidateQueries({ queryKey: ['/api/induction/settings'] });
          queryClient.invalidateQueries({ queryKey: ['/api/induction/settings', roleType, 'scenes'] });
          onQuestionsRefetch();
          refetchSlides();
        } else if (sd.status === 'failed') {
          stopPolling();
          toast({ title: t('toasts.generationFailed'), description: sd.error || t('toasts.pleaseTryAgain'), variant: 'destructive' });
        }
      } catch {}
    }, 3000);
  };
  useEffect(() => () => stopPolling(), []);

  // ── Handlers ──
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
        toast({ title: t('toasts.generationFailed'), description: data.error, variant: 'destructive' });
      }
    } catch (error: any) {
      const msg = error?.message || 'Could not start generation. Please try again.';
      setGenerationStatus({ status: 'failed', step: 0, totalSteps: 5, message: msg, error: msg });
      toast({ title: t('toasts.generationFailed'), description: msg, variant: 'destructive' });
    }
  };

  const handleVideoFileSelect = (file: File) => {
    const allowed = ['video/mp4', 'video/quicktime', 'video/webm'];
    if (!allowed.includes(file.type) && !file.name.match(/\.(mp4|mov|webm)$/i)) {
      toast({ title: t('toasts.invalidFileType'), description: t('toasts.invalidFileTypeDesc'), variant: 'destructive' }); return;
    }
    if (file.size > 500 * 1024 * 1024) {
      toast({ title: t('toasts.fileTooLarge'), description: t('toasts.fileTooLargeDesc'), variant: 'destructive' }); return;
    }
    setIsUploading(true); setUploadProgress(0);
    const formData = new FormData();
    formData.append('video', file); formData.append('roleType', roleType);
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => { if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100)); });
    xhr.addEventListener('load', () => {
      setIsUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        setCurrentCustomVideoUrl(data.url);
        setVideoSource('custom_upload');
        queryClient.invalidateQueries({ queryKey: ['/api/induction/settings'] });
        toast({ title: t('toasts.videoUploaded'), description: t('toasts.videoUploadedDesc') });
      } else {
        const err = JSON.parse(xhr.responseText || '{}');
        toast({ title: t('toasts.uploadFailed'), description: err.error || t('toasts.pleaseTryAgain'), variant: 'destructive' });
      }
    });
    xhr.addEventListener('error', () => { setIsUploading(false); toast({ title: t('toasts.uploadFailed'), description: t('toasts.networkError'), variant: 'destructive' }); });
    xhr.open('POST', '/api/induction/upload-video'); xhr.withCredentials = true;
    const sessionToken = sessionStorage.getItem('session_token');
    if (sessionToken) xhr.setRequestHeader('Authorization', `Bearer ${sessionToken}`);
    const csrfCookie = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('csrf-token='));
    if (csrfCookie) xhr.setRequestHeader('x-csrf-token', csrfCookie.split('=')[1]);
    xhr.send(formData);
  };

  const handleRemoveVideo = async () => {
    setIsDeletingVideo(true);
    try {
      await apiRequest('DELETE', `/api/induction/upload-video?roleType=${roleType}`, undefined);
      setCurrentCustomVideoUrl(null); setVideoSource('ai_generated');
      queryClient.invalidateQueries({ queryKey: ['/api/induction/settings'] });
      toast({ title: t('toasts.videoRemoved'), description: t('toasts.videoRemovedDesc') });
    } catch (err: any) { toast({ title: t('toasts.failedRemoveVideo'), description: err?.detail || err?.message, variant: 'destructive' }); }
    finally { setIsDeletingVideo(false); }
  };

  const handleRegenerateQuestions = async () => {
    setIsRegeneratingQuestions(true);
    try {
      const response = await apiRequest('POST', `/api/induction/generate-questions/${roleType}`, {});
      const data = await response.json();
      if (data.success) {
        toast({ title: t('toasts.questionsUpdated'), description: t('toasts.questionsUpdatedDesc', { count: data.questionsGenerated }) });
        queryClient.invalidateQueries({ queryKey: ['/api/induction/questions', roleType] });
        onQuestionsRefetch();
      } else toast({ title: t('toasts.failed'), description: data.error || t('toasts.couldNotRegenerateQuestions'), variant: 'destructive' });
    } catch (error: any) { toast({ title: t('toasts.failed'), description: error?.message || t('toasts.couldNotRegenerateQuestions'), variant: 'destructive' }); }
    finally { setIsRegeneratingQuestions(false); }
  };

  const handleCleanupQuestions = async () => {
    setIsCleaningUp(true);
    try {
      const response = await fetch(`/api/induction/questions/cleanup?roleType=${roleType}&nuclear=true`, { method: 'DELETE', credentials: 'include' });
      const data = await response.json();
      if (data.success) {
        toast({ title: t('toasts.questionsCleared'), description: t('toasts.questionsClearedDesc') });
        queryClient.invalidateQueries({ queryKey: ['/api/induction/questions', roleType] });
        onQuestionsRefetch();
      } else {
        toast({ title: t('toasts.failedClearQuestions'), description: data.error, variant: 'destructive' });
      }
    } catch (err: any) { toast({ title: t('toasts.failedClearQuestions'), description: err?.detail || err?.message, variant: 'destructive' }); }
    finally { setIsCleaningUp(false); }
  };

  const handleKioskToggle = async (enabled: boolean) => {
    setIsTogglingKiosk(true); const prev = kioskEnabled; setKioskEnabled(enabled);
    try {
      await apiRequest('PATCH', `/api/induction/settings/${roleType}/toggle`, { kioskEnabled: enabled });
      queryClient.invalidateQueries({ queryKey: ['/api/induction/settings'] });
      toast({ title: enabled ? t('toasts.kioskEnabled') : t('toasts.kioskDisabled') });
    } catch (err: any) { setKioskEnabled(prev); toast({ title: t('toasts.failedUpdateKiosk'), description: err?.detail || err?.message, variant: 'destructive' }); }
    finally { setIsTogglingKiosk(false); }
  };

  const handleFeedbackLevelChange = async (value: string) => {
    const prev = failureFeedbackLevel;
    setFailureFeedbackLevel(value);
    setIsSavingFeedbackLevel(true);
    try {
      await apiRequest('PATCH', `/api/induction/settings/${roleType}/toggle`, { failureFeedbackLevel: value });
      queryClient.invalidateQueries({ queryKey: ['/api/induction/settings'] });
    } catch (err: any) { setFailureFeedbackLevel(prev); toast({ title: t('toasts.failedSaveFeedback'), description: err?.detail || err?.message, variant: 'destructive' }); }
    finally { setIsSavingFeedbackLevel(false); }
  };

  const handleCloseSendDialog = (open: boolean) => {
    setShowSendLink(open);
    if (!open) { setSelectedPersonId(null); setSendName(''); setSendEmail(''); setManualMode(false); setPersonFilter(''); }
  };

  const handleSendLink = async () => {
    if (!sendName.trim() || !sendEmail.trim()) { toast({ title: t('toasts.missingDetails'), description: t('toasts.missingDetailsDesc'), variant: 'destructive' }); return; }
    setIsSendingLink(true);
    try {
      const personType = roleType === 'visitor' ? 'visitor' : roleType === 'staff' ? 'staff' : 'contractor';
      const body: Record<string, any> = { personType, personName: sendName.trim(), personEmail: sendEmail.trim() };
      if (!manualMode && selectedPersonId) {
        if (roleType === 'contractor') body.workerId = selectedPersonId;
        else if (roleType === 'staff') body.staffId = selectedPersonId;
        else body.visitorId = selectedPersonId;
      }
      const response = await apiRequest('POST', '/api/induction/send', body);
      const data = await response.json();
      if (data.message) { toast({ title: t('toasts.inductionLinkSent'), description: t('toasts.inductionLinkSentDesc', { email: sendEmail }) }); handleCloseSendDialog(false); }
      else toast({ title: t('toasts.failed'), description: data.error || t('toasts.couldNotSendLink'), variant: 'destructive' });
    } catch (error: any) { toast({ title: t('toasts.failed'), description: error?.message || t('toasts.couldNotSendLink'), variant: 'destructive' }); }
    finally { setIsSendingLink(false); }
  };

  // ── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ══ Step 2: Induction Content ══ */}
      <GlassCard className="p-6">
        <div className="flex items-start gap-3 mb-5">
          <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-fixed">{t('inductionContent.title')}</h3>
            <p className="text-xs text-variable mt-0.5">{t('inductionContent.desc')}</p>
          </div>
          <Badge className={hasVideo ? 'bg-green-600 text-white shrink-0' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0'}>
            {hasVideo ? <><CheckCircle className="h-3 w-3 mr-1" />{t('inductionContent.ready')}</> : t('inductionContent.notGenerated')}
          </Badge>
        </div>

        {/* Video Source Toggle */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={() => setVideoSource('ai_generated')}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-sm transition-all ${videoSource === 'ai_generated' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium' : 'border-border bg-white dark:bg-slate-800 text-muted-foreground hover:border-blue-300'}`}>
                <Sparkles className="h-4 w-4" />{t('inductionContent.aiSlides')}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">The AI writes a UK HSE-compliant script, builds interactive slides, and generates a knowledge quiz — all tailored to your site details. You can edit slides and add real site photos afterwards.</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={() => setVideoSource('custom_upload')}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-sm transition-all ${videoSource === 'custom_upload' ? 'border-purple-500 bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-medium' : 'border-border bg-white dark:bg-slate-800 text-muted-foreground hover:border-purple-300'}`}>
                <Upload className="h-4 w-4" />{t('inductionContent.uploadMp4')}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">Use your own pre-recorded induction video (MP4, MOV or WebM, max 500 MB). Inductees watch the video then take the AI-generated quiz. Ideal if you already have a professional recording.</TooltipContent>
          </Tooltip>
        </div>

        {/* ── Custom MP4 Upload ── */}
        {videoSource === 'custom_upload' && (
          <div className="space-y-3 mb-5">
            {currentCustomVideoUrl && (
              <div className="p-3 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Film className="h-4 w-4 text-purple-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-purple-900 dark:text-purple-100">{t('inductionContent.customVideoUploaded')}</p>
                      <p className="text-xs text-purple-600 dark:text-purple-400 truncate">{currentCustomVideoUrl.split('/').pop()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="outline" size="sm" onClick={async () => {
                      try {
                        const res = await apiRequest('POST', `/api/induction/preview-token/${roleType}`);
                        const { token } = await res.json();
                        window.open(`/induction-preview/${roleType}?pt=${token}`, '_blank');
                      } catch {
                        toast({ title: t('toasts.couldNotOpenPreview'), variant: 'destructive' });
                      }
                    }} className="gap-1 text-xs">
                      <Eye className="h-3 w-3" />{t('inductionContent.preview')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleRemoveVideo} disabled={isDeletingVideo} className="shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950">
                      {isDeletingVideo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      <span className="ml-1 text-xs">{t('inductionContent.remove')}</span>
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" />{t('inductionContent.videoReplaceWarning')}</p>
              </div>
            )}
            <div
              className="relative border-2 border-dashed border-purple-300 dark:border-purple-700 rounded-lg p-6 text-center cursor-pointer hover:border-purple-500 transition-colors"
              onClick={() => videoFileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) handleVideoFileSelect(file); }}>
              {isUploading ? (
                <div className="space-y-2">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-600 mx-auto" />
                  <p className="text-sm text-purple-700 dark:text-purple-300 font-medium">Uploading… {uploadProgress}%</p>
                  <div className="w-full bg-purple-100 dark:bg-purple-900 rounded-full h-2">
                    <div className="bg-purple-600 h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-purple-400 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{currentCustomVideoUrl ? t('inductionContent.uploadReplacement') : t('inductionContent.dropVideo')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('inductionContent.videoFormats')}</p>
                </>
              )}
            </div>
            <input ref={videoFileInputRef} type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" className="hidden"
              onChange={(e) => { const file = e.target.files?.[0]; if (file) handleVideoFileSelect(file); e.target.value = ''; }} />
          </div>
        )}

        {/* ── AI Generation ── */}
        {videoSource === 'ai_generated' && (
          <div className="space-y-3">
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
                        <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${isDone ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : isCurrent ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'}`}>
                          <StepIcon className="h-3 w-3" /><span>{step.label}</span>
                        </div>
                        {idx < GENERATION_STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-gray-300 dark:text-gray-600" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : generationStatus.status === 'failed' ? (
              <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-center gap-2"><XCircle className="h-4 w-4 text-red-600" /><p className="text-sm font-medium text-red-900 dark:text-red-200">{t('inductionContent.generationFailed')}</p></div>
                {generationStatus.error && <p className="text-xs text-red-700 dark:text-red-300 mt-1 ml-6">{generationStatus.error}</p>}
                <p className="text-xs text-red-600 dark:text-red-400 mt-2 ml-6">{t('inductionContent.retryHint')}</p>
              </div>
            ) : hasVideo ? (
              <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-green-900 dark:text-green-100"><CheckCircle className="inline h-4 w-4 mr-1 text-green-600 dark:text-green-400" />{t('inductionContent.slidesReady')}</p>
                    <p className="text-xs text-green-700 dark:text-green-300">
                      <Clock className="inline h-3 w-3 mr-1" />
                      {settings?.videoDurationMinutes ? `~${settings.videoDurationMinutes} min · ` : ''}
                      {settings?.generatedAt ? `Generated ${new Date(settings.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Ready to preview'}
                    </p>
                    {settings?.questionsGenerated && (
                      <p className="text-xs text-green-600 dark:text-green-400"><CheckCircle className="inline h-3 w-3 mr-1" />{questions.length > 0 ? t('inductionContent.quizQuestionsReady', { count: questions.length }) : t('inductionContent.quizQuestionsGenerated')}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <Button variant="outline" size="sm" onClick={() => window.open(`/induction-preview/${roleType}`, '_blank')} className="gap-1">
                      <Eye className="h-3 w-3" />{t('inductionContent.preview')}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-300">{t('inductionContent.noInductionYet')}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={handleGenerateVideo} disabled={isGenerating} className="flex items-center gap-2">
                    {isGenerating ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />{t('inductionContent.generating')}</> : <><Sparkles className="h-4 w-4" />{hasVideo ? t('inductionContent.regenerateInduction') : t('inductionContent.generateInduction')}</>}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">{hasVideo ? 'Rewrites the slides and quiz using the latest Site Details. Your existing slide edits and site photos will be replaced — export a PDF first if you want to keep them.' : 'Generates a full set of interactive slides and a knowledge quiz for this role type, using the Site Details filled in above. Takes 1–2 minutes.'}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}

        {/* ── Slide Editor ── */}
        {videoSource === 'ai_generated' && (
          <>
            <div className="border-t border-gray-200 dark:border-gray-700 my-5" />
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-600" />
                <p className="text-sm font-semibold text-fixed">{t('inductionContent.slideEditor')}</p>
                <span className="text-xs text-variable hidden sm:inline">{t('inductionContent.editTextDesc')}</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => saveScenesMutation.mutate()} disabled={saveScenesMutation.isPending || editedScenes.length === 0}>
                <Check className="w-3.5 h-3.5 mr-1.5" />{saveScenesMutation.isPending ? t('common:saving') : t('inductionContent.saveSlides')}
              </Button>
            </div>
            {/* Hazard photos callout — helps Andy find the per-slide upload feature */}
            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2">
              <ImageIcon className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-amber-800 dark:text-amber-200">{t('inductionContent.makeItSpecific')}</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{t('inductionContent.sitePhotoDesc')}</p>
              </div>
            </div>
            {slidesLoading && <div className="text-center py-6 text-sm text-variable">{t('inductionContent.loadingSlides')}</div>}
            {slidesError && (
              <div className="mb-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {t('inductionContent.couldNotLoadSlides')} <button className="underline ml-1" onClick={() => refetchSlides()}>{t('inductionContent.tryAgain')}</button>
              </div>
            )}
            {!slidesLoading && !slidesError && editedScenes.length === 0 && (
              <div className="text-center py-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                <Layers className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm text-variable">{t('inductionContent.noSlides')}</p>
              </div>
            )}
            {editedScenes.length > 0 && (
              <div className="space-y-2">
                {editedScenes.map((scene, idx) => (
                  <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <button className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                      onClick={() => setExpandedScene(expandedScene === idx ? null : idx)}>
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                        <span className="font-medium text-fixed text-sm">{scene.title || `Slide ${idx + 1}`}</span>
                        {scene.imageUrl && <Badge variant="secondary" className="text-xs gap-1"><ImageIcon className="w-3 h-3" />Photo</Badge>}
                      </div>
                      {expandedScene === idx ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {expandedScene === idx && (
                      <div className="px-4 pb-4 pt-2 space-y-3 border-t border-gray-100 dark:border-gray-700/50">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-variable">{t('inductionContent.slideTitle')}</Label>
                          <Input value={scene.title} onChange={(e) => setEditedScenes(prev => prev.map((s, i) => i === idx ? { ...s, title: e.target.value } : s))} className="text-sm" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-variable">{t('inductionContent.content')}</Label>
                          <Textarea value={scene.content} onChange={(e) => setEditedScenes(prev => prev.map((s, i) => i === idx ? { ...s, content: e.target.value } : s))} rows={4} className="text-sm" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-variable">{t('inductionContent.sitePhoto')}</Label>
                          <div className="flex items-center gap-3">
                            {scene.imageUrl ? (
                              <div className="flex items-center gap-2">
                                <img src={`/objects${scene.imageUrl}`} alt="Slide photo" className="w-20 h-14 object-cover rounded-lg border" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                <Button variant="outline" size="sm" className="text-red-600 border-red-200" onClick={() => setEditedScenes(prev => prev.map((s, i) => i === idx ? { ...s, imageUrl: undefined } : s))}>
                                  <X className="w-3.5 h-3.5 mr-1" />{t('inductionContent.remove')}
                                </Button>
                              </div>
                            ) : (
                              <Button variant="outline" size="sm" disabled={uploadingSlideIdx === idx} onClick={() => photoInputRefs.current[idx]?.click()}>
                                <Upload className="w-3.5 h-3.5 mr-1.5" />{uploadingSlideIdx === idx ? t('inductionContent.uploadingPhoto') : 'Upload Photo'}
                              </Button>
                            )}
                            <input ref={(el) => { photoInputRefs.current[idx] = el; }} type="file" accept="image/*" className="hidden"
                              onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadSlidePictureMutation.mutate({ sceneIdx: idx, file }); e.target.value = ''; }} />
                          </div>
                          <p className="text-xs text-variable">{t('inductionContent.realSitePhotos')}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </GlassCard>

      {/* ══ Step 3: Knowledge Questions ══ */}
      <GlassCard className="p-6">
        <div className="flex items-start gap-3 mb-5">
          <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-fixed">{t('questions.title')}</h3>
            <p className="text-xs text-variable mt-0.5">{t('questions.desc')}</p>
          </div>
          <Badge variant="secondary" className="shrink-0">{questions.length} question{questions.length !== 1 ? 's' : ''}</Badge>
        </div>

        {/* ── On-fail feedback level ── */}
        <div className="mb-5 flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-fixed">{t('questions.onFailShow')}</p>
            <p className="text-xs text-variable mt-0.5">{t('questions.onFailDesc')}</p>
          </div>
          <select
            value={failureFeedbackLevel}
            onChange={e => handleFeedbackLevelChange(e.target.value)}
            disabled={isSavingFeedbackLevel}
            className="text-xs border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 bg-background shrink-0 min-w-[170px]"
          >
            <option value="score_only">{t('questions.scoreOnly')}</option>
            <option value="questions_topics">{t('questions.questionsMissed')}</option>
            <option value="topics_rewatch">{t('questions.missedAndRewatch')}</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" onClick={handleRegenerateQuestions} disabled={isRegeneratingQuestions} className="gap-1 text-xs">
                {isRegeneratingQuestions ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                {questions.length > 0 ? t('questions.regenerate') : t('questions.generate')}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">{questions.length > 0 ? 'Replaces all existing questions with a fresh set generated from the current induction slides. Any manual edits to questions will be lost.' : 'Creates a set of scenario-based multiple-choice questions from the induction slides. Requires slides to be generated first.'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setShowAddQuestion(v => !v)}>
                <Plus className="h-3 w-3" />{t('questions.addManually')}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">Write your own question to match a specific hazard, your uploaded video, or any site-specific requirement. Questions are saved immediately and appear in the quiz.</TooltipContent>
          </Tooltip>
          {questions.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" onClick={handleCleanupQuestions} disabled={isCleaningUp} className="gap-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
                  {isCleaningUp ? <Loader2 className="h-3 w-3 animate-spin text-red-600" /> : <Trash2 className="h-3 w-3" />}{t('questions.clearAll')}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">Permanently removes all quiz questions for this role type. Inductees will not be tested until you generate a new set.</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* ── Manual question form (add/edit) ── */}
        {showAddQuestion && (
          <div className="mb-5 p-4 border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl space-y-3">
            <p className="text-sm font-semibold text-fixed flex items-center gap-2"><Plus className="h-4 w-4 text-blue-600" />New Question</p>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-variable">Question *</Label>
              <Textarea value={qForm.questionText} onChange={e => setQForm(f => ({ ...f, questionText: e.target.value }))} placeholder="e.g. What should you do if you spot a chemical spill?" rows={2} className="text-sm" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(['A', 'B', 'C', 'D'] as const).map(opt => (
                <div key={opt} className="space-y-1">
                  <Label className="text-xs font-medium text-variable">Option {opt}{opt === 'A' || opt === 'B' ? ' *' : ''}</Label>
                  <Input value={qForm[`option${opt}` as keyof typeof qForm] as string} onChange={e => setQForm(f => ({ ...f, [`option${opt}`]: e.target.value }))} placeholder={`Answer option ${opt}`} className="text-sm" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-variable">Correct Answer *</Label>
                <select value={qForm.correctAnswer} onChange={e => setQForm(f => ({ ...f, correctAnswer: e.target.value as any }))} className="w-full text-sm border rounded-md px-3 py-2 bg-background">
                  {['A', 'B', 'C', 'D'].map(o => <option key={o} value={o}>Option {o}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-variable">Category</Label>
                <Input value={qForm.category} onChange={e => setQForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Emergency Procedures" className="text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-variable">Wrong-answer explanation (shown to inductee if they get it wrong)</Label>
              <Input value={qForm.explanation} onChange={e => setQForm(f => ({ ...f, explanation: e.target.value }))} placeholder="e.g. Chemical spills must be reported to the site manager immediately." className="text-sm" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => addQuestionMutation.mutate()} disabled={addQuestionMutation.isPending || !qForm.questionText.trim() || !qForm.optionA.trim() || !qForm.optionB.trim()}>
                {addQuestionMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}Save Question
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddQuestion(false)}><X className="h-3.5 w-3.5 mr-1.5" />Cancel</Button>
            </div>
          </div>
        )}

        {questions.length === 0 ? (
          <div className="py-8 text-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
            <FileQuestion className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium text-variable">No questions yet</p>
            <p className="text-xs text-variable mt-1">{videoSource === 'custom_upload' ? 'Add questions manually using the button above, or generate them from AI slides.' : 'Generate an induction or click "Generate Questions" above to create quiz questions.'}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {Object.entries(questionsByCategory).map(([category, catQuestions]) => {
              const CatIcon = CATEGORY_ICONS[category] || FileQuestion;
              return (
                <div key={category}>
                  <div className="flex items-center gap-2 mb-2">
                    <CatIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <h4 className="font-medium text-sm text-blue-900 dark:text-blue-200">{category}</h4>
                    <Badge variant="secondary" className="text-xs">{catQuestions.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {catQuestions.map((q, index) => (
                      <div key={q.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border dark:border-gray-700">
                        {editingQId === q.id ? (
                          <div className="space-y-2">
                            <Textarea value={editQForm.questionText} onChange={e => setEditQForm(f => ({ ...f, questionText: e.target.value }))} rows={2} className="text-sm" />
                            <div className="grid grid-cols-2 gap-1.5">
                              {(['A', 'B', 'C', 'D'] as const).map(opt => (
                                <Input key={opt} value={editQForm[`option${opt}` as keyof typeof editQForm] as string} onChange={e => setEditQForm(f => ({ ...f, [`option${opt}`]: e.target.value }))} placeholder={`Option ${opt}`} className="text-xs" />
                              ))}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-variable shrink-0">{t('questions.correct')}</span>
                              <select value={editQForm.correctAnswer} onChange={e => setEditQForm(f => ({ ...f, correctAnswer: e.target.value as any }))} className="text-xs border rounded px-2 py-1 bg-background">
                                {['A', 'B', 'C', 'D'].map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                              <Input value={editQForm.explanation} onChange={e => setEditQForm(f => ({ ...f, explanation: e.target.value }))} placeholder={t('questions.explanation')} className="text-xs flex-1" />
                            </div>
                            <div className="flex gap-1.5">
                              <Button size="sm" className="text-xs h-7 px-2" onClick={() => updateQuestionMutation.mutate()} disabled={updateQuestionMutation.isPending}><Check className="w-3 h-3 mr-1" />{t('questions.saveQuestion')}</Button>
                              <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => setEditingQId(null)}><X className="w-3 h-3 mr-1" />{t('common:cancel')}</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2">
                            <Badge variant="outline" className="shrink-0 text-xs mt-0.5">Q{index + 1}</Badge>
                            <div className="space-y-2 flex-1 min-w-0">
                              <p className="font-medium text-sm">{q.questionText}</p>
                              <div className="grid gap-1 text-xs">
                                {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                                  const optKey = `option${opt}` as keyof typeof q;
                                  const optionText = q[optKey];
                                  if (!optionText) return null;
                                  const isCorrect = q.correctAnswer === opt;
                                  return (
                                    <div key={opt} className={`p-2 rounded flex items-start gap-2 ${isCorrect ? 'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800' : 'bg-white dark:bg-gray-900 border dark:border-gray-700'}`}>
                                      <span className={`font-semibold shrink-0 ${isCorrect ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>{opt}.</span>
                                      <span className={isCorrect ? 'text-green-800 dark:text-green-300' : ''}>{String(optionText)}</span>
                                      {isCorrect && <CheckCircle className="h-3 w-3 ml-auto shrink-0 text-green-600 dark:text-green-400 mt-0.5" />}
                                    </div>
                                  );
                                })}
                              </div>
                              {q.explanation && (
                                <p className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 p-2 rounded border-l-2 border-blue-300 dark:border-blue-700 italic">
                                  💡 {q.explanation}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditingQId(q.id); setEditQForm({ questionText: q.questionText, optionA: q.optionA || '', optionB: q.optionB || '', optionC: (q as any).optionC || '', optionD: (q as any).optionD || '', correctAnswer: (q.correctAnswer as any) || 'A', explanation: q.explanation || '', category: q.category || 'General Safety' }); }}>
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950" onClick={() => { if (confirm(t('questions.deleteConfirm'))) deleteQuestionMutation.mutate(q.id); }}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* ══ Step 4: Walk-around Checkpoints ══ */}
      <GlassCard className="p-6">
        <div className="flex items-start gap-3 mb-5">
          <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">4</span>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-fixed">{t('checkpoints.title')}</h3>
            <p className="text-xs text-variable mt-0.5">{t('checkpoints.desc')}</p>
          </div>
          <Badge variant="outline" className="shrink-0 text-xs border-green-400 text-green-700 dark:text-green-400">{t('checkpoints.optional')}</Badge>
        </div>

        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg mb-4 flex items-start gap-2">
          <ImageIcon className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-400" dangerouslySetInnerHTML={{ __html: t('checkpoints.photoHint') }} />
        </div>
        <div className="border border-dashed border-blue-300 dark:border-blue-700 rounded-xl p-4 mb-4 space-y-3">
          <p className="text-sm font-medium text-fixed">{t('checkpoints.addNew')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-variable">{t('checkpoints.labelField')}</Label>
              <Input value={cpForm.label} onChange={(e) => setCpForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Assembly Point A, Fire Exit East, Welfare Block" className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-variable">{t('checkpoints.infoField')}</Label>
              <Input value={cpForm.content} onChange={(e) => setCpForm(f => ({ ...f, content: e.target.value }))} placeholder={t('checkpoints.infoPlaceholder')} className="text-sm" />
            </div>
          </div>
          <Button size="sm" onClick={() => createCpMutation.mutate()} disabled={!cpForm.label.trim() || createCpMutation.isPending}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />{createCpMutation.isPending ? t('checkpoints.creating') : t('checkpoints.create')}
          </Button>
        </div>

        {cpError ? (
          <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {t('checkpoints.couldNotLoad')} <button className="underline ml-1" onClick={() => refetchCpData()}>{t('inductionContent.tryAgain')}</button>
          </div>
        ) : !cpData?.checkpoints?.length ? (
          <div className="text-center py-6 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
            <QrCode className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm text-variable">{t('checkpoints.noCheckpoints')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cpData.checkpoints.map((cp, idx) => (
              <div key={cp.id} className={`border rounded-xl p-4 ${cp.isActive ? 'border-green-200 dark:border-green-800/50 bg-green-50/40 dark:bg-green-950/20' : 'border-gray-200 dark:border-gray-700 opacity-60'}`}>
                {editingCp?.id === cp.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input value={editCpForm.label} onChange={(e) => setEditCpForm(f => ({ ...f, label: e.target.value }))} placeholder="Label" className="text-sm" />
                      <Input value={editCpForm.content} onChange={(e) => setEditCpForm(f => ({ ...f, content: e.target.value }))} placeholder="Information text" className="text-sm" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => updateCpMutation.mutate()} disabled={updateCpMutation.isPending}><Check className="w-3.5 h-3.5 mr-1" />{t('checkpoints.saveCheckpoint')}</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingCp(null)}><X className="w-3.5 h-3.5 mr-1" />{t('checkpoints.cancelEdit')}</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                          <p className="font-semibold text-fixed text-sm">{cp.label}</p>
                          <Badge variant={cp.isActive ? 'default' : 'secondary'} className="text-xs">{cp.isActive ? t('checkpoints.active') : t('checkpoints.inactive')}</Badge>
                          {cp.imageUrl && <Badge variant="secondary" className="text-xs gap-1"><ImageIcon className="w-3 h-3" />Photo</Badge>}
                        </div>
                        {cp.content && <p className="text-xs text-variable ml-8">{cp.content}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => setShowQrFor(showQrFor === cp.id ? null : cp.id)}>
                              <QrCode className="w-3 h-3 mr-1" />QR
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">Show the QR code to print and affix at this location on site</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => { setEditingCp(cp); setEditCpForm({ label: cp.label, content: cp.content }); }}><Edit2 className="w-3 h-3" /></Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">Edit label and information text for this checkpoint</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => toggleCpMutation.mutate({ id: cp.id, isActive: !cp.isActive })}>
                              {cp.isActive ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">{cp.isActive ? 'Deactivate — inductees will no longer be required to scan this checkpoint' : 'Activate — this checkpoint will appear in the walk-around for inductees'}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950"
                              onClick={() => { if (confirm(t('checkpoints.deleteConfirm', { label: cp.label }))) deleteCpMutation.mutate(cp.id); }}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">Permanently delete this checkpoint and its QR code</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    {/* Checkpoint photo upload */}
                    <div className="ml-8 flex items-center gap-3">
                      {cp.imageUrl ? (
                        <div className="flex items-center gap-2">
                          <img src={`/objects${cp.imageUrl}`} alt={cp.label} className="w-20 h-14 object-cover rounded border" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          <div className="space-y-1">
                            <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => cpPhotoInputRefs.current[cp.id]?.click()}>
                              <Upload className="w-3 h-3 mr-1" />{t('checkpoints.replacePhoto')}
                            </Button>
                            <Button variant="outline" size="sm" className="text-xs h-7 px-2 text-red-600 border-red-200" onClick={async () => { await apiRequest('PUT', `/api/induction/checkpoints/${cp.id}`, { imageUrl: null }); queryClient.invalidateQueries({ queryKey: ['/api/induction/checkpoints'] }); }}>
                              <X className="w-3 h-3 mr-1" />{t('checkpoints.removePhoto')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" className="text-xs h-7 px-2 gap-1" onClick={() => cpPhotoInputRefs.current[cp.id]?.click()} disabled={uploadingCpPhotoId === cp.id}>
                          {uploadingCpPhotoId === cp.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
                          {t('checkpoints.addSitePhoto')}
                        </Button>
                      )}
                      <input ref={el => { cpPhotoInputRefs.current[cp.id] = el; }} type="file" accept="image/*" className="hidden"
                        onChange={e => { const file = e.target.files?.[0]; if (file) { setUploadingCpPhotoId(cp.id); uploadCpPhotoMutation.mutate({ id: cp.id, file }); } e.target.value = ''; }} />
                      {!cp.imageUrl && <p className="text-xs text-variable">{t('checkpoints.photoOptional')}</p>}
                    </div>
                  </div>
                )}
                {showQrFor === cp.id && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <div className="bg-white p-2 rounded-lg border shadow-sm">
                        <QRCodeImage data={getQrUrl(cp.qrToken)} size={160} alt={`QR code for ${cp.label}`} />
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-fixed">{t('checkpoints.printAffix')} <strong>{cp.label}</strong></p>
                        <p className="text-xs text-variable break-all bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded font-mono">{getQrUrl(cp.qrToken)}</p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => window.open(getQrUrl(cp.qrToken), '_blank')}>
                            <Eye className="w-3.5 h-3.5 mr-1.5" />{t('checkpoints.openScanPage')}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => window.print()}>{t('checkpoints.printQr')}</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
          <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
            <Info size={13} className="mt-0.5 shrink-0" />
            Print each checkpoint's QR code and affix it at the corresponding location on site. Inductees scan each one during their walk-around — progress is recorded against their induction record.
          </p>
        </div>
      </GlassCard>

      {/* ══ Step 5: Delivery & Records ══ */}
      <GlassCard className="p-6">
        <div className="flex items-start gap-3 mb-5">
          <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">5</span>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-fixed">{t('delivery.title')}</h3>
            <p className="text-xs text-variable mt-0.5">{t('delivery.desc')}</p>
          </div>
        </div>

        {/* Kiosk toggle */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg mb-4 space-y-3">
          <div className="flex items-center gap-2"><Monitor className="h-4 w-4 text-slate-600 dark:text-slate-400" /><h4 className="font-medium text-sm text-fixed">{t('delivery.kioskTitle')}</h4></div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor={`kiosk-toggle-${roleType}`} className="text-sm font-normal cursor-pointer">{t('delivery.kioskLabel')}</Label>
              <p className="text-xs text-muted-foreground">
                {kioskEnabled ? `${getRoleDisplayName(roleType)} must complete induction before checking in at the kiosk` : `Induction is optional — ${getRoleDisplayName(roleType).toLowerCase()} can check in without it`}
              </p>
            </div>
            <Switch id={`kiosk-toggle-${roleType}`} checked={kioskEnabled} onCheckedChange={handleKioskToggle} disabled={isTogglingKiosk || !hasVideo} />
          </div>
          {!hasVideo && <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{t('delivery.generateFirst')}</p>}
        </div>

        {/* Hazard reporting toggle */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg mb-4 space-y-3">
          <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-500" /><h4 className="font-medium text-sm text-fixed">{t('delivery.hazardReportTitle')}</h4></div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor={`hazard-report-toggle-${roleType}`} className="text-sm font-normal cursor-pointer">{t('delivery.hazardReportLabel')}</Label>
              <p className="text-xs text-muted-foreground">
                {(companySettings as any)?.inductionAllowHazardReport !== false
                  ? t('delivery.hazardReportEnabled')
                  : t('delivery.hazardReportDisabled')}
              </p>
            </div>
            <Switch
              id={`hazard-report-toggle-${roleType}`}
              checked={(companySettings as any)?.inductionAllowHazardReport !== false}
              onCheckedChange={async (v) => {
                try {
                  await apiRequest('PUT', '/api/settings', { inductionAllowHazardReport: v });
                  queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
                  toast({ title: v ? t('toasts.hazardReportingEnabled') : t('toasts.hazardReportingDisabled') });
                } catch {
                  toast({ title: t('toasts.failedUpdateSetting'), variant: 'destructive' });
                }
              }}
            />
          </div>
        </div>

        {/* Send Link dialog */}
        <Dialog open={showSendLink} onOpenChange={handleCloseSendDialog}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2 mb-4"><Send className="h-4 w-4" />{t('delivery.sendLink')}</Button>
              </DialogTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">Sends a secure, time-limited link to a specific person so they can complete this induction remotely — before arriving on site or from any device.</TooltipContent>
          </Tooltip>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-blue-600" />{t('delivery.sendDialogTitle', { role: getRoleDisplayName(roleType) })}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {!hasVideo && videoSource === 'ai_generated' && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div><p className="font-medium">{t('delivery.noInductionWarning')}</p><p className="text-xs mt-0.5 text-amber-700">{t('delivery.noInductionWarningDesc')}</p></div>
                </div>
              )}
              <p className="text-sm text-muted-foreground">{t('delivery.dialogIntro', { type: roleType === 'contractor' ? 'worker' : roleType === 'staff' ? 'staff member' : 'visitor' })}</p>
              {!manualMode ? (
                <div className="space-y-2">
                  <Label>{t('delivery.selectPerson', { type: roleType === 'contractor' ? 'Worker' : roleType === 'staff' ? 'Staff Member' : 'Visitor' })}</Label>
                  <Input placeholder={t('delivery.searchPerson')} value={personFilter} onChange={e => setPersonFilter(e.target.value)} className="text-sm" />
                  <div className="border rounded-lg max-h-48 overflow-y-auto">
                    {peopleLoading ? (
                      <div className="py-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
                    ) : filteredPeople.length === 0 ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">{personFilter ? t('delivery.noResults') : t('delivery.noPeople', { type: roleType === 'contractor' ? 'workers' : roleType === 'staff' ? 'staff' : 'visitors' })}</div>
                    ) : filteredPeople.map(person => (
                      <button key={person.id} type="button" onClick={() => { setSelectedPersonId(person.id); setSendName(person.name); setSendEmail(person.email); }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors border-b dark:border-gray-700 last:border-b-0 ${selectedPersonId === person.id ? 'bg-blue-100 dark:bg-blue-900 border-l-2 border-l-blue-500' : ''}`}>
                        <div className="font-medium">{person.name}</div>
                        <div className="text-xs text-muted-foreground">{person.subtitle}{person.email ? ` · ${person.email}` : ''}</div>
                      </button>
                    ))}
                  </div>
                  {selectedPersonId && (
                    <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg text-sm space-y-1">
                      <div className="font-medium text-green-900 dark:text-green-100 flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" /> Selected</div>
                      <div className="text-green-800 dark:text-green-200">{sendName}</div>
                      <div className="text-green-700 dark:text-green-300 text-xs">{sendEmail || <span className="text-amber-600 dark:text-amber-400">No email on file — cannot send</span>}</div>
                    </div>
                  )}
                  <button type="button" onClick={() => setManualMode(true)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">{t('delivery.enterManually')}</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>{t('delivery.nameField')}</Label>
                    <Input placeholder="e.g. Jane Smith" value={sendName} onChange={e => setSendName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('delivery.emailField')}</Label>
                    <Input type="email" placeholder="e.g. jane@example.com" value={sendEmail} onChange={e => setSendEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSendLink(); }} />
                  </div>
                  <button type="button" onClick={() => { setManualMode(false); setSendName(''); setSendEmail(''); setSelectedPersonId(null); }} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">{t('delivery.backToList')}</button>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => handleCloseSendDialog(false)}>{t('common:cancel')}</Button>
                <Button onClick={handleSendLink} disabled={isSendingLink || !sendName.trim() || !sendEmail.trim()}>
                  {isSendingLink ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('delivery.sending')}</> : <><Send className="h-4 w-4 mr-2" />{t('delivery.sendLinkBtn')}</>}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* What's included */}
        <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg text-sm mb-4">
          <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">What's included in every induction:</p>
          <ul className="space-y-1 text-xs text-blue-800 dark:text-blue-300">
            <li className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-blue-600 dark:text-blue-400" /> Professional AI-generated slides with company branding</li>
            <li className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-blue-600 dark:text-blue-400" /> UK HSE 2024 compliant content tailored to your industry and site</li>
            <li className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-blue-600 dark:text-blue-400" /> {questions.length > 0 ? questions.length : 10} scenario-based quiz questions across 5 safety categories</li>
            <li className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-blue-600 dark:text-blue-400" /> 80% pass mark required — completion logged for audit trail</li>
          </ul>
        </div>

        {/* Advanced options */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <button className="flex w-full items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
              <span className="flex items-center gap-1.5"><Settings className="h-3.5 w-3.5" />Advanced options</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            <div className="p-3 bg-purple-50 dark:bg-purple-950 border border-purple-100 dark:border-purple-800 rounded-lg text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-purple-800 dark:text-purple-200 flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-purple-600" />AI Generation Model</span>
                <Badge variant="outline" className="text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-600 text-xs">{companySettings?.openaiModel || settings?.modelType || 'claude-sonnet-4-6'}</Badge>
              </div>
              {(() => {
                const m = companySettings?.openaiModel || settings?.modelType || '';
                const missingClaude = m.startsWith('claude-') && aiKeys !== undefined && !aiKeys.claude.hasKey;
                const missingGemini = m.startsWith('gemini-') && aiKeys !== undefined && !aiKeys.gemini.hasKey;
                if (missingClaude) return (
                  <div className="flex items-start gap-1.5 p-2 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md text-yellow-800 dark:text-yellow-300">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-yellow-600" />
                    <span>Claude is selected but no Anthropic API key is configured. Add one in <strong>Settings → AI</strong>.</span>
                  </div>
                );
                if (missingGemini) return (
                  <div className="flex items-start gap-1.5 p-2 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md text-yellow-800 dark:text-yellow-300">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-yellow-600" />
                    <span>Gemini is selected but no Google API key is configured. Add one in <strong>Settings → AI</strong>.</span>
                  </div>
                );
                return null;
              })()}
            </div>
            <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-100 dark:border-green-800 rounded-lg text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium text-green-800 dark:text-green-200"><Shield className="h-3.5 w-3.5 text-green-600" />UK HSE Compliance References</div>
              <ul className="text-green-700 dark:text-green-300 space-y-0.5 ml-1">
                <li>• Health and Safety at Work Act 1974 (HASAWA)</li>
                <li>• Management of Health and Safety Regulations 1999</li>
                <li>• PPE at Work Regulations 1992 (amended 2022)</li>
                <li>• RIDDOR 2013 — Incident reporting</li>
                <li>• CDM Regulations 2015 — Construction (contractors)</li>
              </ul>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </GlassCard>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────

export default function InductionSettings() {
  const { t } = useTranslation('inductionSettings');
  const [activeRole, setActiveRole] = useState<'visitor' | 'staff' | 'contractor'>('contractor');
  const queryClient = useQueryClient();
  const { currentSettings, handleInputChange } = useSettingsAutoSave();

  const [siteOpen, setSiteOpen] = useState(false);
  // ── Quick Start state ──
  const [qs, setQs] = useState<{
    phase: 'idle' | 'fill_details' | 'generating' | 'done' | 'failed';
    form: { siteName: string; industry: string; hazards: string };
    message: string;
    percent: number;
    error?: string;
    dismissed: boolean;
  }>({ phase: 'idle', form: { siteName: '', industry: '', hazards: '' }, message: '', percent: 0, dismissed: false });
  const qsAbortRef = useRef({ abort: false });

  const ROLE_LABELS: Record<string, string> = { visitor: 'Visitors', staff: 'Staff', contractor: 'Contractors' };

  const pollRoleUntilDone = (role: string, onProgress: (pct: number) => void) =>
    new Promise<void>((resolve, reject) => {
      const iv = setInterval(async () => {
        if (qsAbortRef.current.abort) { clearInterval(iv); reject(new Error('Aborted')); return; }
        try {
          const _st = getSessionToken();
          const _ph: Record<string, string> = {};
          if (_st) _ph['Authorization'] = `Bearer ${_st}`;
          const res = await fetch(`/api/induction/status/${role}`, { credentials: 'include', headers: _ph });
          const s = await res.json();
          if (s.status === 'done') { clearInterval(iv); onProgress(100); resolve(); }
          else if (s.status === 'failed') { clearInterval(iv); reject(new Error(s.error || 'Slide generation failed')); }
          else { onProgress(Math.round((s.step / s.totalSteps) * 100)); }
        } catch (e) { clearInterval(iv); reject(e); }
      }, 3000);
    });

  const runQuickStartGeneration = async () => {
    qsAbortRef.current.abort = false;
    setQs(prev => ({ ...prev, phase: 'generating', percent: 0, error: undefined }));
    const roles = ['visitor', 'staff', 'contractor'] as const;
    try {
      for (let i = 0; i < roles.length; i++) {
        const role = roles[i];
        const base = (i / roles.length) * 100;
        const slice = 100 / roles.length;
        // Generate slides
        setQs(prev => ({ ...prev, message: `Writing slides for ${ROLE_LABELS[role]}…`, percent: Math.round(base) }));
        const r = await apiRequest('POST', `/api/induction/generate-video/${role}`, {});
        const d = await r.json();
        if (!d.started) {
          const msg = d.error === 'Generation already in progress'
            ? `A generation for ${ROLE_LABELS[role]} is already running — please wait for it to finish, then try Quick Start again.`
            : (d.error || 'Could not start slide generation. Please try again.');
          throw new Error(msg);
        }
        await pollRoleUntilDone(role, (pct) =>
          setQs(prev => ({ ...prev, percent: Math.round(base + (pct / 100) * slice * 0.75) }))
        );
        // Generate questions
        setQs(prev => ({ ...prev, message: `Generating questions for ${ROLE_LABELS[role]}…`, percent: Math.round(base + slice * 0.8) }));
        const qr = await apiRequest('POST', `/api/induction/generate-questions/${role}`, {});
        const qd = await qr.json();
        if (qd && qd.success === false) {
          throw new Error(qd.error || `Could not generate questions for ${ROLE_LABELS[role]}.`);
        }
        setQs(prev => ({ ...prev, percent: Math.round(base + slice) }));
      }
      setQs(prev => ({ ...prev, phase: 'done', percent: 100, message: '' }));
      setActiveRole('contractor');
      queryClient.invalidateQueries({ queryKey: ['/api/induction/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/induction/questions', 'visitor'] });
      queryClient.invalidateQueries({ queryKey: ['/api/induction/questions', 'staff'] });
      queryClient.invalidateQueries({ queryKey: ['/api/induction/questions', 'contractor'] });
    } catch (e: any) {
      if (e.message !== 'Aborted') {
        setQs(prev => ({ ...prev, phase: 'failed', error: e.message || 'Generation failed. Please try again.' }));
      }
    }
  };

  const handleQuickStart = async () => {
    const hasDetails = (currentSettings as any)?.inductionIndustry ||
      currentSettings?.siteAddress ||
      (currentSettings as any)?.inductionHazards;
    if (!hasDetails) { setQs(prev => ({ ...prev, phase: 'fill_details' })); return; }
    await runQuickStartGeneration();
  };

  const handleQuickStartWithForm = async () => {
    if (!qs.form.siteName.trim() && !qs.form.industry.trim()) return;
    try {
      // Save essentials FIRST so the AI generates against them. Uses PUT — the
      // only settings write endpoint the server exposes (GET + PUT /api/settings).
      await apiRequest('PUT', '/api/settings', {
        ...(qs.form.siteName.trim() && { siteAddress: qs.form.siteName.trim() }),
        ...(qs.form.industry.trim() && { inductionIndustry: qs.form.industry.trim() }),
        ...(qs.form.hazards.trim() && { inductionHazards: qs.form.hazards.trim() }),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
    } catch {
      // The whole point of this form is site-specific content — if the details
      // didn't save, stop and tell the user rather than generating a generic induction.
      setQs(prev => ({
        ...prev,
        phase: 'failed',
        error: 'Could not save your site details. Please check your connection and try again.',
      }));
      return;
    }
    await runQuickStartGeneration();
  };

  const { data: companySettings } = useQuery<CompanySettings>({ queryKey: ['/api/settings'] });
  const { data: aiKeys } = useQuery<AiKeysResponse>({ queryKey: ['/api/settings/ai-keys'], staleTime: 60000 });

  const { data: allSettings = [] } = useQuery<InductionSettingRow[]>({
    queryKey: ['/api/induction/settings'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/induction/settings');
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.settings) ? data.settings : [];
    },
    staleTime: 30000,
  });

  const settingsByRole = (allSettings as InductionSettingRow[]).reduce((acc, s) => { acc[s.roleType] = s; return acc; }, {} as Record<string, InductionSettingRow>);

  const { data: visitorQuestions = [], refetch: refetchVisitor } = useQuery<InductionQuestion[]>({
    queryKey: ['/api/induction/questions', 'visitor'],
    queryFn: async () => { const res = await fetch('/api/induction/questions?roleType=visitor', { credentials: 'include' }); if (!res.ok) return []; const d = await res.json(); return Array.isArray(d.questions) ? d.questions : []; },
  });
  const { data: staffQuestions = [], refetch: refetchStaff } = useQuery<InductionQuestion[]>({
    queryKey: ['/api/induction/questions', 'staff'],
    queryFn: async () => { const res = await fetch('/api/induction/questions?roleType=staff', { credentials: 'include' }); if (!res.ok) return []; const d = await res.json(); return Array.isArray(d.questions) ? d.questions : []; },
  });
  const { data: contractorQuestions = [], refetch: refetchContractor } = useQuery<InductionQuestion[]>({
    queryKey: ['/api/induction/questions', 'contractor'],
    queryFn: async () => { const res = await fetch('/api/induction/questions?roleType=contractor', { credentials: 'include' }); if (!res.ok) return []; const d = await res.json(); return Array.isArray(d.questions) ? d.questions : []; },
  });

  const getQuestions = (r: string) => r === 'visitor' ? visitorQuestions : r === 'staff' ? staffQuestions : contractorQuestions;
  const getRefetch = (r: string) => r === 'visitor' ? refetchVisitor : r === 'staff' ? refetchStaff : refetchContractor;
  const ROLES: Array<'visitor' | 'staff' | 'contractor'> = ['visitor', 'staff', 'contractor'];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">

        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-2">
            {t('title')}
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                  <Info size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm text-xs space-y-1.5 p-3">
                <p className="font-semibold">Health &amp; Safety Induction Builder</p>
                <p>Create site-specific, UK HSE-compliant induction programmes for contractors, staff and visitors. The AI generates slides and knowledge-check quiz questions — you then add real site photos and preview before anyone sees it.</p>
                <p className="text-muted-foreground">Checkpoints let inductees scan QR codes at physical locations during their site walk-around. All completions are logged against each person's record.</p>
              </TooltipContent>
            </Tooltip>
          </h1>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>

        {/* ── Step 0: Quick Start ── */}
        {!qs.dismissed && (
          <div className={`rounded-2xl border-2 overflow-hidden transition-all ${qs.phase === 'done' ? 'border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-950/30' : 'border-blue-400 dark:border-blue-600 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40'}`}>

            {/* ── idle: big CTA ── */}
            {qs.phase === 'idle' && (
              <div className="px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <h2 className="text-base font-bold text-blue-900 dark:text-blue-100">{t('quickStart.title')}</h2>
                  </div>
                  <p className="text-sm text-blue-700 dark:text-blue-300">{t('quickStart.desc')}</p>
                </div>
                <div className="flex flex-col gap-2 shrink-0 w-full sm:w-auto">
                  <Button onClick={handleQuickStart} className="bg-blue-600 hover:bg-blue-700 text-white gap-2 whitespace-nowrap">
                    <Sparkles className="h-4 w-4" />{t('quickStart.generateDraft')}
                  </Button>
                  <button onClick={() => setQs(prev => ({ ...prev, dismissed: true }))} className="text-xs text-blue-500 dark:text-blue-400 hover:underline text-center">{t('quickStart.setUpManually')}</button>
                </div>
              </div>
            )}

            {/* ── fill_details: mini essentials form ── */}
            {qs.phase === 'fill_details' && (
              <div className="px-6 py-5 space-y-4">
                <div>
                  <h2 className="text-base font-bold text-blue-900 dark:text-blue-100 flex items-center gap-2"><Info size={16} className="text-blue-600" />{t('quickStart.essentialsTitle')}</h2>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-0.5">{t('quickStart.essentialsDesc')}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-blue-800 dark:text-blue-200">{t('quickStart.companyName')}</Label>
                    <Input
                      value={qs.form.siteName}
                      onChange={e => setQs(prev => ({ ...prev, form: { ...prev.form, siteName: e.target.value } }))}
                      placeholder="e.g. Acme Construction — Birmingham Site"
                      className="text-sm"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-blue-800 dark:text-blue-200">{t('quickStart.industry')}</Label>
                    <Input
                      value={qs.form.industry}
                      onChange={e => setQs(prev => ({ ...prev, form: { ...prev.form, industry: e.target.value } }))}
                      placeholder="e.g. Construction, Manufacturing"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-blue-800 dark:text-blue-200">{t('quickStart.siteHazards')}</Label>
                    <Input
                      value={qs.form.hazards}
                      onChange={e => setQs(prev => ({ ...prev, form: { ...prev.form, hazards: e.target.value } }))}
                      placeholder="e.g. heavy plant, overhead lines"
                      className="text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleQuickStartWithForm}
                    disabled={!qs.form.siteName.trim() && !qs.form.industry.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                  >
                    <Sparkles className="h-4 w-4" />{t('quickStart.generateNow')}
                  </Button>
                  <Button variant="outline" onClick={() => setQs(prev => ({ ...prev, phase: 'idle' }))}>{t('common:back')}</Button>
                </div>
              </div>
            )}

            {/* ── generating: progress ── */}
            {qs.phase === 'generating' && (
              <div className="px-6 py-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">{qs.message || 'Starting generation…'}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">{t('quickStart.generatingDesc')}</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-blue-700 dark:text-blue-300">
                    <span>{t('quickStart.overallProgress')}</span>
                    <span>{qs.percent}%</span>
                  </div>
                  <div className="w-full bg-blue-100 dark:bg-blue-900 rounded-full h-2.5">
                    <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${qs.percent}%` }} />
                  </div>
                </div>
                <div className="flex gap-4 text-xs text-blue-600 dark:text-blue-400">
                  {(['visitor', 'staff', 'contractor'] as const).map((r, i) => {
                    const done = qs.percent >= Math.round(((i + 1) / 3) * 100);
                    const active = !done && qs.percent >= Math.round((i / 3) * 100);
                    return (
                      <span key={r} className={`flex items-center gap-1 ${done ? 'text-green-600 dark:text-green-400 font-medium' : active ? 'text-blue-700 dark:text-blue-300 font-medium' : 'opacity-50'}`}>
                        {done ? <CheckCircle className="h-3.5 w-3.5" /> : active ? <div className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" /> : <div className="w-3.5 h-3.5 rounded-full border-2 border-current opacity-40" />}
                        {ROLE_LABELS[r]}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── done: success banner ── */}
            {qs.phase === 'done' && (
              <div className="px-6 py-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-green-900 dark:text-green-100">{t('quickStart.draftCreated')}</p>
                    <p className="text-sm text-green-700 dark:text-green-300 mt-0.5">{t('quickStart.draftCreatedDesc')}</p>
                  </div>
                  <button onClick={() => setQs(prev => ({ ...prev, dismissed: true }))} className="text-xs text-green-600 dark:text-green-400 hover:underline whitespace-nowrap shrink-0 self-start sm:self-auto">{t('quickStart.dismiss')}</button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(['visitor', 'staff', 'contractor'] as const).map(r => (
                    <button key={r} onClick={() => setActiveRole(r)} className="text-xs px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200 border border-green-300 dark:border-green-700 hover:bg-green-200 dark:hover:bg-green-900 transition-colors font-medium">
                      <Eye className="inline h-3 w-3 mr-1" />{t('quickStart.reviewRole', { role: ROLE_LABELS[r] })}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── failed: error + retry ── */}
            {qs.phase === 'failed' && (
              <div className="px-6 py-5 space-y-3">
                <div className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-900 dark:text-red-200">{t('quickStart.generationFailed')}</p>
                    <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">{qs.error || 'Something went wrong. Please try again.'}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={runQuickStartGeneration} className="bg-blue-600 hover:bg-blue-700 text-white gap-2 text-sm">
                    <RefreshCw className="h-3.5 w-3.5" />{t('quickStart.retryBtn')}
                  </Button>
                  <Button variant="outline" onClick={() => setQs(prev => ({ ...prev, phase: 'idle' }))} className="text-sm">{t('quickStart.startOver')}</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── AI Model Selector ── */}
        <GlassCard>
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <Brain className="h-5 w-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-semibold text-fixed">{t('aiModel.title')}</h2>
                <p className="text-xs text-variable mt-0.5">{t('aiModel.desc')}</p>
              </div>
            </div>
            <div className="w-full sm:w-80 shrink-0 space-y-2">
              <Select
                value={currentSettings?.openaiModel || 'claude-sonnet-4-6'}
                onValueChange={(v) => handleInputChange('openaiModel', v)}
              >
                <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50">
                  <SelectValue placeholder={t('aiModel.placeholder')} />
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
              {(currentSettings?.openaiModel || 'claude-sonnet-4-6').startsWith('claude-') && aiKeys !== undefined && !aiKeys.claude.hasKey && (
                <div className="flex items-start gap-2 p-2.5 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg text-xs text-yellow-800 dark:text-yellow-300">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-yellow-500" />
                  <span>No Anthropic API key configured — add one in <strong>Settings → AI</strong> or generation will fail.</span>
                </div>
              )}
              {(currentSettings?.openaiModel || '').startsWith('gemini-') && aiKeys !== undefined && !aiKeys.gemini.hasKey && (
                <div className="flex items-start gap-2 p-2.5 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg text-xs text-yellow-800 dark:text-yellow-300">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-yellow-500" />
                  <span>No Google Gemini API key configured — add one in <strong>Settings → AI</strong> or generation will fail.</span>
                </div>
              )}
              <p className="text-xs text-variable">Changes auto-save. GPT models are billed via platform AI credits. Claude and Gemini models use your own API keys.</p>
            </div>
          </div>
        </GlassCard>

        {/* ── Step 1: Site Details (global) ── */}
        <GlassCard className="p-0 overflow-hidden">
          <button className="w-full flex items-center justify-between px-6 py-4 text-left" onClick={() => setSiteOpen(o => !o)}>
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
              <div>
                <h2 className="text-base font-semibold text-fixed">{t('siteDetails.title')}</h2>
                <p className="text-xs text-variable">{t('siteDetails.desc')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {(currentSettings?.inductionHazards || currentSettings?.siteAddress) && (
                <Badge variant="secondary" className="text-xs text-green-700 dark:text-green-400 hidden sm:flex">{t('siteDetails.configured')}</Badge>
              )}
              {siteOpen ? <ChevronUp className="w-5 h-5 text-variable" /> : <ChevronDown className="w-5 h-5 text-variable" />}
            </div>
          </button>
          {siteOpen && (
            <div className="px-6 pb-6 border-t border-white/10 dark:border-slate-700/30">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-fixed">{t('siteDetails.industry')}</Label>
                  <Input value={(currentSettings as any)?.inductionIndustry || ''} onChange={(e) => handleInputChange('inductionIndustry', e.target.value)} placeholder="e.g. Construction, Engineering, Manufacturing" />
                  <p className="text-xs text-variable">Tailors AI content to your sector's specific risks and regulations.</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-fixed">{t('siteDetails.siteAddress')}</Label>
                  <Input value={currentSettings?.siteAddress || ''} onChange={(e) => handleInputChange('siteAddress', e.target.value)} placeholder="e.g. Unit 4, Industrial Park, Birmingham, B1 1AA" />
                  <p className="text-xs text-variable">Shown to inductees during the induction.</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-fixed">{t('siteDetails.siteHazards')}</Label>
                  <Textarea value={(currentSettings as any)?.inductionHazards || ''} onChange={(e) => handleInputChange('inductionHazards', e.target.value)} rows={3} placeholder="e.g. Heavy plant movement, deep excavations, overhead power lines, asbestos risk in older buildings" />
                  <p className="text-xs text-variable">List hazards unique to your site — CDM 2015 requirement.</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-fixed">{t('siteDetails.ppeRequirements')}</Label>
                  <Textarea value={(currentSettings as any)?.inductionPpe || ''} onChange={(e) => handleInputChange('inductionPpe', e.target.value)} rows={3} placeholder="e.g. Hard hat, hi-vis vest, steel-toecap boots, gloves at all times on site" />
                  <p className="text-xs text-variable">Mandatory PPE per HSE PPE Regulations 1992 (amended 2022).</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-fixed">{t('siteDetails.assemblyPoint')}</Label>
                  <Input value={currentSettings?.assemblyPoint || ''} onChange={(e) => handleInputChange('assemblyPoint', e.target.value)} placeholder="e.g. Car park next to the main gate, Muster Point A" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-fixed">{t('siteDetails.firstAid')}</Label>
                  <Input value={currentSettings?.firstAidLocation || ''} onChange={(e) => handleInputChange('firstAidLocation', e.target.value)} placeholder="e.g. Site office, south wall — John Smith 07700 900123" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-fixed">{t('siteDetails.emergencyContact')}</Label>
                  <Input value={currentSettings?.emergencyContact || ''} onChange={(e) => handleInputChange('emergencyContact', e.target.value)} placeholder="e.g. Site Manager — Sarah Jones 07700 900456" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-sm font-medium text-fixed">{t('siteDetails.additionalRules')}</Label>
                  <Textarea value={(currentSettings as any)?.inductionSiteRules || ''} onChange={(e) => handleInputChange('inductionSiteRules', e.target.value)} rows={3} placeholder="e.g. No phones on the factory floor, 10 mph speed limit, permit to work required for hot works, no smoking on site" />
                  <p className="text-xs text-variable">Any rules specific to your site beyond standard H&amp;S — embedded verbatim into the AI induction.</p>
                </div>
              </div>
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-700 dark:text-blue-400 flex items-start gap-1.5">
                  <Info size={13} className="mt-0.5 shrink-0" />
                  {t('siteDetails.autoSaveNote')}
                </p>
              </div>
            </div>
          )}
        </GlassCard>

        {/* ── Role Tabs (Steps 2–5) ── */}
        <div>
          <p className="text-sm text-muted-foreground mb-3">{t('roleTabsDesc')}</p>
          <Tabs value={activeRole} onValueChange={(v) => setActiveRole(v as any)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="visitor" className="flex items-center gap-2">
                <Users className="h-4 w-4" /><span className="hidden sm:inline">{t('roleVisitors')}</span>
                {visitorQuestions.length > 0 && <Badge variant="secondary" className="text-xs px-1.5 hidden sm:flex">{visitorQuestions.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="staff" className="flex items-center gap-2">
                <Users className="h-4 w-4" /><span className="hidden sm:inline">{t('roleStaff')}</span>
                {staffQuestions.length > 0 && <Badge variant="secondary" className="text-xs px-1.5 hidden sm:flex">{staffQuestions.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="contractor" className="flex items-center gap-2">
                <HardHat className="h-4 w-4" /><span className="hidden sm:inline">{t('roleContractors')}</span>
                {contractorQuestions.length > 0 && <Badge variant="secondary" className="text-xs px-1.5 hidden sm:flex">{contractorQuestions.length}</Badge>}
              </TabsTrigger>
            </TabsList>

            {ROLES.map(role => (
              <TabsContent key={role} value={role} className="mt-6">
                <RoleCard
                  roleType={role}
                  settings={settingsByRole[role] || null}
                  questions={getQuestions(role)}
                  companySettings={companySettings}
                  onQuestionsRefetch={() => { getRefetch(role)(); queryClient.invalidateQueries({ queryKey: ['/api/induction/settings'] }); }}
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>

        {/* ── Step 6 (cont): Sent Links Log ── */}
        <SentLinksSection />

        {/* About / Compliance */}
        <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><BookOpen className="h-4 w-4 text-amber-700 dark:text-amber-400" />{t('compliance.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-amber-900 dark:text-amber-100">
            <p>{t('compliance.desc')}</p>
            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              <div className="space-y-1">
                <p className="font-semibold">{t('compliance.allCover')}</p>
                <ul className="space-y-0.5 ml-2">
                  <li>• {t('compliance.item1')}</li>
                  <li>• {t('compliance.item2')}</li>
                  <li>• {t('compliance.item3')}</li>
                  <li>• {t('compliance.item4')}</li>
                </ul>
              </div>
              <div className="space-y-1">
                <p className="font-semibold">{t('compliance.roleSpecific')}</p>
                <ul className="space-y-0.5 ml-2">
                  <li>• {t('compliance.item5')}</li>
                  <li>• {t('compliance.item6')}</li>
                  <li>• {t('compliance.item7')}</li>
                  <li>• {t('compliance.item8')}</li>
                </ul>
              </div>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-400 pt-1">{t('compliance.assessmentNote')}</p>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
