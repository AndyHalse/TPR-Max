import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Users, Video, FileQuestion, Play, Eye, Sparkles } from "lucide-react";
import type { InductionSettings } from "@shared/schema";

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
  } | null;
}

const RoleSettingsForm = ({ roleType, settings, onGenerateVideo, onPreviewInduction, isGenerating, generatedVideo }: RoleSettingsFormProps) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const { toast } = useToast();

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
    if (settings?.videoUrl) {
      setPreviewUrl(settings.videoUrl);
      setPreviewOpen(true);
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
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-sm text-gray-600">No video generated yet. Click "Generate Video" to create a professional induction presentation.</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleGenerateVideo}
            disabled={isGenerating}
            className="flex-1 flex items-center gap-2"
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
          
          <Button
            onClick={handlePreview}
            variant="outline"
            disabled={!settings?.videoUrl}
            className="flex items-center gap-2"
          >
            <Play className="h-4 w-4" />
            Preview
          </Button>
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
                <p className="text-xs text-gray-600">Slides</p>
                <p className="font-medium">{generatedVideo.scenes}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Duration</p>
                <p className="font-medium">~{generatedVideo.duration} min</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Generated</p>
                <p className="font-medium text-xs">{generatedVideo.timestamp}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>Induction Video Preview - {getRoleDisplayName(roleType)}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <iframe
              src={previewUrl}
              className="w-full h-full border-0"
              title={`${getRoleDisplayName(roleType)} Induction Video`}
            />
          </div>
        </DialogContent>
      </Dialog>
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
            url: data.videoUrl
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
          title: "✅ Video Generated",
          description: `Induction video created for ${roleType}s`
        });
      }
    } catch (error: any) {
      console.error('Error generating video:', error);
      toast({
        title: "❌ Generation Failed",
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
        <h1 className="text-3xl font-bold">Health & Safety Induction</h1>
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
