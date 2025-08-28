import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Video, 
  FileQuestion, 
  CheckCircle, 
  Clock, 
  Users, 
  Play, 
  ArrowLeft, 
  ArrowRight,
  Award,
  AlertTriangle,
  Shield
} from "lucide-react";

interface InductionQuestion {
  id: string;
  questionText: string;
  questionType: string;
  correctAnswer: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  explanation: string;
  category: string;
  roleType: string;
  orderIndex: number;
}

interface InductionSettings {
  id: string;
  roleType: string;
  videoTitle: string;
  videoUrl: string;
  videoDescription: string;
  videoDurationMinutes: number;
  videoFormat: string;
  modelType: string;
  passPercentage: number;
  isActive: boolean;
}

export default function InductionPreview() {
  const { roleType } = useParams();
  const [settings, setSettings] = useState<InductionSettings | null>(null);
  const [questions, setQuestions] = useState<InductionQuestion[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchInductionData = async () => {
      try {
        setLoading(true);
        
        // Fetch induction settings
        const settingsResponse = await fetch('/api/induction/settings');
        const settingsData = await settingsResponse.json();
        const roleSettings = settingsData.settings?.find((s: InductionSettings) => s.roleType === roleType);
        
        if (roleSettings) {
          setSettings(roleSettings);
        }

        // Fetch questions for this role
        const questionsResponse = await fetch(`/api/induction/questions/${roleType}`);
        const questionsData = await questionsResponse.json();
        setQuestions(questionsData.questions || []);
        
      } catch (error) {
        console.error('Error fetching induction data:', error);
        toast({
          title: "Error",
          description: "Failed to load induction preview",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    if (roleType) {
      fetchInductionData();
    }
  }, [roleType, toast]);

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'visitor': return 'Visitor';
      case 'staff': return 'Staff';
      case 'contractor': return 'Contractor';
      default: return role;
    }
  };

  const steps = [
    { id: 'intro', title: 'Introduction', icon: Users },
    { id: 'video', title: 'Safety Video', icon: Video },
    { id: 'quiz', title: 'Safety Quiz', icon: FileQuestion },
    { id: 'results', title: 'Results', icon: Award }
  ];

  const handleAnswerSelect = (questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const calculateScore = () => {
    const correctAnswers = questions.filter(q => answers[q.id] === q.correctAnswer).length;
    return Math.round((correctAnswers / questions.length) * 100);
  };

  const isPassingScore = () => {
    const score = calculateScore();
    return score >= (settings?.passPercentage || 80);
  };

  const goToNextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const completeQuiz = () => {
    setShowResults(true);
    setCurrentStep(3); // Results step
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading induction preview...</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Induction Not Found</h2>
            <p className="text-muted-foreground mb-4">
              No induction settings found for {getRoleDisplayName(roleType || '')}
            </p>
            <Button onClick={() => window.close()}>Close Preview</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">
                {getRoleDisplayName(roleType || '')} Safety Induction
              </h1>
              <p className="text-slate-600">Preview Mode - VisiGate Pro</p>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Progress</span>
              <span className="text-sm text-muted-foreground">
                Step {currentStep + 1} of {steps.length}
              </span>
            </div>
            <Progress value={(currentStep / (steps.length - 1)) * 100} className="h-2" />
            
            <div className="flex items-center justify-between mt-3">
              {steps.map((step, index) => {
                const Icon = step.icon;
                const isActive = index === currentStep;
                const isCompleted = index < currentStep;
                
                return (
                  <div key={step.id} className="flex items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isCompleted 
                        ? 'bg-green-500 text-white' 
                        : isActive 
                          ? 'bg-blue-500 text-white' 
                          : 'bg-gray-200 text-gray-400'
                    }`}>
                      {isCompleted ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </div>
                    {index < steps.length - 1 && (
                      <div className={`w-12 h-px ${
                        isCompleted ? 'bg-green-500' : 'bg-gray-200'
                      } ml-2`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content */}
        <Card className="shadow-lg">
          <CardContent className="p-6">
            {/* Step 0: Introduction */}
            {currentStep === 0 && (
              <div className="text-center space-y-6">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                  <Users className="h-8 w-8 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-3">Welcome to Your Safety Induction</h2>
                  <p className="text-muted-foreground text-lg mb-6">
                    This induction is designed to ensure you understand our safety requirements
                    and can work safely on site.
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <Video className="h-6 w-6 text-blue-600 mb-2" />
                    <h3 className="font-semibold mb-1">Safety Video</h3>
                    <p className="text-sm text-muted-foreground">
                      {settings.videoDurationMinutes} minute presentation
                    </p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <FileQuestion className="h-6 w-6 text-green-600 mb-2" />
                    <h3 className="font-semibold mb-1">Safety Quiz</h3>
                    <p className="text-sm text-muted-foreground">
                      {questions.length} questions
                    </p>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <Award className="h-6 w-6 text-purple-600 mb-2" />
                    <h3 className="font-semibold mb-1">Pass Rate</h3>
                    <p className="text-sm text-muted-foreground">
                      {settings.passPercentage}% required
                    </p>
                  </div>
                </div>

                <Button onClick={goToNextStep} size="lg" className="w-full max-w-sm">
                  <Play className="h-4 w-4 mr-2" />
                  Start Induction
                </Button>
              </div>
            )}

            {/* Step 1: Video */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold mb-2">{settings.videoTitle}</h2>
                  <p className="text-muted-foreground mb-6">{settings.videoDescription}</p>
                  
                  <div className="flex items-center justify-center gap-4 mb-6">
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {settings.videoDurationMinutes} minutes
                    </Badge>
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Video className="h-3 w-3" />
                      {settings.videoFormat.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </div>
                </div>

                {settings.videoUrl ? (
                  <div className="bg-black rounded-lg overflow-hidden">
                    <iframe 
                      src={settings.videoUrl}
                      title={settings.videoTitle}
                      className="w-full h-[400px]"
                      frameBorder="0"
                      allow="autoplay; fullscreen"
                    />
                  </div>
                ) : (
                  <div className="bg-gray-100 rounded-lg h-[400px] flex items-center justify-center">
                    <div className="text-center">
                      <Video className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">No video configured</p>
                    </div>
                  </div>
                )}

                <div className="flex justify-between">
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Previous
                  </Button>
                  <Button onClick={goToNextStep}>
                    Continue to Quiz
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Quiz */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold mb-2">Safety Knowledge Quiz</h2>
                  <p className="text-muted-foreground mb-6">
                    Please answer all questions to complete your induction
                  </p>
                </div>

                {questions.length > 0 ? (
                  <div className="space-y-6">
                    {questions.map((question, index) => (
                      <Card key={question.id} className="border-l-4 border-l-blue-500">
                        <CardHeader>
                          <CardTitle className="text-lg">
                            Question {index + 1} of {questions.length}
                          </CardTitle>
                          <CardDescription>{question.questionText}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {['A', 'B', 'C', 'D'].map((option) => {
                              const optionText = question[`option${option}` as keyof InductionQuestion] as string;
                              if (!optionText) return null;
                              
                              return (
                                <div key={option} className="flex items-center space-x-3">
                                  <input
                                    type="radio"
                                    id={`${question.id}-${option}`}
                                    name={question.id}
                                    value={option}
                                    checked={answers[question.id] === option}
                                    onChange={() => handleAnswerSelect(question.id, option)}
                                    className="h-4 w-4 text-blue-600"
                                  />
                                  <label 
                                    htmlFor={`${question.id}-${option}`}
                                    className="flex-1 cursor-pointer p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                                  >
                                    <span className="font-medium mr-2">{option}.</span>
                                    {optionText}
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    ))}

                    <div className="flex justify-between">
                      <Button variant="outline" onClick={goToPreviousStep}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Video
                      </Button>
                      <Button 
                        onClick={completeQuiz}
                        disabled={Object.keys(answers).length < questions.length}
                      >
                        Complete Quiz
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileQuestion className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No quiz questions configured</p>
                    <Button onClick={goToNextStep} className="mt-4">
                      Continue to Results
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Results */}
            {currentStep === 3 && (
              <div className="space-y-6 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <Award className="h-8 w-8 text-green-600" />
                </div>
                
                <div>
                  <h2 className="text-2xl font-bold mb-2">Induction Complete!</h2>
                  {questions.length > 0 && (
                    <div className="space-y-4">
                      <div className="text-4xl font-bold text-green-600">
                        {calculateScore()}%
                      </div>
                      <p className="text-muted-foreground">
                        You answered {questions.filter(q => answers[q.id] === q.correctAnswer).length} out of {questions.length} questions correctly
                      </p>
                      
                      <div className={`p-4 rounded-lg ${
                        isPassingScore() 
                          ? 'bg-green-50 border border-green-200' 
                          : 'bg-red-50 border border-red-200'
                      }`}>
                        {isPassingScore() ? (
                          <div className="text-green-800">
                            <CheckCircle className="h-6 w-6 mx-auto mb-2" />
                            <p className="font-semibold">Congratulations! You passed the safety induction.</p>
                            <p className="text-sm mt-1">You may now proceed with site access.</p>
                          </div>
                        ) : (
                          <div className="text-red-800">
                            <AlertTriangle className="h-6 w-6 mx-auto mb-2" />
                            <p className="font-semibold">Additional training required.</p>
                            <p className="text-sm mt-1">
                              You need {settings.passPercentage}% to pass. Please review the material and retake the quiz.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <Button 
                    onClick={() => window.close()} 
                    size="lg" 
                    className="w-full max-w-sm"
                  >
                    Close Preview
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    This is a preview mode. In the actual induction, results would be saved to the system.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}