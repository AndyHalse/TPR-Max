import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, CheckCircle2, Clock, Play, AlertTriangle, Shield, HardHat, RefreshCw, ClipboardCheck, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface InductionToken {
  id: string;
  workerId?: string;
  visitorId?: string;
  staffId?: string;
  personType?: string;
  personName?: string;
  personEmail?: string;
  token: string;
  status: "pending" | "in_progress" | "completed" | "expired" | "failed";
  videoWatched: boolean;
  quizCompleted: boolean;
  quizPassed?: boolean;
  quizScore: number;
  passThreshold: number;
  quizAttempts: number;
  expiresAt: string;
  completedAt?: string | null;
  quizCompletedAt?: string | null;
}

interface InductionQuestion {
  id: string;
  questionText: string;
  questionType: "multiple_choice" | "true_false";
  correctAnswer: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  explanation: string;
  category: string;
}

interface WorkerDetails {
  firstName: string;
  lastName: string;
  email: string;
  companyName?: string;
}

interface InductionBranding {
  companyName?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  accentColor?: string | null;
  backgroundColor?: string | null;
  foregroundColor?: string | null;
}

interface VideoContent {
  title: string;
  description: string;
  durationMinutes: number;
  videoUrl: string;
  hasGeneratedContent: boolean;
  videoMode?: 'ai_generated' | 'custom_upload';
  customVideoUrl?: string | null;
}

export default function SiteInduction() {
  const [match, params] = useRoute("/induction/:token");
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tokenData, setTokenData] = useState<InductionToken | null>(null);
  const [worker, setWorker] = useState<WorkerDetails | null>(null);
  const [videoHtml, setVideoHtml] = useState<string | null>(null);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [videoHtmlLoading, setVideoHtmlLoading] = useState(false);
  const [videoContent, setVideoContent] = useState<VideoContent | null>(null);

  // Convert video HTML to blob URL so iOS Safari renders it (srcDoc is unreliable on mobile)
  useEffect(() => {
    if (!videoHtml) { setVideoBlobUrl(null); return; }
    const blob = new Blob([videoHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    setVideoBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoHtml]);
  const [personType, setPersonType] = useState<string>("contractor");
  const [currentStep, setCurrentStep] = useState<"video" | "quiz" | "completed">("video");
  const [questions, setQuestions] = useState<InductionQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizLocked, setQuizLocked] = useState<string | null>(null);
  const [quizResults, setQuizResults] = useState<{
    score: number;
    passed: boolean;
    total: number;
    correct?: number;
    topicsCovered?: { id: number; label: string; covered: boolean; coveredAt: string }[];
  } | null>(null);
  const [videoFullscreen, setVideoFullscreen] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [branding, setBranding] = useState<InductionBranding | null>(null);
  const fetchedTokenRef = useRef<string | null>(null);

  // Derive usable brand values with safe fallbacks
  const brandAccent = branding?.accentColor || '#2460a9';
  const brandName = branding?.companyName || null;
  const brandLogo = branding?.logoUrl || branding?.bannerUrl || null;

  useEffect(() => {
    const token = params?.token;
    if (match && token && fetchedTokenRef.current !== token) {
      fetchedTokenRef.current = token;
      loadInductionData(token);
    }
  }, [match, params?.token]);

  const loadInductionData = async (token: string) => {
    try {
      setLoading(true);
      
      // Get token details, worker info, and video content
      const tokenRes = await fetch(`/api/induction/token/${token}`, { credentials: "include" });
      
      if (!tokenRes.ok) {
        // 410 = expired token — show the dedicated expired screen
        if (tokenRes.status === 410) {
          setTokenExpired(true);
          setLoading(false);
          return;
        }
        // 404 or other errors — show invalid link state (don't toast so the screen shows)
        setLoading(false);
        return;
      }

      const tokenResponse = await tokenRes.json();

      const tkn = tokenResponse.token;

      // Check if token is expired
      if (tkn.expiresAt && new Date(tkn.expiresAt) < new Date()) {
        setTokenExpired(true);
        setLoading(false);
        return;
      }

      // Check if already completed (loaded fresh, not from this session)
      if (tkn.status === "completed" && tkn.quizPassed) {
        setAlreadyCompleted(true);
        setTokenData(tkn);
        setWorker(tokenResponse.worker);
        setLoading(false);
        return;
      }

      setTokenData(tkn);
      setWorker(tokenResponse.worker);
      setVideoContent(tokenResponse.videoContent);
      if (tokenResponse.branding) setBranding(tokenResponse.branding);
      
      // Derive personType from token object - critical for correct quiz and messaging
      const derivedPersonType = tkn?.personType || 'contractor';
      setPersonType(derivedPersonType);

      // Determine current step based on progress (do this before fetching questions)
      if (tkn.status === "completed" || tkn.quizPassed) {
        setCurrentStep("completed");
      } else if (tkn.videoWatched && !tkn.quizCompleted) {
        setCurrentStep("quiz");
      } else {
        setCurrentStep("video");
      }

      // Fetch questions — pass token so the route can resolve customer questions without auth
      const questionsRes = await fetch(`/api/induction/questions?roleType=${derivedPersonType}&token=${token}`, { credentials: "include" });
      if (questionsRes.ok) {
        const questionsResponse = await questionsRes.json();
        setQuestions(questionsResponse.questions || []);
      }

      // Fetch video HTML in the background (it can be large — don't block page render)
      if (tokenResponse.videoContent?.hasGeneratedContent) {
        setVideoHtmlLoading(true);
        fetch(`/api/induction/video/by-token/${token}`)
          .then(r => r.ok ? r.text() : null)
          .then(html => { if (html) setVideoHtml(html); })
          .catch(() => {})
          .finally(() => setVideoHtmlLoading(false));
      }

    } catch (error) {
      console.error("Failed to load induction data:", error);
      toast({
        title: "Error",
        description: "Failed to load induction data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const markVideoWatched = async () => {
    if (!tokenData) return;
    
    try {
      const res = await fetch(`/api/induction/${tokenData.id}/video-watched`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (!res.ok) {
        throw new Error('Failed to mark video as watched');
      }
      
      setTokenData(prev => prev ? { ...prev, videoWatched: true, status: 'in_progress' } : null);
      setCurrentStep("quiz");
      
      toast({
        title: "Video Completed",
        description: "Now complete the H&S questionnaire to finish your induction."
      });
    } catch (error) {
      console.error("Failed to mark video as watched:", error);
      toast({
        title: "Error",
        description: "Failed to update progress. Please try again.",
        variant: "destructive"
      });
    }
  };

  const submitQuiz = async () => {
    if (!tokenData || questions.length === 0) return;
    
    // Check all questions are answered
    const unansweredQuestions = questions.filter(q => !answers[q.id]);
    if (unansweredQuestions.length > 0) {
      toast({
        title: "Incomplete Quiz",
        description: `Please answer all ${questions.length} questions before submitting.`,
        variant: "destructive"
      });
      return;
    }

    try {
      setQuizSubmitted(true);
      
      const answersArray = questions.map(q => ({
        questionId: q.id,
        selectedAnswer: answers[q.id]
      }));

      const res = await fetch(`/api/induction/${tokenData.id}/submit-quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ answers: answersArray })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 429) {
          const msg = errData.error || "Please wait before retrying the quiz.";
          const isMaxAttempts = msg.toLowerCase().includes('maximum') || msg.toLowerCase().includes('contact');
          if (isMaxAttempts) {
            setQuizLocked(msg);
          } else {
            toast({ title: "Quiz Locked", description: msg, variant: "destructive", duration: 10000 });
          }
          setQuizSubmitted(false);
          return;
        }
        throw new Error(errData.error || 'Failed to submit quiz');
      }

      const response = await res.json();
      setQuizResults({ ...response.results, topicsCovered: response.topicsCovered });
      
      const threshold = tokenData?.passThreshold ?? 80;
      if (response.results.passed) {
        setCurrentStep("completed");
        toast({
          title: "Congratulations!",
          description: `You passed with ${response.results.score}%! Your induction is now complete.`,
          duration: 5000
        });
      } else {
        setTokenData(prev => prev ? { ...prev, quizAttempts: (prev.quizAttempts || 0) + 1 } : null);
        toast({
          title: "Quiz Not Passed",
          description: `You scored ${response.results.score}%. You need ${threshold}% to pass. Review the questions and retry.`,
          variant: "destructive",
          duration: 8000
        });
      }

    } catch (error) {
      console.error("Failed to submit quiz:", error);
      toast({
        title: "Submission Failed",
        description: "Failed to submit quiz. Please try again.",
        variant: "destructive"
      });
    } finally {
      setQuizSubmitted(false);
    }
  };

  const retryQuiz = () => {
    setAnswers({});
    setCurrentQuestionIndex(0);
    setQuizResults(null);
    setQuizSubmitted(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-orange-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-variable">Loading induction...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tokenExpired) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="p-8 text-center">
            <Clock className="w-16 h-16 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">This Link Has Expired</h2>
            <p className="text-gray-600 mb-4">This induction link has passed its expiry date. Induction links are valid for 7 days from the date they were sent.</p>
            <p className="text-sm text-gray-500">Please contact your site manager or administrator to request a new induction link.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (alreadyCompleted && tokenData && worker) {
    const completionDate = tokenData.completedAt || tokenData.quizCompletedAt;
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center">
        <Card className="w-full max-w-md mx-4 border-green-200">
          <CardContent className="p-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-green-900 mb-2">Induction Already Completed</h2>
            <p className="text-green-700 mb-2">
              {worker.firstName} {worker.lastName} has already successfully completed this site induction.
            </p>
            {tokenData.quizScore > 0 && (
              <div className="mt-3 px-4 py-2 bg-green-100 border border-green-200 rounded-lg inline-block">
                <p className="text-green-800 font-semibold text-lg">{tokenData.quizScore}% — PASSED</p>
                <p className="text-green-600 text-xs">Pass mark: {tokenData.passThreshold ?? 80}%</p>
              </div>
            )}
            {completionDate && (
              <p className="text-sm text-gray-500 mt-4">
                Completed on {new Date(completionDate).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg text-left text-sm text-green-800">
              <p className="font-medium mb-1">✅ Your induction record is confirmed</p>
              <p>Present yourself to site management when you arrive on site.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!tokenData || !worker) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Invalid Link</h2>
            <p className="text-gray-600">This induction link is invalid. Please check the link and try again, or contact your site manager for a new link.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const toEmbedUrl = (url: string): string => {
    if (!url) return url;
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0&rel=0`;
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    return url;
  };

  const renderVideoStep = () => {
    const isCustomUpload = videoContent?.videoMode === 'custom_upload' && !!videoContent?.customVideoUrl;
    const hasGeneratedVideo = !isCustomUpload && videoContent?.hasGeneratedContent;
    const rawUrl = videoContent?.videoUrl ?? '';
    const hasExternalVideo = !isCustomUpload && !hasGeneratedVideo && rawUrl.startsWith('http');
    const embedUrl = hasExternalVideo ? toEmbedUrl(rawUrl) : '';
    const hasAnyVideo = isCustomUpload || hasGeneratedVideo || hasExternalVideo;

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="w-5 h-5 text-blue-600" />
              {videoContent?.title || 'Site Induction Video'}
            </CardTitle>
            <CardDescription>
              {videoContent?.description || `Watch the complete site safety induction video (approximately ${videoContent?.durationMinutes || 15} minutes)`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isCustomUpload ? (
              <div className={videoFullscreen
                ? 'fixed inset-0 z-50 bg-black flex flex-col'
                : 'aspect-video bg-black rounded-lg overflow-hidden mb-6 flex flex-col'}>
                {videoFullscreen && (
                  <div className="flex-shrink-0 flex justify-end items-center bg-gray-900 px-4 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-white hover:bg-gray-700"
                      onClick={() => setVideoFullscreen(false)}
                    >
                      Exit Fullscreen
                    </Button>
                  </div>
                )}
                <video
                  src={videoContent!.customVideoUrl!}
                  controls
                  controlsList="nodownload"
                  className="flex-1 min-h-0 w-full bg-black"
                  onEnded={() => {
                    setTokenData(prev => prev ? { ...prev, videoWatched: true, status: 'in_progress' } : null);
                  }}
                  data-testid="video-custom-upload"
                />
              </div>
            ) : hasGeneratedVideo ? (
              <>
                {videoHtmlLoading ? (
                  <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center mb-6 border border-gray-200">
                    <div className="text-center">
                      <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                      <p className="text-sm text-gray-600">Loading induction video...</p>
                    </div>
                  </div>
                ) : videoBlobUrl ? (
                  <div className={videoFullscreen
                    ? 'fixed inset-0 z-50 bg-gray-900 flex flex-col'
                    : 'w-full bg-gray-900 rounded-lg overflow-hidden mb-6 flex flex-col'}
                    style={videoFullscreen ? undefined : { aspectRatio: '16/9', minHeight: '340px' }}>
                    <div className="flex-shrink-0 flex justify-between items-center bg-gray-800 px-4 py-2">
                      <span className="text-white text-sm font-medium">AI-Generated Safety Induction</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-white hover:bg-gray-700"
                        onClick={() => setVideoFullscreen(!videoFullscreen)}
                        data-testid="button-toggle-fullscreen"
                      >
                        {videoFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                      </Button>
                    </div>
                    <iframe
                      src={videoBlobUrl}
                      className="flex-1 min-h-0 w-full border-0 bg-white"
                      title="Induction Video"
                      scrolling="auto"
                      data-testid="iframe-induction-video"
                    />
                  </div>
                ) : null}
                <p className="text-sm text-variable mb-4 text-center">
                  Please navigate through all slides to complete the induction video.
                </p>
              </>
            ) : hasExternalVideo ? (
              <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden mb-6">
                <iframe
                  src={embedUrl}
                  className="w-full h-full"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  title="Induction Video"
                  data-testid="iframe-induction-video"
                />
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <Shield className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-blue-900 mb-1">Safety Briefing</h3>
                    <p className="text-sm text-blue-700 mb-3">
                      Your site safety induction will be delivered by site management. This may be an in-person briefing, video, or written handout. Ensure you have received and understood all the following:
                    </p>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" /> Site-specific hazards and controls</li>
                      <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" /> PPE requirements and usage</li>
                      <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" /> Emergency procedures and assembly points</li>
                      <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" /> Reporting procedures for incidents</li>
                      <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" /> Environmental and welfare facilities</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {isCustomUpload && !tokenData?.videoWatched && (
              <Alert className="mb-4 border-amber-200 bg-amber-50">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  <strong>You must watch the full video before taking the quiz.</strong> The Continue button will unlock when the video finishes.
                </AlertDescription>
              </Alert>
            )}

            <Alert className="mb-4">
              <Shield className="w-4 h-4" />
              <AlertDescription>
                <strong>Important:</strong> {hasAnyVideo ? 'Watch the full video, then answer' : 'Once you have received your safety briefing, answer'} the H&S questionnaire. You need at least <strong>{tokenData?.passThreshold ?? 80}%</strong> to pass — this is a UK Health & Safety legal requirement.
              </AlertDescription>
            </Alert>

            <Button
              onClick={markVideoWatched}
              disabled={isCustomUpload && !tokenData?.videoWatched}
              className="w-full flex-col gap-0.5 h-auto py-3"
              size="lg"
              data-testid="button-complete-video"
            >
              <span className="flex items-center gap-2 font-semibold">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                Continue to Quiz
              </span>
              <span className="text-xs font-normal opacity-80">
                {hasAnyVideo ? 'I confirm I have watched the induction video' : 'I confirm I have received my safety briefing'}
              </span>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderQuizStep = () => {
    const currentQuestion = questions[currentQuestionIndex];

    // Check if already locked from previous attempts (at load time or after 429)
    const alreadyMaxed = !quizLocked && tokenData && (tokenData.quizAttempts ?? 0) >= 3 && !tokenData.quizPassed;
    const lockReason = quizLocked || (alreadyMaxed ? 'Maximum quiz attempts reached. Please contact the site administrator to reset your induction.' : null);

    if (lockReason) {
      return (
        <div className="space-y-6">
          <Card className="border-red-200">
            <CardContent className="p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                <Lock className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Quiz Locked</h2>
              <p className="text-gray-600 max-w-sm mx-auto">{lockReason}</p>
              <p className="text-sm text-gray-500">Once reset by your site manager, reload this page to try again.</p>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (questions.length === 0) {
      return (
        <div className="space-y-6">
          <Card className="border-amber-200">
            <CardContent className="p-8 text-center">
              <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900 mb-2">Questions Not Yet Available</h2>
              <p className="text-gray-600 mb-4">
                The H&S questionnaire for this induction has not been set up yet. Please contact your site manager — they need to generate the quiz questions before you can complete the induction.
              </p>
              <p className="text-sm text-gray-500">No action is required on your part at this time.</p>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (!currentQuestion) return null;

    const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <HardHat className="w-5 h-5 text-orange-600" />
                UK Health & Safety Questionnaire
              </span>
              <Badge variant="outline">
                Question {currentQuestionIndex + 1} of {questions.length}
              </Badge>
            </CardTitle>
            <Progress value={progress} className="mt-2" />
          </CardHeader>
          <CardContent>
            <div className="mb-6">
              <p className="text-sm text-muted-foreground mb-2">Question {currentQuestionIndex + 1} of {questions.length}</p>
              <h3 className="text-lg md:text-xl font-medium mb-4">{currentQuestion.questionText}</h3>
              
              <div className="space-y-3">
                {['A', 'B', 'C', 'D'].map((option) => {
                  const optionText = currentQuestion[`option${option}` as keyof InductionQuestion] as string;
                  if (!optionText) return null;
                  
                  const isSelected = answers[currentQuestion.id] === option;
                  return (
                    <label 
                      key={option}
                      className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors"
                      style={isSelected
                        ? { borderColor: brandAccent, backgroundColor: brandAccent + '18' }
                        : undefined}
                    >
                      <input
                        type="radio"
                        name={currentQuestion.id}
                        value={option}
                        checked={answers[currentQuestion.id] === option}
                        onChange={(e) => setAnswers(prev => ({ ...prev, [currentQuestion.id]: e.target.value }))}
                        className="mt-1"
                        data-testid={`radio-${currentQuestion.id}-${option}`}
                      />
                      <span className="flex-1">
                        <strong>{option}.</strong> {optionText}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3 flex-wrap justify-center">
              <Button
                variant="outline"
                onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                disabled={currentQuestionIndex === 0}
                data-testid="button-previous-question"
              >
                ← Previous
              </Button>

              {currentQuestionIndex === questions.length - 1 ? (
                <Button
                  onClick={submitQuiz}
                  disabled={quizSubmitted || !answers[currentQuestion.id]}
                  size="lg"
                  data-testid="button-submit-quiz"
                >
                  {quizSubmitted ? "Submitting..." : "Submit Quiz"}
                </Button>
              ) : (
                <Button
                  onClick={() => setCurrentQuestionIndex(prev => Math.min(questions.length - 1, prev + 1))}
                  disabled={!answers[currentQuestion.id]}
                  data-testid="button-next-question"
                >
                  Next →
                </Button>
              )}
            </div>
            
            {quizResults && !quizResults.passed && (() => {
              const attemptsUsed = tokenData.quizAttempts ?? 0;
              const attemptsRemaining = Math.max(0, 3 - attemptsUsed);
              return (
                <div className="mt-6 max-w-lg mx-auto px-2 space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center space-y-4">
                    <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto" />
                    <div>
                      <h3 className="text-xl font-bold text-amber-900 mb-1">Induction Not Passed</h3>
                      <p className="text-amber-800 font-semibold text-lg">
                        You scored {quizResults.score}% — you need {tokenData.passThreshold ?? 80}% to pass
                      </p>
                      <p className="text-sm text-amber-700 mt-1">
                        {attemptsRemaining > 0
                          ? `You have ${attemptsRemaining} attempt${attemptsRemaining !== 1 ? 's' : ''} remaining`
                          : 'You have used all 3 attempts'}
                      </p>
                    </div>
                    {attemptsRemaining > 0 ? (
                      <Button
                        onClick={retryQuiz}
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Try Again
                      </Button>
                    ) : (
                      <p className="text-sm text-amber-800 bg-amber-100 border border-amber-200 rounded-lg px-4 py-3">
                        Please contact the site administrator to arrange a reset of your induction attempt.
                      </p>
                    )}
                  </div>

                  {/* CDM 2015 topics — shown even on fail so the operator can see coverage */}
                  {quizResults.topicsCovered && quizResults.topicsCovered.length > 0 && (
                    <div className="border border-blue-200 rounded-lg overflow-hidden">
                      <div className="bg-blue-700 px-4 py-2 flex items-center gap-2">
                        <ClipboardCheck className="w-4 h-4 text-white" />
                        <span className="text-white text-sm font-semibold">Induction Topics Covered</span>
                      </div>
                      <ul className="divide-y divide-blue-100">
                        {quizResults.topicsCovered.map(t => (
                          <li key={t.id} className="flex items-start gap-2.5 px-4 py-2.5 bg-blue-50">
                            <CheckCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                            <span className="text-sm text-blue-900">{t.label}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-blue-700 px-4 py-2 bg-blue-50 border-t border-blue-200">
                        All 10 CDM 2015 required topics were covered in this induction, regardless of quiz result.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderCompletedStep = () => {
    const threshold = tokenData?.passThreshold ?? 80;
    const now = new Date();
    const completedAtStr = now.toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return (
      <div className="space-y-6">
        <Card className="border-green-200">
          <CardContent className="max-w-lg mx-auto px-6 py-8 text-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-green-900 mb-2">Induction Complete</h2>
            <p className="text-green-700 mb-6">
              Congratulations, {worker?.firstName}! You have successfully completed the site induction.
            </p>

            {quizResults && (
              <div className="bg-green-50 border border-green-200 p-4 rounded-lg mb-6">
                <p className="text-3xl font-bold text-green-800 mb-1">{quizResults.score}%</p>
                <p className="text-sm text-green-700 font-medium">
                  {typeof quizResults.correct === 'number' && quizResults.total
                    ? `${quizResults.correct} out of ${quizResults.total} correct — `
                    : `Pass mark: ${threshold}% — `
                  }
                  <strong>Pass ✓</strong>
                </p>
                <p className="text-xs text-green-600 mt-2 border-t border-green-200 pt-2">Completed on {completedAtStr}</p>
              </div>
            )}

            {!quizResults && (
              <div className="bg-green-50 border border-green-200 p-4 rounded-lg mb-6">
                <p className="text-sm text-green-700">Your induction has been recorded. Pass mark: {threshold}%.</p>
                <p className="text-xs text-green-600 mt-1">Completed on {completedAtStr}</p>
              </div>
            )}
            
            {/* CDM 2015 compliance checklist */}
            {quizResults?.topicsCovered && quizResults.topicsCovered.length > 0 && (
              <div className="border border-green-200 rounded-lg overflow-hidden text-left mb-6">
                <div className="bg-green-700 px-4 py-2 flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-white" />
                  <span className="text-white text-sm font-semibold">CDM 2015 Compliance Record — Topics Covered</span>
                </div>
                <ul className="divide-y divide-green-100">
                  {quizResults.topicsCovered.map(t => (
                    <li key={t.id} className="flex items-start gap-2.5 px-4 py-2.5 bg-green-50">
                      <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                      <span className="text-sm text-green-900">{t.label}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-green-700 px-4 py-2 bg-green-50 border-t border-green-200">
                  All 10 HSE-required induction topics were covered. This record is stored for audit purposes.
                </p>
              </div>
            )}

            <div className="bg-blue-50 p-5 rounded-lg text-left">
              <h3 className="font-semibold text-blue-900 mb-3">What happens next:</h3>
              <ul className="text-blue-800 space-y-2">
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" /> Your induction status has been automatically updated</li>
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" /> You are now authorised for site access</li>
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" /> Present yourself to site management for check-in</li>
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" /> Remember to follow all safety procedures at all times</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="min-h-screen" style={{ background: `linear-gradient(135deg, ${brandAccent}18 0%, ${brandAccent}08 100%)` }}>
      {/* Header */}
      <div className="shadow-sm border-b" style={{ borderBottomColor: brandAccent + '30', backgroundColor: 'white' }}>
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Company branding — logo + name */}
            <div className="flex items-center gap-3">
              {brandLogo ? (
                <img
                  src={`/objects${brandLogo}`}
                  alt={brandName || 'Company logo'}
                  className="h-10 w-auto max-w-[140px] object-contain"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: brandAccent + '20' }}>
                  <Shield className="w-5 h-5" style={{ color: brandAccent }} />
                </div>
              )}
              <div>
                {brandName && <p className="font-bold text-gray-900 leading-tight">{brandName}</p>}
                <p className="text-sm text-gray-500 leading-tight">Site Induction · Health &amp; Safety</p>
              </div>
            </div>
            {/* Person info */}
            <div className="text-right space-y-1 shrink-0">
              <p className="font-semibold text-gray-900 text-sm">{worker.firstName} {worker.lastName}</p>
              {worker.companyName && <p className="text-xs text-gray-500">{worker.companyName}</p>}
              <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: brandAccent }}>
                {personType === 'visitor' ? 'Visitor' : personType === 'staff' ? 'Staff' : 'Contractor'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Progress Indicators */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center space-x-4">
            <div className={`flex items-center ${tokenData.videoWatched ? "text-green-600" : "text-gray-700"}`}>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={currentStep === "video" && !tokenData.videoWatched ? { backgroundColor: brandAccent + '20', color: brandAccent } : undefined}
              >
                {tokenData.videoWatched ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Play className="w-4 h-4" style={{ color: currentStep === "video" ? brandAccent : undefined }} />}
              </div>
              <span className="ml-2 font-medium text-sm" style={currentStep === "video" && !tokenData.videoWatched ? { color: brandAccent } : undefined}>Video</span>
            </div>
            
            <div className="w-12 h-px bg-gray-300" />
            
            <div className={`flex items-center ${tokenData.quizCompleted ? "text-green-600" : "text-gray-400"}`}>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={currentStep === "quiz" ? { backgroundColor: brandAccent + '20', color: brandAccent } : undefined}
              >
                {tokenData.quizCompleted ? <CheckCircle className="w-4 h-4 text-green-600" /> : <HardHat className="w-4 h-4" style={{ color: currentStep === "quiz" ? brandAccent : undefined }} />}
              </div>
              <span className="ml-2 font-medium text-sm" style={currentStep === "quiz" ? { color: brandAccent } : undefined}>Quiz</span>
            </div>
            
            <div className="w-12 h-px bg-gray-300" />
            
            <div className={`flex items-center ${currentStep === "completed" ? "text-green-600" : "text-gray-400"}`}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100">
                <CheckCircle className="w-4 h-4" style={currentStep === "completed" ? { color: brandAccent } : undefined} />
              </div>
              <span className="ml-2 font-medium text-sm" style={currentStep === "completed" ? { color: brandAccent } : undefined}>Complete</span>
            </div>
          </div>
        </div>

        {/* Step Content */}
        {currentStep === "video" && renderVideoStep()}
        {currentStep === "quiz" && renderQuizStep()}
        {currentStep === "completed" && renderCompletedStep()}

        {/* Footer */}
        <div className="mt-12 text-center text-xs text-gray-400 space-y-1">
          <p>This induction link expires on {new Date(tokenData.expiresAt).toLocaleDateString('en-GB')}</p>
          {brandName && <p>{brandName} — Site Induction System</p>}
          <p>Powered by TPR Max Visitor Management</p>
        </div>
      </div>
    </div>
  );
}