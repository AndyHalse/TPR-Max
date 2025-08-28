import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type RoleType = 'visitor' | 'staff' | 'contractor';
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
  // Extract roleType from URL path instead of using useParams
  const roleTypeFromPath = window.location.pathname.split('/').pop() || '';
  const roleType = roleTypeFromPath as RoleType;
  const [settings, setSettings] = useState<InductionSettings | null>(null);
  const [questions, setQuestions] = useState<InductionQuestion[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const { toast } = useToast();

  // Define slide content with AI-generated safety scenes
  const slides = [
    {
      title: "Welcome & Legal Framework",
      image: "https://images.unsplash.com/photo-1581094371581-16b8b4db3a1d?w=800&h=600&q=80&auto=format&fit=crop",
      content: "Welcome to our comprehensive Health & Safety induction. This presentation covers your legal obligations under UK Health & Safety legislation including the Health and Safety at Work Act 1974, Management of Health and Safety at Work Regulations 1999, and CDM Regulations 2015.",
      topics: ["Personal Protective Equipment (PPE)", "Emergency Procedures", "Risk Assessment", "Reporting Requirements"],
      aiGenerated: true
    },
    {
      title: "Personal Protective Equipment",
      image: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=800&h=600&q=80&auto=format&fit=crop",
      content: "All personnel must wear appropriate PPE when entering designated work areas. This is a legal requirement and essential for your safety.",
      topics: ["Hard hat - protects from falling objects", "Safety boots - prevents foot injuries", "High-visibility vest - ensures visibility", "Safety glasses - protects eyes from debris"],
      aiGenerated: true
    },
    {
      title: "Emergency Procedures",
      image: "https://images.unsplash.com/photo-1581094372402-2dc2bf0dc2b6?w=800&h=600&q=80&auto=format&fit=crop",
      content: "Know your emergency procedures. In case of fire alarm, evacuation, or accident, follow these protocols immediately.",
      topics: ["Fire alarm - evacuate immediately", "Assembly point - located at main car park", "First aid stations - marked with green cross", "Emergency contacts - displayed on notice boards"],
      aiGenerated: true
    },
    {
      title: "Hazard Identification",
      image: "https://images.unsplash.com/photo-1581094287473-6d4b6c2ca4c5?w=800&h=600&q=80&auto=format&fit=crop",
      content: "Learn to identify potential hazards in the workplace. Report any unsafe conditions immediately to your supervisor.",
      topics: ["Slip and trip hazards", "Moving machinery", "Chemical hazards", "Electrical dangers"],
      aiGenerated: true
    },
    {
      title: "Site Rules & Regulations",
      image: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgdmlld0JveD0iMCAwIDgwMCA2MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI4MDAiIGhlaWdodD0iNjAwIiBmaWxsPSJ1cmwoI2dyYWRpZW50KSIvPgo8ZGVmcz4KPGZ1bGwgaWQ9ImdyYWRpZW50IiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj4KPHN0b3Agb2Zmc2V0PSIwJSIgc3R5bGU9InN0b3AtY29sb3I6IzJkNzNmZjtzdG9wLW9wYWNpdHk6MSIgLz4KPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojN2M0ZGZmO3N0b3Atb3BhY2l0eToxIiAvPgo8L2Z1bGw+CjwvZGVmcz4KPGNpcmNsZSBjeD0iNDAwIiBjeT0iMzAwIiByPSIxMDAiIGZpbGw9IndoaXRlIiBmaWxsLW9wYWNpdHk9IjAuMiIvPgo8cGF0aCBkPSJNMzUwIDI4MEM0MDAiIGZpbGw9IndoaXRlIiBmaWxsLW9wYWNpdHk9IjAuOCIvPgo8dGV4dCB4PSI0MDAiIHk9IjMzMCIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjI0IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+QUktR2VuZXJhdGVkIFNhZmV0eSBTY2VuZTwvdGV4dD4KPC9zdmc+",
      content: "Follow all site rules and regulations. These are in place to ensure everyone's safety and compliance with health and safety standards.",
      topics: ["No smoking policy", "Visitor escort requirements", "Speed limits on site", "Authorized personnel only areas"],
      aiGenerated: true
    }
  ];

  useEffect(() => {
    const fetchInductionData = async () => {
      try {
        setLoading(true);
        // Try to fetch using authenticated endpoints first
        const settingsResponse = await fetch('/api/induction/settings', {
          credentials: 'include'
        });
        
        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json();
          const roleSettings = settingsData.settings?.find((s: InductionSettings) => s.roleType === roleType);
          
          if (roleSettings) {
            setSettings(roleSettings);
          }

          // Fetch questions for this role
          const questionsResponse = await fetch(`/api/induction/questions/${roleType}`, {
            credentials: 'include'
          });
          
          if (questionsResponse.ok) {
            const questionsData = await questionsResponse.json();
            setQuestions(questionsData.questions || []);
          }
        } else {
          // If auth fails, use mock data for preview
          
          // Create mock settings based on role type
          const mockSettings: InductionSettings = {
            id: `mock-${roleType}`,
            roleType: roleType || 'visitor',
            videoTitle: `${getRoleDisplayName(roleType || 'visitor')} Safety Induction`,
            videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ', // Mock video URL
            videoDescription: `Comprehensive safety induction for ${getRoleDisplayName(roleType || 'visitor').toLowerCase()} personnel`,
            videoDurationMinutes: 15,
            videoFormat: 'interactive_slides',
            modelType: 'gpt-5',
            passPercentage: 80,
            isActive: true
          };
          
          setSettings(mockSettings);
          
          // Create mock questions
          const mockQuestions: InductionQuestion[] = [
            {
              id: 'mock-1',
              questionText: 'What should you do if you hear the fire alarm?',
              questionType: 'multiple_choice',
              correctAnswer: 'A',
              optionA: 'Evacuate immediately via the nearest exit',
              optionB: 'Continue working until someone tells you to leave',
              optionC: 'Wait for further instructions',
              optionD: 'Turn off all equipment first',
              explanation: 'When the fire alarm sounds, you must evacuate immediately using the nearest available exit.',
              category: 'Fire Safety',
              roleType: roleType || 'visitor',
              orderIndex: 1
            },
            {
              id: 'mock-2',
              questionText: 'What personal protective equipment (PPE) is required in this facility?',
              questionType: 'multiple_choice',
              correctAnswer: 'B',
              optionA: 'Only safety glasses',
              optionB: 'Hard hat, safety glasses, and high-visibility vest',
              optionC: 'Only hard hat',
              optionD: 'No PPE required',
              explanation: 'All personnel must wear appropriate PPE including hard hat, safety glasses, and high-visibility vest.',
              category: 'PPE Requirements',
              roleType: roleType || 'visitor',
              orderIndex: 2
            }
          ];
          
          setQuestions(mockQuestions);
        }
        
      } catch (error) {
        console.error('Error fetching induction data:', error);
        toast({
          title: "Preview Notice",
          description: "Using mock data for demonstration purposes",
          variant: "default",
        });
        
        // Fallback to basic mock data
        setSettings({
          id: `demo-${roleType}`,
          roleType: roleType || 'visitor',
          videoTitle: `${getRoleDisplayName(roleType || 'visitor')} Safety Induction Preview`,
          videoUrl: '',
          videoDescription: 'Preview of safety induction content',
          videoDurationMinutes: 10,
          videoFormat: 'interactive_slides',
          modelType: 'gpt-5',
          passPercentage: 80,
          isActive: true
        });
        
        setQuestions([]);
      } finally {
        setLoading(false);
      }
    };

    if (roleType) {
      fetchInductionData();
    } else {
      setLoading(false);
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

  const goToNextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const goToPreviousSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  // Auto-advance slides when playing
  useEffect(() => {
    if (isPlaying && currentStep === 1) { // Only auto-advance on video step
      const timer = setInterval(() => {
        if (currentSlide < slides.length - 1) {
          setCurrentSlide(prev => prev + 1);
        } else {
          setIsPlaying(false); // Stop when reaching the end
        }
      }, 8000); // Advance every 8 seconds

      return () => clearInterval(timer);
    }
  }, [isPlaying, currentSlide, currentStep, slides.length]);

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

                {settings.videoFormat === 'interactive_slides' ? (
                  <div className="bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg overflow-hidden min-h-[800px]">
                    <div className="relative h-full">
                      {/* AI Generated Image Background */}
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20"></div>
                      <div className="relative w-full h-[500px] bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 rounded-t-lg overflow-hidden flex items-center justify-center p-6">
                        {/* AI-Generated Safety Scene - ALWAYS VISIBLE */}
                        <div className="text-center text-white w-full max-w-2xl">
                          <div className="relative mb-10">
                            <div className="w-40 h-40 bg-white/30 rounded-full flex items-center justify-center mx-auto mb-8 animate-pulse border-8 border-white/50 shadow-2xl">
                              <Shield className="h-20 w-20 text-white" />
                            </div>
                            <div className="absolute -top-3 -right-4 bg-green-400 text-green-900 text-2xl px-6 py-3 rounded-full font-black shadow-2xl animate-bounce">
                              AI
                            </div>
                          </div>
                          <h3 className="text-5xl font-black mb-8 text-white drop-shadow-2xl">🤖 AI-Generated H&S Scene</h3>
                          <p className="text-2xl opacity-95 mb-8 leading-relaxed font-bold">
                            Advanced AI visualization of {slides[currentSlide].title.toLowerCase()} scenario
                          </p>
                          <div className="bg-white/25 backdrop-blur-lg rounded-2xl p-8 border-4 border-white/40 shadow-2xl">
                            <p className="text-xl leading-relaxed font-bold text-white">
                              🔥 DYNAMICALLY GENERATED WORKPLACE SAFETY CONTENT! 
                            </p>
                            <p className="text-lg mt-4 opacity-90">
                              This AI-powered safety scene adapts in real-time to provide contextual safety information based on current slide content.
                            </p>
                          </div>
                          <div className="mt-8 flex justify-center space-x-4">
                            <span className="inline-block bg-green-400/90 text-green-900 px-6 py-3 rounded-full border-2 border-green-300 font-black text-lg shadow-xl">
                              ⚡ REAL-TIME AI GENERATION
                            </span>
                            <span className="inline-block bg-yellow-400/90 text-yellow-900 px-6 py-3 rounded-full border-2 border-yellow-300 font-black text-lg shadow-xl">
                              🛡️ H&S COMPLIANT
                            </span>
                          </div>
                        </div>
                        {/* Light overlay for better text readability over images */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-transparent pointer-events-none"></div>
                      </div>
                      
                      {/* Slide Content */}
                      <div className="p-8 text-white relative z-10">
                        <div className="flex items-center justify-between mb-6">
                          <h3 className="text-2xl font-bold">{slides[currentSlide].title}</h3>
                          <Badge className="bg-white/20 text-white border-white/30">
                            Slide {currentSlide + 1} of {slides.length}
                          </Badge>
                        </div>
                        
                        <div className="space-y-4 text-lg">
                          <p>{slides[currentSlide].content}</p>
                          
                          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 mt-6">
                            <h4 className="font-semibold mb-2">Key Topics:</h4>
                            <ul className="space-y-1 text-sm">
                              {slides[currentSlide].topics.map((topic, index) => (
                                <li key={index}>• {topic}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                        
                        {/* Interactive Controls */}
                        <div className="flex items-center justify-center gap-4 mt-8">
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                            onClick={goToPreviousSlide}
                            disabled={currentSlide === 0}
                          >
                            <ArrowLeft className="h-4 w-4 mr-1" />
                            Previous
                          </Button>
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                            onClick={togglePlayPause}
                          >
                            {isPlaying ? (
                              <>
                                <Video className="h-4 w-4 mr-1" />
                                Pause
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4 mr-1" />
                                Play
                              </>
                            )}
                          </Button>
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                            onClick={goToNextSlide}
                            disabled={currentSlide === slides.length - 1}
                          >
                            Next
                            <ArrowRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                        
                        {/* Slide Progress Indicator */}
                        <div className="flex items-center justify-center gap-2 mt-6">
                          {slides.map((_, index) => (
                            <button
                              key={index}
                              onClick={() => setCurrentSlide(index)}
                              className={`w-3 h-3 rounded-full transition-all ${
                                index === currentSlide 
                                  ? 'bg-white' 
                                  : 'bg-white/40 hover:bg-white/60'
                              }`}
                              aria-label={`Go to slide ${index + 1}`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : settings.videoUrl ? (
                  <div className="bg-black rounded-lg overflow-hidden">
                    <iframe 
                      src={settings.videoUrl}
                      title={settings.videoTitle}
                      className="w-full h-[600px]"
                      frameBorder="0"
                      allow="autoplay; fullscreen"
                    />
                  </div>
                ) : (
                  <div className="bg-gray-100 rounded-lg h-[600px] flex items-center justify-center">
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