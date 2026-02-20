import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Users, Video, FileQuestion, Play, Eye, Sparkles, CheckCircle, XCircle, Maximize2, List } from "lucide-react";
import type { InductionSettings, InductionQuestion } from "@shared/schema";

interface RoleSettingsFormProps {
  roleType: string;
  settings: InductionSettings | null;
  onGenerateVideo: (roleType: string) => Promise<void>;
  onPreviewInduction: (roleType: string) => void;
  isGenerating?: boolean;
  generatedVideo?: {
    title: string;
    duration: number;
    scenes: number;
    timestamp: string;
    url: string;
    htmlContent?: string;
  } | null;
  questions?: InductionQuestion[];
}

const RoleSettingsForm = ({ roleType, settings, onGenerateVideo, onPreviewInduction, isGenerating, generatedVideo, questions }: RoleSettingsFormProps) => {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPreview, setShowPreview] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);

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
      case 'visitor': return 'Brief overview for temporary visitors and contractors';
      case 'staff': return 'Comprehensive induction for permanent and temporary staff members';
      case 'contractor': return 'Safety-focused induction for contractors and sub-contractors';
      default: return '';
    }
  };

  const handleGenerateVideo = async () => {
    try {
      await onGenerateVideo(roleType);
      toast({
        title: "✅ Success",
        description: `Induction video generated for ${getRoleDisplayName(roleType).toLowerCase()}`
      });
    } catch (error) {
      toast({
        title: "❌ Error",
        description: "Failed to generate video. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handlePreview = async () => {
    if (settings?.videoUrl || generatedVideo?.url) {
      setLocation(`/induction-preview/${roleType}`);
    } else {
      toast({
        title: "No video available",
        description: "Please generate a video first.",
        variant: "destructive"
      });
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          {getRoleDisplayName(roleType)} Induction
        </CardTitle>
        <CardDescription>
          {getRoleDescription(roleType)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-blue-600" />
            <h3 className="font-medium">Video Status</h3>
          </div>
          {settings?.videoUrl ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-900">✓ Video Generated</p>
                  <p className="text-xs text-green-700 mt-1">Click Preview to view the complete induction</p>
                </div>
                <Badge className="bg-green-600">Ready</Badge>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-[var(--background)] border border-gray-200 rounded-lg">
              <p className="text-sm text-variable">No video generated yet. Click "Generate Video" to create a professional induction presentation.</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleGenerateVideo}
            disabled={isGenerating}
            className="flex-1 flex items-center gap-2"
            data-testid={`button-generate-video-${roleType}`}
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Video
              </>
            )}
          </Button>
          
          {/* Inline Preview Button */}
          {generatedVideo?.htmlContent && (
            <Dialog open={showPreview} onOpenChange={setShowPreview}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="flex items-center gap-2"
                  data-testid={`button-preview-inline-${roleType}`}
                >
                  <Eye className="h-4 w-4" />
                  Preview
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-full p-0">
                <DialogHeader className="p-4 pb-0">
                  <DialogTitle className="flex items-center justify-between">
                    <span>{getRoleDisplayName(roleType)} Induction Video Preview</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newWindow = window.open('', '_blank');
                        if (newWindow) {
                          newWindow.document.write(generatedVideo.htmlContent || '');
                          newWindow.document.close();
                        }
                      }}
                    >
                      <Maximize2 className="h-4 w-4 mr-1" />
                      Full Screen
                    </Button>
                  </DialogTitle>
                </DialogHeader>
                <div className="flex-1 h-[80vh] p-4 pt-0">
                  <iframe
                    srcDoc={generatedVideo.htmlContent}
                    className="w-full h-full border-0 rounded-lg"
                    title={`${roleType} Induction Preview`}
                    sandbox="allow-scripts allow-same-origin"
                  />
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Full screen Preview for saved videos */}
          {!generatedVideo?.htmlContent && settings?.videoUrl && (
            <Button
              onClick={handlePreview}
              variant="outline"
              className="flex items-center gap-2"
              data-testid={`button-preview-fullscreen-${roleType}`}
            >
              <Play className="h-4 w-4" />
              Preview
            </Button>
          )}

          {/* Questions Button */}
          {questions && questions.length > 0 && (
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
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FileQuestion className="h-5 w-5" />
                    {getRoleDisplayName(roleType)} Quiz Questions
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  {questions.map((q, index) => (
                    <div key={q.id} className="p-4 bg-[var(--background)] rounded-lg border">
                      <div className="flex items-start gap-3">
                        <Badge variant="outline" className="shrink-0">Q{index + 1}</Badge>
                        <div className="space-y-2 flex-1">
                          <p className="font-medium">{q.questionText}</p>
                          <div className="grid gap-1 text-sm">
                            {['A', 'B', 'C', 'D'].map((opt) => {
                              const optKey = `option${opt}` as keyof typeof q;
                              const optionText = q[optKey];
                              if (!optionText) return null;
                              const isCorrect = q.correctAnswer === opt;
                              return (
                                <div 
                                  key={opt} 
                                  className={`p-2 rounded ${isCorrect ? 'bg-green-100 border border-green-300' : 'bg-white border'}`}
                                >
                                  <span className="font-medium mr-2">{opt}.</span>
                                  {String(optionText)}
                                  {isCorrect && <CheckCircle className="inline h-4 w-4 ml-2 text-green-600" />}
                                </div>
                              );
                            })}
                          </div>
                          {q.explanation && (
                            <p className="text-xs text-variable mt-2 italic">
                              Explanation: {q.explanation}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Info Section */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
          <p className="font-medium mb-2">ℹ️ What's Included:</p>
          <ul className="space-y-1 text-xs">
            <li>✓ Professional slides with graphics</li>
            <li>✓ UK Health & Safety compliance content</li>
            <li>✓ Interactive navigation</li>
            <li>✓ Knowledge assessment quiz</li>
            <li>✓ Estimated duration: 10-15 minutes</li>
          </ul>
        </div>

        {/* Generated Video Info */}
        {generatedVideo && (
          <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="h-4 w-4 text-blue-700" />
              <h4 className="font-medium text-blue-900">Latest Generated Video</h4>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-variable">Slides</p>
                <p className="font-medium">{generatedVideo.scenes}</p>
              </div>
              <div>
                <p className="text-xs text-variable">Duration</p>
                <p className="font-medium">~{generatedVideo.duration} min</p>
              </div>
              <div>
                <p className="text-xs text-variable">Generated</p>
                <p className="font-medium text-xs">{generatedVideo.timestamp}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      {/* Full Screen Preview - opens in new window */}
    </Card>
  );
};

export default function InductionSettings() {
  const [activeRole, setActiveRole] = useState<'visitor' | 'staff' | 'contractor'>('visitor');
  const [isGenerating, setIsGenerating] = useState<Record<string, boolean>>({});
  const [settings, setSettings] = useState<Record<string, InductionSettings | null>>({
    visitor: null,
    staff: null,
    contractor: null
  });
  const [generatedVideos, setGeneratedVideos] = useState<Record<string, any>>({});
  const { toast } = useToast();

  // Fetch questions for each role type
  const { data: visitorQuestions = [] } = useQuery<InductionQuestion[]>({
    queryKey: ['/api/induction/questions', 'visitor'],
    queryFn: async () => {
      const res = await fetch('/api/induction/questions?roleType=visitor', { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return data.questions || [];
    }
  });

  const { data: staffQuestions = [] } = useQuery<InductionQuestion[]>({
    queryKey: ['/api/induction/questions', 'staff'],
    queryFn: async () => {
      const res = await fetch('/api/induction/questions?roleType=staff', { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return data.questions || [];
    }
  });

  const { data: contractorQuestions = [] } = useQuery<InductionQuestion[]>({
    queryKey: ['/api/induction/questions', 'contractor'],
    queryFn: async () => {
      const res = await fetch('/api/induction/questions?roleType=contractor', { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return data.questions || [];
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

  const handleGenerateVideo = async (roleType: string) => {
    setIsGenerating(prev => ({ ...prev, [roleType]: true }));
    try {
      const response = await apiRequest('POST', `/api/induction/generate-video/${roleType}`, {});
      const data = await response.json();

      if (data.success) {
        setGeneratedVideos(prev => ({
          ...prev,
          [roleType]: {
            title: `${roleType} Induction Video`,
            duration: data.totalDuration || 15,
            scenes: data.sceneCount || 12,
            timestamp: new Date().toLocaleDateString(),
            url: data.videoUrl,
            htmlContent: data.htmlContent // Store the HTML content for inline preview
          }
        }));

        // Update settings
        setSettings(prev => ({
          ...prev,
          [roleType]: {
            ...prev[roleType],
            videoUrl: data.videoUrl,
            videoTitle: `${roleType} Induction Video`,
            isActive: true
          } as InductionSettings
        }));

        toast({
          title: data.savedToDatabase ? "Video Generated" : "Video Generated (Preview Only)",
          description: data.message || `Induction video created for ${roleType}s`
        });
      }
    } catch (error: any) {
      console.error('Error generating video:', error);
      toast({
        title: "Generation Failed",
        description: error?.message || "Could not generate video. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(prev => ({ ...prev, [roleType]: false }));
    }
  };

  const handlePreviewInduction = (roleType: string) => {
    if (settings[roleType]?.videoUrl) {
      window.open(`/api/induction/video/${roleType}`, '_blank');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-xl sm:text-3xl font-bold">Health & Safety Induction</h1>
        <p className="text-muted-foreground">
          Create professional UK HSE-compliant induction videos for your team
        </p>
      </div>

      {/* Tabs for Different Roles */}
      <Tabs value={activeRole} onValueChange={(v) => setActiveRole(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="visitor" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Visitors</span>
          </TabsTrigger>
          <TabsTrigger value="staff" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Staff</span>
          </TabsTrigger>
          <TabsTrigger value="contractor" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Contractors</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visitor" className="space-y-4 mt-6">
          <RoleSettingsForm
            roleType="visitor"
            settings={settings.visitor}
            onGenerateVideo={handleGenerateVideo}
            onPreviewInduction={handlePreviewInduction}
            isGenerating={isGenerating.visitor}
            generatedVideo={generatedVideos.visitor}
            questions={getQuestions('visitor')}
          />
        </TabsContent>

        <TabsContent value="staff" className="space-y-4 mt-6">
          <RoleSettingsForm
            roleType="staff"
            settings={settings.staff}
            onGenerateVideo={handleGenerateVideo}
            onPreviewInduction={handlePreviewInduction}
            isGenerating={isGenerating.staff}
            generatedVideo={generatedVideos.staff}
            questions={getQuestions('staff')}
          />
        </TabsContent>

        <TabsContent value="contractor" className="space-y-4 mt-6">
          <RoleSettingsForm
            roleType="contractor"
            settings={settings.contractor}
            onGenerateVideo={handleGenerateVideo}
            onPreviewInduction={handlePreviewInduction}
            isGenerating={isGenerating.contractor}
            generatedVideo={generatedVideos.contractor}
            questions={getQuestions('contractor')}
          />
        </TabsContent>
      </Tabs>

      {/* Help Section */}
      <Card className="bg-amber-50 border-amber-200">
        <CardHeader>
          <CardTitle className="text-base">📚 About Induction Videos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>Our induction videos are designed to meet UK Health & Safety Executive (HSE) compliance requirements and include:</p>
          <ul className="space-y-2 ml-4 list-disc text-xs">
            <li>Welcome and site orientation</li>
            <li>Legal framework and responsibilities</li>
            <li>Personal protective equipment (PPE)</li>
            <li>Hazard identification and control</li>
            <li>Emergency procedures and evacuation</li>
            <li>Incident reporting requirements</li>
            <li>Role-specific requirements (for Staff and Contractors)</li>
          </ul>
          <p className="mt-4">After completing the video, users will be required to pass a knowledge assessment quiz to confirm understanding.</p>
        </CardContent>
      </Card>
    </div>
  );
}
