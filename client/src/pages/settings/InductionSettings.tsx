import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getCsrfToken } from "@/lib/queryClient";
import { useSettingsAutoSave } from "@/hooks/useSettingsAutoSave";
import GlassCard from "@/components/GlassCard";
import QRCodeImage from "@/components/QRCodeImage";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import {
  HardHat, Shield, MapPin, AlertTriangle, Layers, QrCode,
  Plus, Trash2, Edit2, Check, X, Upload, ImageIcon, Info,
  GripVertical, Download, Eye, ChevronDown, ChevronUp,
  Film, Sparkles, Loader2, CalendarClock, Bell,
} from "lucide-react";

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

export default function InductionSettings() {
  const { currentSettings, handleInputChange } = useSettingsAutoSave();
  const { toast } = useToast();

  // ── Section 3: Slide Editor + Video Upload state ──
  const [slideRoleType, setSlideRoleType] = useState<"contractor" | "visitor" | "staff">("contractor");
  const [editedScenes, setEditedScenes] = useState<InductionScene[]>([]);
  const [expandedScene, setExpandedScene] = useState<number | null>(null);
  const photoInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Video upload state (per roleType)
  const [videoSource, setVideoSource] = useState<"ai_generated" | "custom_upload">("ai_generated");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeletingVideo, setIsDeletingVideo] = useState(false);
  const [currentCustomVideoUrl, setCurrentCustomVideoUrl] = useState<string | null>(null);
  const videoFileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset video state when role type changes
  useEffect(() => {
    setVideoSource("ai_generated");
    setCurrentCustomVideoUrl(null);
    setUploadProgress(0);
    setIsUploading(false);
    // Fetch current video status for this role
    apiRequest("GET", `/api/induction/settings/${slideRoleType}`)
      .then(r => r.json())
      .then((d: any) => {
        const url = d?.setting?.customVideoUrl ?? null;
        setCurrentCustomVideoUrl(url);
        setVideoSource(url ? "custom_upload" : "ai_generated");
      })
      .catch(() => {});
  }, [slideRoleType]);

  const handleVideoFileSelect = (file: File) => {
    const allowed = ["video/mp4", "video/quicktime", "video/webm"];
    if (!allowed.includes(file.type) && !file.name.match(/\.(mp4|mov|webm)$/i)) {
      toast({ title: "Invalid file type", description: "Please select an MP4, MOV, or WebM file.", variant: "destructive" });
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum video size is 500 MB.", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    setUploadProgress(0);
    const formData = new FormData();
    formData.append("video", file);
    formData.append("roleType", slideRoleType);
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      setIsUploading(false);
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          setCurrentCustomVideoUrl(data.url);
          setVideoSource("custom_upload");
          toast({ title: "Video uploaded", description: "Your custom induction video has been saved." });
        } else {
          toast({ title: "Upload failed", description: data.error || "Please try again.", variant: "destructive" });
        }
      } catch {
        toast({ title: "Upload failed", description: "Unexpected response — please try again.", variant: "destructive" });
      }
    });
    xhr.addEventListener("error", () => {
      setIsUploading(false);
      toast({ title: "Upload failed", description: "Network error — please try again.", variant: "destructive" });
    });
    xhr.open("POST", "/api/induction/upload-video");
    xhr.withCredentials = true;
    const sessionToken = sessionStorage.getItem("session_token");
    if (sessionToken) xhr.setRequestHeader("Authorization", `Bearer ${sessionToken}`);
    xhr.send(formData);
  };

  const handleRemoveVideo = async () => {
    setIsDeletingVideo(true);
    try {
      await apiRequest("DELETE", `/api/induction/upload-video?roleType=${slideRoleType}`, undefined);
      setCurrentCustomVideoUrl(null);
      setVideoSource("ai_generated");
      toast({ title: "Video removed", description: "The custom video has been removed." });
    } catch (err: any) {
      toast({ title: "Failed to remove video", description: err?.detail || err?.message, variant: "destructive" });
    } finally {
      setIsDeletingVideo(false);
    }
  };

  const { data: slidesData, isLoading: slidesLoading, isError: slidesError, refetch: refetchSlides } = useQuery<{ scenes: InductionScene[] }>({
    queryKey: ["/api/induction/settings", slideRoleType, "scenes"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/induction/settings/${slideRoleType}/scenes`);
      return r.json();
    },
  });

  useEffect(() => {
    if (slidesData?.scenes) setEditedScenes(slidesData.scenes);
  }, [slidesData?.scenes, slideRoleType]);

  const saveScenesMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("PUT", `/api/induction/settings/${slideRoleType}/scenes`, { scenes: editedScenes });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Slides saved", description: "Slide content updated successfully." });
      refetchSlides();
    },
    onError: (err: any) => toast({ title: "Error saving slides", description: err?.detail || err?.message, variant: "destructive" }),
  });

  const uploadSlidePictureMutation = useMutation({
    mutationFn: async ({ sceneIdx, file }: { sceneIdx: number; file: File }) => {
      const fd = new FormData();
      fd.append("photo", file);
      const r = await fetch(`/api/induction/settings/${slideRoleType}/scenes/photo`, {
        method: "POST",
        body: fd,
        credentials: "include",
        headers: { 'x-csrf-token': getCsrfToken() ?? '' },
      });
      if (!r.ok) throw new Error("Upload failed");
      return r.json() as Promise<{ url: string }>;
    },
    onSuccess: (data, { sceneIdx }) => {
      setEditedScenes(prev =>
        prev.map((s, i) => (i === sceneIdx ? { ...s, imageUrl: data.url } : s))
      );
      toast({ title: "Photo uploaded", description: "Scene photo ready — save slides to apply." });
    },
    onError: (err: any) => toast({ title: "Photo upload failed", description: err?.detail || err?.message, variant: "destructive" }),
  });

  // ── Section 4: Checkpoint state ──
  const [cpForm, setCpForm] = useState({ label: "", content: "" });
  const [editingCp, setEditingCp] = useState<Checkpoint | null>(null);
  const [editCpForm, setEditCpForm] = useState({ label: "", content: "" });
  const [showQr, setShowQr] = useState<string | null>(null);

  const { data: cpData, isLoading: cpLoading, isError: cpError, refetch: refetchCp } = useQuery<{ checkpoints: Checkpoint[] }>({
    queryKey: ["/api/induction/checkpoints"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/induction/checkpoints");
      return r.json();
    },
  });

  const createCpMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/induction/checkpoints", {
        label: cpForm.label.trim(),
        content: cpForm.content.trim(),
        orderIndex: (cpData?.checkpoints?.length ?? 0),
      });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Checkpoint created" });
      setCpForm({ label: "", content: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/induction/checkpoints"] });
    },
    onError: (err: any) => toast({ title: "Error creating checkpoint", description: err?.detail || err?.message, variant: "destructive" }),
  });

  const updateCpMutation = useMutation({
    mutationFn: async () => {
      if (!editingCp) return;
      const r = await apiRequest("PUT", `/api/induction/checkpoints/${editingCp.id}`, {
        label: editCpForm.label.trim(),
        content: editCpForm.content.trim(),
      });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Checkpoint updated" });
      setEditingCp(null);
      queryClient.invalidateQueries({ queryKey: ["/api/induction/checkpoints"] });
    },
    onError: (err: any) => toast({ title: "Error updating checkpoint", description: err?.detail || err?.message, variant: "destructive" }),
  });

  const toggleCpMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const r = await apiRequest("PUT", `/api/induction/checkpoints/${id}`, { isActive });
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/induction/checkpoints"] }),
  });

  const deleteCpMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/induction/checkpoints/${id}`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Checkpoint deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/induction/checkpoints"] });
    },
    onError: (err: any) => toast({ title: "Error deleting checkpoint", description: err?.detail || err?.message, variant: "destructive" }),
  });

  const getQrUrl = (qrToken: string) => `${window.location.origin}/induction/checkpoint/${qrToken}`;

  return (
    <div className="space-y-6">
      <TooltipProvider delayDuration={200}>
        <div className="grid grid-cols-1 gap-6">

          {/* ── Section 1: H&S Rules ── */}
          <GlassCard className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-fixed flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Health &amp; Safety Rules
              </h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={currentSettings?.hsRulesEnabled !== false}
                    onCheckedChange={(checked) => handleInputChange("hsRulesEnabled", checked)}
                    data-testid="switch-hs-rules-enabled"
                  />
                  <Label className="text-sm font-medium text-fixed">Enable H&amp;S Rules</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={currentSettings?.hsRulesRequireAcceptance || false}
                    onCheckedChange={(checked) => handleInputChange("hsRulesRequireAcceptance", checked)}
                    data-testid="switch-hs-rules-require-acceptance"
                  />
                  <div className="flex items-center gap-1.5">
                    <Label className="text-sm font-medium text-fixed">Require Acceptance</Label>
                    <Tooltip>
                      <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs">When enabled, visitors must explicitly tick a checkbox to confirm they have read and accept the H&amp;S rules before their e-Pass is issued.</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {currentSettings?.hsRulesEnabled !== false && (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-fixed">H&amp;S Rules Content (Markdown supported)</Label>
                    <textarea
                      value={currentSettings?.hsRulesContent || ""}
                      onChange={(e) => handleInputChange("hsRulesContent", e.target.value)}
                      className="w-full h-72 px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed font-mono text-sm"
                      placeholder="Enter your company's health and safety rules here..."
                      data-testid="textarea-hs-rules-content"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hsRulesUrl" className="text-sm font-medium text-fixed">External H&amp;S Rules URL (Optional)</Label>
                    <Input
                      id="hsRulesUrl"
                      type="url"
                      value={currentSettings?.hsRulesUrl || ""}
                      onChange={(e) => handleInputChange("hsRulesUrl", e.target.value)}
                      className="w-full"
                      placeholder="https://yourcompany.com/health-safety-policy"
                    />
                  </div>
                </>
              )}
              {currentSettings?.hsRulesEnabled === false && (
                <div className="text-center py-6 text-variable">
                  <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">H&amp;S Rules are disabled.</p>
                </div>
              )}
            </div>
          </GlassCard>

          {/* ── Section 2: Site Details ── */}
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold text-fixed flex items-center gap-2 mb-1">
              <MapPin className="w-5 h-5" />
              Site Details for Induction
            </h3>
            <p className="text-sm text-variable mb-5">
              These details are automatically injected into the AI induction prompt so generated content is site-specific. Changes apply to the next induction generated.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-fixed">Industry / Sector</Label>
                <Input
                  value={(currentSettings as any)?.inductionIndustry || ""}
                  onChange={(e) => handleInputChange("inductionIndustry", e.target.value)}
                  placeholder="e.g. Construction, Engineering, Manufacturing"
                />
                <p className="text-xs text-variable">Tailors the AI content to your sector's specific risks.</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-fixed">Site Address</Label>
                <Input
                  value={currentSettings?.siteAddress || ""}
                  onChange={(e) => handleInputChange("siteAddress", e.target.value)}
                  placeholder="e.g. Unit 4, Industrial Park, Birmingham, B1 1AA"
                />
                <p className="text-xs text-variable">Shown to inductees during the induction.</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-fixed">Site-Specific Hazards</Label>
                <Textarea
                  value={currentSettings?.inductionHazards || ""}
                  onChange={(e) => handleInputChange("inductionHazards", e.target.value)}
                  rows={3}
                  placeholder="e.g. Heavy plant movement, deep excavations, overhead power lines, asbestos risk in older buildings"
                />
                <p className="text-xs text-variable">List hazards unique to your site.</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-fixed">PPE Requirements</Label>
                <Textarea
                  value={currentSettings?.inductionPpe || ""}
                  onChange={(e) => handleInputChange("inductionPpe", e.target.value)}
                  rows={3}
                  placeholder="e.g. Hard hat, hi-vis vest, steel-toecap boots, gloves at all times on site"
                />
                <p className="text-xs text-variable">Specify mandatory PPE for your site.</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-fixed">Emergency Assembly Point</Label>
                <Input
                  value={currentSettings?.assemblyPoint || ""}
                  onChange={(e) => handleInputChange("assemblyPoint", e.target.value)}
                  placeholder="e.g. Car park next to the main gate, Muster Point A"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-fixed">First Aid Location &amp; Contact</Label>
                <Input
                  value={currentSettings?.firstAidLocation || ""}
                  onChange={(e) => handleInputChange("firstAidLocation", e.target.value)}
                  placeholder="e.g. Site office, first aid kit on south wall — call John Smith on 07700 900123"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-fixed">Emergency Contact</Label>
                <Input
                  value={currentSettings?.emergencyContact || ""}
                  onChange={(e) => handleInputChange("emergencyContact", e.target.value)}
                  placeholder="e.g. Site Manager — Sarah Jones 07700 900456"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-sm font-medium text-fixed">Additional Site Rules</Label>
                <Textarea
                  value={currentSettings?.inductionSiteRules || ""}
                  onChange={(e) => handleInputChange("inductionSiteRules", e.target.value)}
                  rows={3}
                  placeholder="e.g. No phones on the factory floor, 10 mph speed limit, permit to work required for hot works, no smoking on site"
                />
                <p className="text-xs text-variable">Any rules specific to your site beyond standard H&amp;S.</p>
              </div>
            </div>

            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-xs text-blue-700 dark:text-blue-400 flex items-start gap-1.5">
                <Info size={13} className="mt-0.5 shrink-0" />
                These fields are auto-saved as you type. After updating, regenerate the induction from the Induction Management page to include the new site details.
              </p>
            </div>
          </GlassCard>

          {/* ── Section 3: Slide Editor ── */}
          <GlassCard className="p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold text-fixed flex items-center gap-2">
                <Layers className="w-5 h-5" />
                Slide Editor
              </h3>
              <div className="flex items-center gap-3">
                <Select
                  value={slideRoleType}
                  onValueChange={(v) => {
                    setSlideRoleType(v as any);
                    setExpandedScene(null);
                  }}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contractor">Contractor</SelectItem>
                    <SelectItem value="visitor">Visitor</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => saveScenesMutation.mutate()}
                  disabled={saveScenesMutation.isPending || editedScenes.length === 0}
                  size="sm"
                >
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                  {saveScenesMutation.isPending ? "Saving…" : "Save Slides"}
                </Button>
              </div>
            </div>
            <p className="text-sm text-variable mb-4">
              Upload your own MP4 video or edit the AI-generated slides. Use the role selector above to switch between Contractor, Visitor, and Staff inductions.
            </p>

            {/* ── Video Source picker ── */}
            <div className="mb-5 space-y-3">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-purple-600" />
                <p className="text-sm font-medium text-fixed">Induction Video Source</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVideoSource("ai_generated")}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-sm transition-all ${
                    videoSource === "ai_generated"
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium"
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 text-variable hover:border-blue-300"
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  AI-Generated Slides
                </button>
                <button
                  type="button"
                  onClick={() => setVideoSource("custom_upload")}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-sm transition-all ${
                    videoSource === "custom_upload"
                      ? "border-purple-500 bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-medium"
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 text-variable hover:border-purple-300"
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  Upload MP4 Video
                </button>
              </div>

              {videoSource === "custom_upload" && (
                <div className="space-y-3">
                  {currentCustomVideoUrl && (
                    <div className="p-3 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Film className="w-4 h-4 text-purple-600 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-purple-900 dark:text-purple-100">Custom video uploaded</p>
                            <p className="text-xs text-purple-600 dark:text-purple-400 truncate">{currentCustomVideoUrl.split("/").pop()}</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleRemoveVideo}
                          disabled={isDeletingVideo}
                          className="shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          {isDeletingVideo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          <span className="ml-1 text-xs">Remove</span>
                        </Button>
                      </div>
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        Uploading a new video will replace the existing one
                      </p>
                    </div>
                  )}

                  <div
                    className="relative border-2 border-dashed border-purple-300 dark:border-purple-700 rounded-lg p-6 text-center cursor-pointer hover:border-purple-500 transition-colors"
                    onClick={() => videoFileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files[0];
                      if (file) handleVideoFileSelect(file);
                    }}
                  >
                    {isUploading ? (
                      <div className="space-y-2">
                        <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto" />
                        <p className="text-sm text-purple-700 dark:text-purple-300 font-medium">Uploading… {uploadProgress}%</p>
                        <div className="w-full bg-purple-100 dark:bg-purple-900 rounded-full h-2">
                          <div className="bg-purple-600 h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                        </div>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                        <p className="text-sm font-medium text-fixed">
                          {currentCustomVideoUrl ? "Upload replacement video" : "Drop video here or click to browse"}
                        </p>
                        <p className="text-xs text-variable mt-1">MP4, MOV, or WebM — max 500 MB</p>
                      </>
                    )}
                  </div>
                  <input
                    ref={videoFileInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleVideoFileSelect(file);
                      e.target.value = "";
                    }}
                  />
                </div>
              )}

              {videoSource === "ai_generated" && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-xs text-blue-700 dark:text-blue-400 flex items-start gap-1.5">
                    <Info size={13} className="mt-0.5 shrink-0" />
                    The AI-generated slide content below will be shown to inductees. Edit the slides and upload site photos to make them specific to your site.
                  </p>
                </div>
              )}
            </div>

            <Separator className="mb-4" />

            {slidesLoading && (
              <div className="text-center py-8 text-variable text-sm">Loading slides…</div>
            )}
            {slidesError && (
              <div className="mb-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Could not load slides. <button className="underline ml-1" onClick={() => refetchSlides()}>Try again</button>
              </div>
            )}
            {!slidesLoading && !slidesError && editedScenes.length === 0 && (
              <div className="text-center py-10 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                <Layers className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm text-variable">No slides found for this role type.</p>
                <p className="text-xs text-variable mt-1">Generate an induction from the Induction Management page first.</p>
              </div>
            )}

            {editedScenes.length > 0 && (
              <div className="space-y-2">
                {editedScenes.map((scene, idx) => (
                  <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                      onClick={() => setExpandedScene(expandedScene === idx ? null : idx)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-medium text-fixed text-sm">{scene.title || `Slide ${idx + 1}`}</span>
                        {scene.imageUrl && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <ImageIcon className="w-3 h-3" /> Photo
                          </Badge>
                        )}
                      </div>
                      {expandedScene === idx ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {expandedScene === idx && (
                      <div className="px-4 pb-4 pt-2 space-y-3 border-t border-gray-100 dark:border-gray-700/50">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-variable">Slide Title</Label>
                          <Input
                            value={scene.title}
                            onChange={(e) =>
                              setEditedScenes(prev => prev.map((s, i) => i === idx ? { ...s, title: e.target.value } : s))
                            }
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-variable">Content</Label>
                          <Textarea
                            value={scene.content}
                            onChange={(e) =>
                              setEditedScenes(prev => prev.map((s, i) => i === idx ? { ...s, content: e.target.value } : s))
                            }
                            rows={4}
                            className="text-sm"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-variable">Site Photo (optional)</Label>
                          <div className="flex items-center gap-3">
                            {scene.imageUrl ? (
                              <div className="flex items-center gap-2">
                                <img
                                  src={`/objects${scene.imageUrl}`}
                                  alt="Slide photo"
                                  className="w-20 h-14 object-cover rounded-lg border"
                                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-600 border-red-200"
                                  onClick={() =>
                                    setEditedScenes(prev => prev.map((s, i) => i === idx ? { ...s, imageUrl: undefined } : s))
                                  }
                                >
                                  <X className="w-3.5 h-3.5 mr-1" />Remove
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={uploadSlidePictureMutation.isPending}
                                onClick={() => photoInputRefs.current[idx]?.click()}
                              >
                                <Upload className="w-3.5 h-3.5 mr-1.5" />
                                {uploadSlidePictureMutation.isPending ? "Uploading…" : "Upload Photo"}
                              </Button>
                            )}
                            <input
                              ref={(el) => { photoInputRefs.current[idx] = el; }}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) uploadSlidePictureMutation.mutate({ sceneIdx: idx, file });
                                e.target.value = "";
                              }}
                            />
                          </div>
                          <p className="text-xs text-variable">Real photos replace AI-generated images on the induction slides.</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          {/* ── Section 4: Walk-around Checkpoints ── */}
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold text-fixed flex items-center gap-2 mb-1">
              <QrCode className="w-5 h-5" />
              Walk-around Checkpoints
            </h3>
            <p className="text-sm text-variable mb-5">
              Create physical QR-code stations around your site. Contractors scan each one to confirm they've visited key safety points during their site induction walk-around.
            </p>

            {/* Create form */}
            <div className="border border-dashed border-blue-300 dark:border-blue-700 rounded-xl p-4 mb-4 space-y-3">
              <p className="text-sm font-medium text-fixed">Add New Checkpoint</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-variable">Checkpoint Label *</Label>
                  <Input
                    value={cpForm.label}
                    onChange={(e) => setCpForm(f => ({ ...f, label: e.target.value }))}
                    placeholder="e.g. Assembly Point A, Fire Exit East, Welfare Block"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-variable">Information Shown on Scan</Label>
                  <Input
                    value={cpForm.content}
                    onChange={(e) => setCpForm(f => ({ ...f, content: e.target.value }))}
                    placeholder="e.g. This is the primary assembly point in case of fire evacuation."
                    className="text-sm"
                  />
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => createCpMutation.mutate()}
                disabled={!cpForm.label.trim() || createCpMutation.isPending}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                {createCpMutation.isPending ? "Creating…" : "Create Checkpoint"}
              </Button>
            </div>

            {/* Checkpoint list */}
            {cpLoading && (
              <div className="text-center py-6 text-variable text-sm">Loading checkpoints…</div>
            )}
            {cpError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Could not load checkpoints. <button className="underline ml-1" onClick={() => refetchCp()}>Try again</button>
              </div>
            )}
            {!cpLoading && !cpError && !cpData?.checkpoints?.length && (
              <div className="text-center py-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                <QrCode className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm text-variable">No checkpoints yet. Create your first one above.</p>
              </div>
            )}

            {cpData?.checkpoints && cpData.checkpoints.length > 0 && (
              <div className="space-y-3">
                {cpData.checkpoints.map((cp, idx) => (
                  <div
                    key={cp.id}
                    className={`border rounded-xl p-4 ${cp.isActive ? "border-green-200 dark:border-green-800/50 bg-green-50/40 dark:bg-green-950/20" : "border-gray-200 dark:border-gray-700 opacity-60"}`}
                  >
                    {editingCp?.id === cp.id ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Input
                            value={editCpForm.label}
                            onChange={(e) => setEditCpForm(f => ({ ...f, label: e.target.value }))}
                            placeholder="Label"
                            className="text-sm"
                          />
                          <Input
                            value={editCpForm.content}
                            onChange={(e) => setEditCpForm(f => ({ ...f, content: e.target.value }))}
                            placeholder="Information text"
                            className="text-sm"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => updateCpMutation.mutate()} disabled={updateCpMutation.isPending}>
                            <Check className="w-3.5 h-3.5 mr-1" />Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingCp(null)}>
                            <X className="w-3.5 h-3.5 mr-1" />Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <p className="font-semibold text-fixed text-sm">{cp.label}</p>
                            <Badge variant={cp.isActive ? "default" : "secondary"} className="text-xs">
                              {cp.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          {cp.content && (
                            <p className="text-xs text-variable ml-8">{cp.content}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 px-2"
                            onClick={() => setShowQr(showQr === cp.id ? null : cp.id)}
                          >
                            <QrCode className="w-3 h-3 mr-1" />
                            QR
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              setEditingCp(cp);
                              setEditCpForm({ label: cp.label, content: cp.content });
                            }}
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0"
                            onClick={() => toggleCpMutation.mutate({ id: cp.id, isActive: !cp.isActive })}
                          >
                            {cp.isActive ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0 text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => {
                              if (confirm(`Delete checkpoint "${cp.label}"?`))
                                deleteCpMutation.mutate(cp.id);
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* QR code panel */}
                    {showQr === cp.id && (
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                          <div className="bg-white p-2 rounded-lg border shadow-sm">
                            <QRCodeImage
                              data={getQrUrl(cp.qrToken)}
                              size={160}
                              alt={`QR code for ${cp.label}`}
                            />
                          </div>
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-fixed">Print and place at: <strong>{cp.label}</strong></p>
                            <p className="text-xs text-variable break-all bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded font-mono">
                              {getQrUrl(cp.qrToken)}
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const a = document.createElement("a");
                                a.href = getQrUrl(cp.qrToken);
                                a.target = "_blank";
                                a.rel = "noopener noreferrer";
                                a.click();
                              }}
                            >
                              <Eye className="w-3.5 h-3.5 mr-1.5" />
                              Open Scan Page
                            </Button>
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
                Print each checkpoint's QR code and affix it at the corresponding location on site. Contractors scan each one during their walk-around, and their progress is recorded against their induction token.
              </p>
            </div>
          </GlassCard>

          {/* ── Induction Validity & Reminders ── */}
          <GlassCard className="p-6">
            <div className="flex items-center gap-2 mb-1">
              <CalendarClock className="w-5 h-5 text-blue-500" />
              <h3 className="text-base font-semibold text-fixed">Induction Validity Period</h3>
            </div>
            <p className="text-sm text-variable mb-5">
              Set how long a completed contractor site induction remains valid. Workers whose induction is approaching expiry will appear in Compliance Gaps and receive an automated email reminder.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Validity period selector */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-fixed flex items-center gap-1.5">
                  <CalendarClock size={14} />
                  Valid For
                </Label>
                <Select
                  value={(currentSettings as any)?.inductionValidityPeriod ?? "none"}
                  onValueChange={(val) => handleInputChange("inductionValidityPeriod", val)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select validity period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No expiry (induction never expires)</SelectItem>
                    <SelectItem value="6_months">6 months</SelectItem>
                    <SelectItem value="1_year">1 year</SelectItem>
                    <SelectItem value="2_years">2 years</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-variable">
                  Applies to new inductions going forward. Existing workers will have their expiry date set when they complete the induction.
                </p>
              </div>

              {/* Reminder days selector */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-fixed flex items-center gap-1.5">
                  <Bell size={14} />
                  Send Reminder
                </Label>
                <Select
                  value={(currentSettings as any)?.inductionExpiryReminderDays ?? "30"}
                  onValueChange={(val) => handleInputChange("inductionExpiryReminderDays", val)}
                  disabled={(currentSettings as any)?.inductionValidityPeriod === "none"}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Reminder days before expiry" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days before expiry</SelectItem>
                    <SelectItem value="14">14 days before expiry</SelectItem>
                    <SelectItem value="30">30 days before expiry</SelectItem>
                    <SelectItem value="60">60 days before expiry</SelectItem>
                    <SelectItem value="90">90 days before expiry</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-variable">
                  A compliance alert email is sent to the site admin this many days before each worker's induction expires.
                </p>
              </div>
            </div>

            {(currentSettings as any)?.inductionValidityPeriod && (currentSettings as any)?.inductionValidityPeriod !== "none" && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-700 dark:text-blue-400 flex items-start gap-1.5">
                  <Info size={13} className="mt-0.5 shrink-0" />
                  Inductions will expire{" "}
                  {(currentSettings as any)?.inductionValidityPeriod === "6_months" ? "6 months" :
                   (currentSettings as any)?.inductionValidityPeriod === "1_year" ? "1 year" : "2 years"}{" "}
                  after completion. Workers with expired inductions appear as critical issues in the Compliance Dashboard.
                  Reminders are sent {(currentSettings as any)?.inductionExpiryReminderDays ?? "30"} days before expiry.
                </p>
              </div>
            )}
          </GlassCard>

        </div>
      </TooltipProvider>
    </div>
  );
}
