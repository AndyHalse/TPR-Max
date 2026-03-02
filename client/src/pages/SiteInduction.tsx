import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, Clock, Play, AlertTriangle, Shield, HardHat, XCircle, RefreshCw } from "lucide-react";
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

interface VideoContent {
  title: string;
  description: string;
  durationMinutes: number;
  videoUrl: string;
  hasGeneratedContent: boolean;
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
  const [quizResults, setQuizResults] = useState<{ score: number; passed: boolean; total: number; correct?: number } | null>(null);
  const [videoFullscreen, setVideoFullscreen] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const fetchedTokenRef = useRef<string | null>(null);

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
        throw new Error('Failed to submit quiz');
      }

      const response = await res.json();
      setQuizResults(response.results);
      
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
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center">
        <Card className="w-full max-w-md mx-4 border-green-200">
          <CardContent className="p-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-green-900 mb-2">Induction Already Completed</h2>
            <p className="text-green-700 mb-2">
              {worker.firstName} {worker.lastName} has already successfully completed this site induction.
            </p>
            {tokenData.expiresAt && (
              <p className="text-sm text-gray-500 mt-4">
                Completed before {new Date(tokenData.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
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
    const hasGeneratedVideo = videoContent?.hasGeneratedContent;
    const rawUrl = videoContent?.videoUrl ?? '';
    const hasExternalVideo = !hasGeneratedVideo && rawUrl.startsWith('http');
    const embedUrl = hasExternalVideo ? toEmbedUrl(rawUrl) : '';
    const hasAnyVideo = hasGeneratedVideo || hasExternalVideo;

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
            {hasGeneratedVideo ? (
              <>
                {videoHtmlLoading ? (
                  <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center mb-6 border border-gray-200">
                    <div className="text-center">
                      <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                      <p className="text-sm text-gray-600">Loading induction video...</p>
                    </div>
                  </div>
                ) : videoBlobUrl ? (
                  <div className={`bg-gray-900 rounded-lg overflow-hidden mb-6 ${videoFullscreen ? 'fixed inset-0 z-50' : 'aspect-video'}`}>
                    <div className="flex justify-between items-center bg-gray-800 px-4 py-2">
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
                      className={`w-full ${videoFullscreen ? 'h-[calc(100vh-50px)]' : 'h-[calc(100%-40px)]'} bg-white`}
                      title="Induction Video"
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

            <Alert className="mb-4">
              <Shield className="w-4 h-4" />
              <AlertDescription>
                <strong>Important:</strong> {hasAnyVideo ? 'Watch the full video, then answer' : 'Once you have received your safety briefing, answer'} the H&S questionnaire. You need at least <strong>{tokenData?.passThreshold ?? 80}%</strong> to pass — this is a UK Health & Safety legal requirement.
              </AlertDescription>
            </Alert>

            <Button
              onClick={markVideoWatched}
              className="w-full"
              size="lg"
              data-testid="button-complete-video"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {hasAnyVideo ? 'I have watched the induction video — Continue to Quiz' : 'I have received my safety briefing — Continue to Quiz →'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderQuizStep = () => {
    const currentQuestion = questions[currentQuestionIndex];

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
              <h3 className="text-lg font-medium mb-4">{currentQuestion.questionText}</h3>
              
              <div className="space-y-3">
                {['A', 'B', 'C', 'D'].map((option) => {
                  const optionText = currentQuestion[`option${option}` as keyof InductionQuestion] as string;
                  if (!optionText) return null;
                  
                  return (
                    <label 
                      key={option}
                      className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors hover:bg-gray-50 ${
                        answers[currentQuestion.id] === option ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      }`}
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

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                disabled={currentQuestionIndex === 0}
                data-testid="button-previous-question"
              >
                Previous
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
                  Next
                </Button>
              )}
            </div>
            
            {quizResults && !quizResults.passed && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-red-900">Quiz Not Passed</p>
                    <p className="text-sm text-red-700">
                      You scored <strong>{quizResults.score}%</strong> — you need <strong>{tokenData.passThreshold ?? 80}%</strong> to pass.
                      {tokenData.quizAttempts > 0 && ` Attempt ${tokenData.quizAttempts} of unlimited.`}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={retryQuiz}
                  variant="outline"
                  className="w-full border-red-300 text-red-700 hover:bg-red-100"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry Quiz
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderCompletedStep = () => {
    const threshold = tokenData?.passThreshold ?? 80;
    const completedAt = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return (
      <div className="space-y-6">
        <Card className="border-green-200">
          <CardContent className="p-8 text-center">
            <CheckCircle className="w-24 h-24 text-green-500 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-green-900 mb-2">Induction Complete!</h2>
            <p className="text-green-700 mb-6">
              Congratulations, {worker?.firstName}! You have successfully completed the site induction.
            </p>

            {quizResults && (
              <div className="bg-green-50 border border-green-200 p-4 rounded-lg mb-6">
                <p className="text-2xl font-bold text-green-800 mb-1">{quizResults.score}%</p>
                <p className="text-sm text-green-700">
                  {typeof quizResults.correct === 'number' && quizResults.total
                    ? `${quizResults.correct} out of ${quizResults.total} correct`
                    : `Pass mark: ${threshold}%`
                  } — <strong>PASSED</strong>
                </p>
                <p className="text-xs text-green-600 mt-2">Completed {completedAt}</p>
              </div>
            )}

            {!quizResults && (
              <div className="bg-green-50 border border-green-200 p-4 rounded-lg mb-6">
                <p className="text-sm text-green-700">Your induction has been recorded. Pass mark: {threshold}%.</p>
              </div>
            )}
            
            <div className="bg-blue-50 p-6 rounded-lg text-left">
              <h3 className="font-semibold text-blue-900 mb-3">What happens next:</h3>
              <ul className="text-blue-800 space-y-2">
                <li>✅ Your induction status has been automatically updated</li>
                <li>✅ You are now authorized for site access</li>
                <li>✅ Present yourself to site management for check-in</li>
                <li>✅ Remember to follow all safety procedures at all times</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-orange-50">
      {/* Header */}
      <div className="bg-[var(--card)] shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Shield className="w-6 h-6 text-orange-600" />
                Site Induction
              </h1>
              <p className="text-variable mt-1">Health & Safety Compliance</p>
            </div>
            <div className="text-right space-y-1">
              <p className="font-semibold text-gray-900">{worker.firstName} {worker.lastName}</p>
              {worker.companyName && <p className="text-sm text-variable">{worker.companyName}</p>}
              <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                personType === 'visitor'
                  ? 'bg-blue-100 text-blue-700'
                  : personType === 'staff'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-orange-100 text-orange-700'
              }`}>
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
            <div className={`flex items-center ${currentStep === "video" ? "text-blue-600" : tokenData.videoWatched ? "text-green-600" : "text-gray-400"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                tokenData.videoWatched ? "bg-green-100" : currentStep === "video" ? "bg-blue-100" : "bg-gray-100"
              }`}>
                {tokenData.videoWatched ? <CheckCircle className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </div>
              <span className="ml-2 font-medium">Video</span>
            </div>
            
            <div className="w-12 h-px bg-gray-300" />
            
            <div className={`flex items-center ${currentStep === "quiz" ? "text-blue-600" : tokenData.quizCompleted ? "text-green-600" : "text-gray-400"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                tokenData.quizCompleted ? "bg-green-100" : currentStep === "quiz" ? "bg-blue-100" : "bg-gray-100"
              }`}>
                {tokenData.quizCompleted ? <CheckCircle className="w-4 h-4" /> : <HardHat className="w-4 h-4" />}
              </div>
              <span className="ml-2 font-medium">Quiz</span>
            </div>
            
            <div className="w-12 h-px bg-gray-300" />
            
            <div className={`flex items-center ${currentStep === "completed" ? "text-green-600" : "text-gray-400"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep === "completed" ? "bg-green-100" : "bg-gray-100"
              }`}>
                <CheckCircle className="w-4 h-4" />
              </div>
              <span className="ml-2 font-medium">Complete</span>
            </div>
          </div>
        </div>

        {/* Step Content */}
        {currentStep === "video" && renderVideoStep()}
        {currentStep === "quiz" && renderQuizStep()}
        {currentStep === "completed" && renderCompletedStep()}

        {/* Footer */}
        <div className="mt-12 text-center text-sm text-variable">
          <p>This induction link expires on {new Date(tokenData.expiresAt).toLocaleDateString('en-GB')}</p>
          <p className="mt-1">VisiGate Pro - Contractor Management System</p>
        </div>
      </div>
    </div>
  );
}