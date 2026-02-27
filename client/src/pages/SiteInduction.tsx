import { useState, useEffect } from "react";
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
  generatedHtml: string | null;
  videoUrl: string;
  hasGeneratedContent: boolean;
}

export default function SiteInduction() {
  const [match, params] = useRoute("/induction/:token");
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tokenData, setTokenData] = useState<InductionToken | null>(null);
  const [worker, setWorker] = useState<WorkerDetails | null>(null);
  const [videoContent, setVideoContent] = useState<VideoContent | null>(null);
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

  useEffect(() => {
    if (match && params?.token) {
      loadInductionData(params.token);
    }
  }, [match, params]);

  const loadInductionData = async (token: string) => {
    try {
      setLoading(true);
      
      // Get token details, worker info, and video content
      const tokenRes = await fetch(`/api/induction/token/${token}`, { credentials: "include" });
      
      if (!tokenRes.ok) {
        const errorData = await tokenRes.json().catch(() => ({ error: 'Invalid or expired link' }));
        toast({
          title: "Invalid or Expired Link",
          description: errorData.error || 'This induction link is invalid or has expired.',
          variant: "destructive"
        });
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

      // Fetch questions for the specific role type
      const questionsRes = await fetch(`/api/induction/questions?roleType=${derivedPersonType}`, { credentials: "include" });
      if (questionsRes.ok) {
        const questionsResponse = await questionsRes.json();
        setQuestions(questionsResponse.questions || []);
      }

      // Determine current step based on progress
      if (tkn.status === "completed" || tkn.quizPassed) {
        setCurrentStep("completed");
      } else if (tkn.videoWatched && !tkn.quizCompleted) {
        setCurrentStep("quiz");
      } else {
        setCurrentStep("video");
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

  const renderVideoStep = () => {
    const hasGeneratedVideo = videoContent?.hasGeneratedContent && videoContent?.generatedHtml;
    
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
                    srcDoc={videoContent.generatedHtml!}
                    className={`w-full ${videoFullscreen ? 'h-[calc(100vh-50px)]' : 'h-[calc(100%-40px)]'} bg-white`}
                    title="Induction Video"
                    sandbox="allow-scripts allow-same-origin"
                    data-testid="iframe-induction-video"
                  />
                </div>
                <p className="text-sm text-variable mb-4 text-center">
                  Please navigate through all slides to complete the induction video.
                </p>
              </>
            ) : (
              <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center mb-6 border-2 border-dashed border-gray-300">
                <div className="text-center">
                  <Play className="w-16 h-16 text-variable mx-auto mb-2" />
                  <p className="text-variable font-medium">Site Safety Induction Video</p>
                  <p className="text-sm text-variable mt-1">Duration: {videoContent?.durationMinutes || 15} minutes</p>
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">Video covers:</h4>
                    <ul className="text-sm text-blue-800 space-y-1 text-left">
                      <li>• Site-specific hazards and controls</li>
                      <li>• PPE requirements and usage</li>
                      <li>• Emergency procedures and assembly points</li>
                      <li>• Reporting procedures for incidents</li>
                      <li>• Environmental and welfare facilities</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
            
            <Alert className="mb-4">
              <Shield className="w-4 h-4" />
              <AlertDescription>
                <strong>Important:</strong> You must complete the entire video before proceeding to the questionnaire. 
                This is a legal requirement under UK Health & Safety regulations.
              </AlertDescription>
            </Alert>

            <Button 
              onClick={markVideoWatched}
              className="w-full"
              size="lg"
              data-testid="button-complete-video"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              I have completed the induction video
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderQuizStep = () => {
    const currentQuestion = questions[currentQuestionIndex];
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Shield className="w-6 h-6 text-orange-600" />
                VisiGate Pro - Site Induction
              </h1>
              <p className="text-variable mt-1">Health & Safety Compliance System</p>
            </div>
            <div className="text-right">
              <p className="font-medium text-gray-900">{worker.firstName} {worker.lastName}</p>
              <p className="text-sm text-variable">{worker.companyName}</p>
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