import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Users, Video, FileQuestion, Settings, Save, Sparkles, Play, Eye, Monitor, Clock, Film, Presentation, ImageIcon, X } from "lucide-react";
import type { InductionSettings } from "@shared/schema";

interface RoleSettingsFormProps {
  roleType: string;
  settings: InductionSettings | null;
  onSave: (settingsId: string, data: any) => Promise<void>;
  onGenerateVideo: (roleType: string) => Promise<void>;
  onGenerateQuestions: (roleType: string) => Promise<void>;
  onPreviewInduction: (roleType: string) => void;
  isGenerating?: boolean;
  isGeneratingQuestions?: boolean;
  generatedVideo?: {
    title: string;
    duration: number;
    scenes: number;
    timestamp: string;
    url: string;
  } | null;
}

const RoleSettingsForm = ({ roleType, settings, onSave, onGenerateVideo, onGenerateQuestions, onPreviewInduction, isGenerating, isGeneratingQuestions, generatedVideo }: RoleSettingsFormProps) => {
  const [formData, setFormData] = useState({
    videoTitle: settings?.videoTitle || "",
    videoUrl: settings?.videoUrl || "",
    videoDescription: settings?.videoDescription || "",
    videoDurationMinutes: settings?.videoDurationMinutes || 15,
    videoFormat: settings?.videoFormat || "interactive_slides",
    modelType: settings?.modelType || "gpt-5",
    passPercentage: settings?.passPercentage || 80,
    isActive: settings?.isActive || true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'visitor': return 'Visitors';
      case 'staff': return 'Staff';
      case 'contractor': return 'Contractors';
      default: return role;
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'visitor': return <Users className="h-4 w-4" />;
      case 'staff': return <Users className="h-4 w-4" />;
      case 'contractor': return <Users className="h-4 w-4" />;
      default: return <Settings className="h-4 w-4" />;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings?.id) return;

    setIsLoading(true);
    try {
      await onSave(settings.id, formData);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getRoleIcon(roleType)}
          {getRoleDisplayName(roleType)} Induction Settings
        </CardTitle>
        <CardDescription>
          Configure video settings and requirements for {getRoleDisplayName(roleType).toLowerCase()} inductions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Video Configuration */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Video className="h-4 w-4" />
              <h3 className="text-lg font-medium">Video Configuration</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor={`${roleType}-title`}>Video Title</Label>
                <Input
                  id={`${roleType}-title`}
                  value={formData.videoTitle}
                  onChange={(e) => setFormData(prev => ({ ...prev, videoTitle: e.target.value }))}
                  placeholder="Enter video title"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor={`${roleType}-duration`}>Duration (minutes)</Label>
                <Input
                  id={`${roleType}-duration`}
                  type="number"
                  min="1"
                  max="120"
                  value={formData.videoDurationMinutes}
                  onChange={(e) => setFormData(prev => ({ ...prev, videoDurationMinutes: parseInt(e.target.value) }))}
                />
              </div>
            </div>

            {/* Video Format Selection */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Video Format</Label>
                <p className="text-xs text-muted-foreground mb-3">
                  Choose the type of video experience for your {getRoleDisplayName(roleType).toLowerCase()}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div 
                    className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      formData.videoFormat === 'interactive_slides' 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                    onClick={() => setFormData(prev => ({ ...prev, videoFormat: 'interactive_slides' }))}
                  >
                    <input 
                      type="radio" 
                      name="videoFormat" 
                      value="interactive_slides" 
                      checked={formData.videoFormat === 'interactive_slides'}
                      onChange={() => setFormData(prev => ({ ...prev, videoFormat: 'interactive_slides' }))}
                      className="sr-only"
                    />
                    <div className="flex items-start gap-3">
                      <Presentation className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-sm">Interactive Slides</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          Fast generation • Navigation controls • Lower cost
                        </p>
                        <div className="mt-2">
                          <Badge variant="secondary" className="text-xs">Current System</Badge>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div 
                    className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      formData.videoFormat === 'full_video' 
                        ? 'border-purple-500 bg-purple-50' 
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                    onClick={() => setFormData(prev => ({ ...prev, videoFormat: 'full_video' }))}
                  >
                    <input 
                      type="radio" 
                      name="videoFormat" 
                      value="full_video" 
                      checked={formData.videoFormat === 'full_video'}
                      onChange={() => setFormData(prev => ({ ...prev, videoFormat: 'full_video' }))}
                      className="sr-only"
                    />
                    <div className="flex items-start gap-3">
                      <Film className="h-5 w-5 text-purple-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-sm">Full Video (Sora)</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          Professional MP4 • AI narration • Higher cost
                        </p>
                        <div className="mt-2">
                          <Badge variant="outline" className="text-xs border-purple-300 text-purple-600">Premium</Badge>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div 
                    className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      formData.videoFormat === 'hybrid_enhanced' 
                        ? 'border-green-500 bg-green-50' 
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                    onClick={() => setFormData(prev => ({ ...prev, videoFormat: 'hybrid_enhanced' }))}
                  >
                    <input 
                      type="radio" 
                      name="videoFormat" 
                      value="hybrid_enhanced" 
                      checked={formData.videoFormat === 'hybrid_enhanced'}
                      onChange={() => setFormData(prev => ({ ...prev, videoFormat: 'hybrid_enhanced' }))}
                      className="sr-only"
                    />
                    <div className="flex items-start gap-3">
                      <ImageIcon className="h-5 w-5 text-green-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-sm">Hybrid Enhanced</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          AI images • Interactive slides • Moderate cost
                        </p>
                        <div className="mt-2">
                          <Badge variant="outline" className="text-xs border-green-300 text-green-600">Recommended</Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* AI Model Selection */}
              <div className="space-y-2">
                <Label htmlFor={`${roleType}-model`}>AI Model</Label>
                <Select 
                  value={formData.modelType} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, modelType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select AI model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o">GPT-4o (Fast & Efficient)</SelectItem>
                    <SelectItem value="gpt-5">GPT-5 (Latest & Most Advanced)</SelectItem>
                    <SelectItem value="google-veo-3">Google Veo 3 (Video Generation + Audio)</SelectItem>
                    <SelectItem value="gpt-6">GPT-6 (Future Ready)</SelectItem>
                    <SelectItem value="gpt-7">GPT-7 (Ultra Advanced)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  GPT-5 provides advanced text content. Google Veo 3 creates actual videos with native audio generation.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${roleType}-url`}>Video URL</Label>
              <div className="flex gap-2">
                <Input
                  id={`${roleType}-url`}
                  value={formData.videoUrl}
                  onChange={(e) => setFormData(prev => ({ ...prev, videoUrl: e.target.value }))}
                  placeholder="https://www.youtube.com/embed/..."
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onGenerateVideo(roleType)}
                  className="shrink-0 flex items-center gap-2"
                  disabled={isLoading || isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate AI Video
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onGenerateQuestions(roleType)}
                  className="shrink-0 flex items-center gap-2 text-purple-600 border-purple-300 hover:bg-purple-50"
                  disabled={isGeneratingQuestions}
                  data-testid={`generate-questions-${roleType}`}
                >
                  {isGeneratingQuestions ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileQuestion className="h-4 w-4" />
                      Generate Questions
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onPreviewInduction(roleType)}
                  className="shrink-0 flex items-center gap-2"
                  disabled={!formData.videoUrl}
                  data-testid={`preview-induction-${roleType}`}
                >
                  <Play className="h-4 w-4" />
                  Preview
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Use AI to generate a comprehensive induction video presentation for {getRoleDisplayName(roleType).toLowerCase()} or preview the complete induction experience
              </p>
            </div>

            {/* AI Generated Video Preview */}
            {generatedVideo && (
              <div className="space-y-3 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-200">
                <div className="flex items-center gap-2 text-blue-700">
                  <Eye className="h-4 w-4" />
                  <h4 className="font-medium">Generated AI Video Preview</h4>
                  <Badge variant="secondary" className="text-xs">
                    Generated {generatedVideo.timestamp}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="flex items-center gap-2 text-blue-600">
                    <Play className="h-3 w-3" />
                    <span className="font-medium">{generatedVideo.title}</span>
                  </div>
                  <div className="flex items-center gap-2 text-blue-600">
                    <Clock className="h-3 w-3" />
                    <span>{generatedVideo.duration} minute presentation</span>
                  </div>
                  <div className="flex items-center gap-2 text-blue-600">
                    <Monitor className="h-3 w-3" />
                    <span>{generatedVideo.scenes} scenes created</span>
                  </div>
                </div>
                
                {/* Embedded Video Preview */}
                <div className="bg-white rounded-lg border-2 border-blue-200 overflow-hidden">
                  <iframe 
                    src={generatedVideo.url}
                    title={`${generatedVideo.title} Preview`}
                    className="w-full h-[80vh] min-h-[700px]"
                    frameBorder="0"
                    allow="autoplay; fullscreen"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
                  />
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="text-blue-600 border-blue-300 hover:bg-blue-50"
                    onClick={() => window.open(generatedVideo.url, '_blank')}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    View Full Screen
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="text-green-600 border-green-300 hover:bg-green-50"
                    onClick={async () => {
                      const updatedFormData = { 
                        ...formData, 
                        videoUrl: generatedVideo.url,
                        videoTitle: generatedVideo.title
                      };
                      setFormData(updatedFormData);
                      
                      // Auto-save the settings so preview will show the new video immediately
                      try {
                        await onSave(settings?.id || '', updatedFormData);
                        toast({
                          title: "Video Selected",
                          description: "Video URL updated and settings saved successfully!",
                        });
                      } catch (error) {
                        console.error('Error saving settings:', error);
                        toast({
                          title: "Save Error", 
                          description: "Video URL updated but failed to save settings. Please save manually.",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <Save className="h-3 w-3 mr-1" />
                    Use This Video
                  </Button>
                </div>
                
                <p className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                  💡 <strong>Tip:</strong> Click "Use This Video" to automatically set the video URL, or "View Full Video" to preview the complete presentation.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor={`${roleType}-description`}>Video Description</Label>
              <Textarea
                id={`${roleType}-description`}
                value={formData.videoDescription}
                onChange={(e) => setFormData(prev => ({ ...prev, videoDescription: e.target.value }))}
                placeholder="Describe what this video covers..."
                rows={3}
              />
            </div>
          </div>

          {/* Quiz Configuration */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <FileQuestion className="h-4 w-4" />
              <h3 className="text-lg font-medium">Quiz Configuration</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor={`${roleType}-pass`}>Pass Percentage</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`${roleType}-pass`}
                    type="number"
                    min="50"
                    max="100"
                    value={formData.passPercentage}
                    onChange={(e) => setFormData(prev => ({ ...prev, passPercentage: parseInt(e.target.value) }))}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked as true }))}
                  />
                  <Badge variant={formData.isActive ? "default" : "secondary"}>
                    {formData.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isLoading} className="flex items-center gap-2">
              <Save className="h-4 w-4" />
              {isLoading ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default function InductionSettings() {
  const [settings, setSettings] = useState<Record<string, InductionSettings>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [questions, setQuestions] = useState<Record<string, any[]>>({});
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [generatingQuestionsFor, setGeneratingQuestionsFor] = useState<string | null>(null);
  const [generatedVideos, setGeneratedVideos] = useState<Record<string, {
    title: string;
    duration: number;
    scenes: number;
    timestamp: string;
    url: string;
  }>>({});
  const [previewRole, setPreviewRole] = useState<string | null>(null);
  const { toast } = useToast();

  const roleTypes = [
    { value: 'visitor', label: 'Visitors', description: 'Settings for site visitors' },
    { value: 'staff', label: 'Staff', description: 'Settings for permanent staff members' },
    { value: 'contractor', label: 'Contractors', description: 'Settings for contractor workers' }
  ];

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest('GET', '/api/induction/settings');
      const data = await response.json();
      const settingsData = data.settings || [];
      
      const settingsMap: Record<string, InductionSettings> = {};
      settingsData.forEach((setting: InductionSettings) => {
        settingsMap[setting.roleType] = setting;
      });
      setSettings(settingsMap);

      // Fetch questions for each role
      const questionsMap: Record<string, any[]> = {};
      for (const roleType of ['visitor', 'staff', 'contractor']) {
        try {
          const questionsResponse = await apiRequest('GET', `/api/induction/questions/${roleType}`);
          const questionsData = await questionsResponse.json();
          questionsMap[roleType] = questionsData.questions || [];
        } catch (error) {
          console.error(`Error fetching questions for ${roleType}:`, error);
          questionsMap[roleType] = [];
        }
      }
      setQuestions(questionsMap);
      
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast({
        title: "Error",
        description: "Failed to load induction settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSetting = async (settingId: string, data: any) => {
    try {
      await apiRequest('PUT', `/api/induction/settings/${settingId}`, data);

      toast({
        title: "Success",
        description: "Settings updated successfully",
      });

      // Refresh settings
      await fetchSettings();
    } catch (error) {
      console.error('Error updating settings:', error);
      toast({
        title: "Error",
        description: "Failed to update settings",
        variant: "destructive",
      });
    }
  };

  const handleGenerateVideo = async (roleType: string) => {
    setGeneratingFor(roleType);
    try {
      toast({
        title: "Generating AI Video",
        description: `Creating AI-powered induction video for ${roleType}s... This may take 30-60 seconds.`,
      });

      const response = await apiRequest('POST', `/api/induction/generate-video/${roleType}`);
      const data = await response.json();

      // Refresh settings to get the updated video URL
      await fetchSettings();

      // Store the generated video data with the actual video URL from database
      const updatedSettings = await apiRequest('GET', '/api/induction/settings');
      const settingsData = await updatedSettings.json();
      const roleSetting = settingsData.settings.find((s: any) => s.roleType === roleType);
      
      const generatedVideoData = {
        title: data.preview?.title || `${roleType.charAt(0).toUpperCase() + roleType.slice(1)} Safety Induction`,
        duration: data.preview?.duration || 15,
        scenes: data.preview?.scenes || 8,
        timestamp: new Date().toLocaleString(),
        url: roleSetting?.videoUrl || `/api/induction/video/${roleType}`
      };

      setGeneratedVideos(prev => ({
        ...prev,
        [roleType]: generatedVideoData
      }));

      toast({
        title: "AI Video Generated!",
        description: `Successfully created ${generatedVideoData.duration}-minute video with ${generatedVideoData.scenes} scenes`,
      });
    } catch (error) {
      console.error('Error generating video:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast({
        title: "Video Generation Error",
        description: `Failed to generate AI video: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setGeneratingFor(null);
    }
  };

  const handlePreviewInduction = (roleType: string) => {
    setPreviewRole(roleType);
  };

  const fetchQuestions = async (roleType: string) => {
    try {
      const response = await apiRequest('GET', `/api/induction/questions/${roleType}`);
      const data = await response.json();
      setQuestions(prev => ({ ...prev, [roleType]: data.questions || [] }));
    } catch (error) {
      console.error(`Error fetching ${roleType} questions:`, error);
    }
  };

  const handleGenerateQuestions = async (roleType: string) => {
    setGeneratingQuestionsFor(roleType);
    
    try {
      const response = await apiRequest('POST', `/api/induction/generate-questions/${roleType}`);
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "AI Questions Generated!",
          description: `Successfully generated ${data.questionsGenerated} questions for ${roleType}`,
        });
        
        // Refresh questions to show the new AI-generated ones
        await fetchQuestions(roleType);
      } else {
        throw new Error(data.error || 'Failed to generate questions');
      }
    } catch (error) {
      console.error('Error generating AI questions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast({
        title: "Question Generation Error",
        description: `Failed to generate AI questions: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setGeneratingQuestionsFor(null);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold mb-1">Induction Settings</h1>
          <p className="text-muted-foreground text-sm">
            Configure site induction videos and H&S questions for different roles
          </p>
        </div>

        {/* Role-based Settings Tabs */}
        <Tabs defaultValue="visitor" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            {roleTypes.map((role) => (
              <TabsTrigger key={role.value} value={role.value} className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                {role.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {roleTypes.map((role) => (
            <TabsContent key={role.value} value={role.value} className="space-y-4">
              <RoleSettingsForm
                roleType={role.value}
                settings={settings[role.value] || null}
                onSave={handleSaveSetting}
                onGenerateVideo={handleGenerateVideo}
                onGenerateQuestions={handleGenerateQuestions}
                onPreviewInduction={handlePreviewInduction}
                isGenerating={generatingFor === role.value}
                isGeneratingQuestions={generatingQuestionsFor === role.value}
                generatedVideo={generatedVideos[role.value] || null}
              />

              {/* Questions Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileQuestion className="h-4 w-4" />
                    H&S Questions for {role.label}
                  </CardTitle>
                  <CardDescription>
                    Questions configured for {role.label.toLowerCase()} safety assessments
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Total Questions:</span>
                      <Badge variant="outline">{questions[role.value]?.length || 0} questions</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Pass Rate Required:</span>
                      <Badge>{settings[role.value]?.passPercentage || 80}%</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Video Duration:</span>
                      <Badge variant="secondary">{settings[role.value]?.videoDurationMinutes || 15} minutes</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
        
        {/* Embedded Preview Modal */}
        <Dialog open={!!previewRole} onOpenChange={() => setPreviewRole(null)}>
          <DialogContent className="max-w-7xl w-[95vw] h-[90vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Play className="h-5 w-5" />
                {previewRole && `${previewRole.charAt(0).toUpperCase() + previewRole.slice(1)} Induction Preview`}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-hidden">
              {previewRole && (
                <iframe
                  src={`/induction-preview/${previewRole}`}
                  title={`${previewRole} Induction Preview`}
                  className="w-full h-full border-0 rounded-lg"
                  style={{ height: 'calc(90vh - 120px)' }}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}