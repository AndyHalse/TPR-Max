import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSettingsAutoSave } from "@/hooks/useSettingsAutoSave";
import GlassCard from "@/components/GlassCard";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/contexts/ThemeContext";
import { Palette, Monitor, Sun, Moon, Upload, RotateCcw, SunMoon, Info, Wand2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

const PRESET_THEMES = [
  { name: 'TPR Blue',    emoji: '🔵', backgroundColor: '#d5f3fe', foregroundColor: '#1a2e4a', variableTextColor: '#1e4f8c', accentColor: '#2460a9' },
  { name: 'Clean White', emoji: '⬜', backgroundColor: '#ffffff', foregroundColor: '#111827', variableTextColor: '#374151', accentColor: '#3b82f6' },
  { name: 'Navy',        emoji: '🌊', backgroundColor: '#e8f0fe', foregroundColor: '#1e3a5f', variableTextColor: '#1e40af', accentColor: '#1d4ed8' },
  { name: 'Slate',       emoji: '🩶', backgroundColor: '#f1f5f9', foregroundColor: '#1e293b', variableTextColor: '#475569', accentColor: '#6366f1' },
  { name: 'Forest',      emoji: '🌿', backgroundColor: '#f0fdf4', foregroundColor: '#14532d', variableTextColor: '#166534', accentColor: '#16a34a' },
  { name: 'Warm Sand',   emoji: '🏖️', backgroundColor: '#fdf8f0', foregroundColor: '#1c1917', variableTextColor: '#57534e', accentColor: '#d97706' },
  { name: 'Midnight',    emoji: '🌙', backgroundColor: '#0f172a', foregroundColor: '#f1f5f9', variableTextColor: '#94a3b8', accentColor: '#7c3aed' },
  { name: 'Rose',        emoji: '🌸', backgroundColor: '#fff1f2', foregroundColor: '#881337', variableTextColor: '#9f1239', accentColor: '#e11d48' },
];

export default function BrandingSettings() {
  const { settings, currentSettings, handleInputChange, updateSettingsMutation, formData, setFormData, autoSaveTimeoutRef, pendingUpdatesRef } = useSettingsAutoSave();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [brandingSubTab, setBrandingSubTab] = useState("visual");
  const [suggestedTextColors, setSuggestedTextColors] = useState<{light: string, dark: string}>({ light: '#000000', dark: '#ffffff' });
  const [showResetBrandingDialog, setShowResetBrandingDialog] = useState(false);

  const resetBrandingMutation = useMutation({
    mutationFn: async () => {
      const defaultBranding = {
        backgroundColor: "#d5f3fe", foregroundColor: "#000000", accentColor: "#2460a9",
        variableTextColor: "#53b0ea", theme: "light",
        logoUrl: "/uploads/d6fe1a5b-aa78-4c1f-84b7-74037a02e0f6",
        bannerUrl: "/uploads/b8067efb-c677-4203-a5c9-7c34bdd5ffa0",
      };
      const response = await apiRequest("PUT", "/api/settings", defaultBranding);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      setFormData({});
      toast({ title: "Branding Reset", description: "All colors, logo, and banner have been reset to the default values." });
    },
    onError: (error: any) => {
      toast({ title: "Reset Failed", description: error.message || "Failed to reset branding.", variant: "destructive" });
    },
  });

  const calculateContrastRatio = (color1: string, color2: string) => {
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
    };
    const getLuminance = (r: number, g: number, b: number) => {
      const [rs, gs, bs] = [r, g, b].map(c => { c = c / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };
    const rgb1 = hexToRgb(color1); const rgb2 = hexToRgb(color2);
    if (!rgb1 || !rgb2) return 1;
    const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b); const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
    const brightest = Math.max(lum1, lum2); const darkest = Math.min(lum1, lum2);
    return (brightest + 0.05) / (darkest + 0.05);
  };

  const suggestTextColors = (backgroundColor: string) => {
    const whiteContrast = calculateContrastRatio(backgroundColor, '#ffffff');
    const blackContrast = calculateContrastRatio(backgroundColor, '#000000');
    return { light: whiteContrast > blackContrast ? '#ffffff' : '#f8fafc', dark: blackContrast > whiteContrast ? '#000000' : '#1e293b' };
  };

  const autoFixTextColor = (bgColor: string): string => {
    const candidates = ['#000000', '#111827', '#1e293b', '#1a2e4a', '#ffffff', '#f8fafc', '#f1f5f9'];
    let best = candidates[0]; let bestRatio = 0;
    for (const c of candidates) { const ratio = calculateContrastRatio(bgColor, c); if (ratio > bestRatio) { bestRatio = ratio; best = c; } }
    return best;
  };

  const getContrastRating = (ratio: number) => {
    if (ratio >= 7)   return { label: 'AAA', cls: 'bg-emerald-600 text-white', tip: 'Excellent — meets WCAG AAA' };
    if (ratio >= 4.5) return { label: 'AA',  cls: 'bg-green-500 text-white',   tip: 'Good — meets WCAG AA' };
    if (ratio >= 3)   return { label: 'AA+', cls: 'bg-amber-500 text-white',   tip: 'OK for large text only' };
    return               { label: 'Fail', cls: 'bg-red-500 text-white',        tip: 'Low contrast — text will be difficult to read.' };
  };

  const handleInputChangeWithSuggestion = (field: string, value: any) => {
    if (field === 'backgroundColor') {
      const suggestions = suggestTextColors(value);
      setSuggestedTextColors(suggestions);
    }
    handleInputChange(field, value);
  };

  const applyPresetTheme = (preset: typeof PRESET_THEMES[number]) => {
    const hex = preset.backgroundColor;
    const pr = parseInt(hex.slice(1, 3), 16); const pg = parseInt(hex.slice(3, 5), 16); const pb = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * pr + 0.587 * pg + 0.114 * pb) / 255;
    setTheme(luminance < 0.5 ? 'dark' : 'light');
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    const colorUpdates = { backgroundColor: preset.backgroundColor, foregroundColor: preset.foregroundColor, variableTextColor: preset.variableTextColor, accentColor: preset.accentColor };
    setFormData((prev: any) => ({ ...prev, ...colorUpdates }));
    pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...colorUpdates };
    setSuggestedTextColors(suggestTextColors(preset.backgroundColor));
    autoSaveTimeoutRef.current = setTimeout(() => {
      const updates = { ...pendingUpdatesRef.current };
      pendingUpdatesRef.current = {};
      updateSettingsMutation.mutate(updates);
    }, 800);
  };

  const handleLogoUpload = (objectPath: string) => {
    try {
      const logoUrl = objectPath.replace('/objects', '');
      handleInputChange("logoUrl", logoUrl);
      toast({ title: "Success", description: "Logo uploaded successfully!" });
    } catch {
      toast({ title: "Error", description: "Failed to save logo", variant: "destructive" });
    }
  };

  const handleBannerUpload = async (objectPath: string) => {
    try {
      const bannerUrl = objectPath.replace('/objects', '');
      const updateData = { ...formData, bannerUrl };
      await updateSettingsMutation.mutateAsync(updateData);
      setFormData({});
      toast({ title: "Success", description: "Banner uploaded and saved successfully!" });
    } catch {
      toast({ title: "Error", description: "Failed to save banner", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
<Tabs value={brandingSubTab} onValueChange={setBrandingSubTab} className="w-full">
  <TabsList className="grid w-full grid-cols-2 mb-6">
    <TabsTrigger value="visual" className="flex items-center gap-2">
      <Palette size={16} />
      Visual Branding
    </TabsTrigger>
    <TabsTrigger value="theme" className="flex items-center gap-2">
      <Monitor size={16} />
      Theme Settings
    </TabsTrigger>
  </TabsList>
  <TabsContent value="visual" className="space-y-6">
    <div className="flex justify-end mb-2">
      <Button
        variant="outline"
        size="sm"
        className="gap-2 text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-950"
        onClick={() => setShowResetBrandingDialog(true)}
        disabled={resetBrandingMutation.isPending}
        data-testid="button-reset-branding"
      >
        <RotateCcw size={14} />
        Reset Branding to Defaults
      </Button>
    </div>
    <Dialog open={showResetBrandingDialog} onOpenChange={setShowResetBrandingDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset Branding to Defaults?</DialogTitle>
          <DialogDescription>
            This will reset all color settings, logo, and banner back to the default development values (light blue background, black text, blue accent, plus the original logo and banner images).
          </DialogDescription>
        </DialogHeader>
        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 space-y-2 text-sm">
          <p><span className="font-medium">Background:</span> <span className="font-mono">#d5f3fe</span> <span className="inline-block w-4 h-4 rounded align-middle ml-1" style={{backgroundColor: '#d5f3fe', border: '1px solid #ccc'}}></span></p>
          <p><span className="font-medium">Text Color:</span> <span className="font-mono">#000000</span> <span className="inline-block w-4 h-4 rounded align-middle ml-1" style={{backgroundColor: '#000000'}}></span></p>
          <p><span className="font-medium">Accent:</span> <span className="font-mono">#2460a9</span> <span className="inline-block w-4 h-4 rounded align-middle ml-1" style={{backgroundColor: '#2460a9'}}></span></p>
          <p><span className="font-medium">Variable Text:</span> <span className="font-mono">#53b0ea</span> <span className="inline-block w-4 h-4 rounded align-middle ml-1" style={{backgroundColor: '#53b0ea'}}></span></p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowResetBrandingDialog(false)}>Cancel</Button>
          <Button
            onClick={() => {
              resetBrandingMutation.mutate();
              setShowResetBrandingDialog(false);
            }}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            Reset Colors
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <GlassCard>
        <div className="flex items-center mb-5">
          <Palette className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Color Theme</h3>
        </div>
        {/* Preset Themes */}
        <div className="mb-6">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Quick Presets — balanced colour combinations</p>
          <div className="grid grid-cols-4 gap-2">
            {PRESET_THEMES.map((preset) => {
              const isActive =
                currentSettings?.backgroundColor === preset.backgroundColor &&
                currentSettings?.foregroundColor === preset.foregroundColor &&
                currentSettings?.variableTextColor === preset.variableTextColor &&
                currentSettings?.accentColor === preset.accentColor;
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => applyPresetTheme(preset)}
                  title={preset.name}
                  className={`relative rounded-xl overflow-hidden border-2 transition-all hover:scale-105 focus:outline-none ${isActive ? 'border-blue-500 ring-2 ring-blue-300' : 'border-transparent hover:border-slate-300'}`}
                  data-testid={`button-preset-${preset.name.toLowerCase().replace(/\s/g, '-')}`}
                >
                  <div className="h-10" style={{ backgroundColor: preset.backgroundColor }}>
                    <div className="flex items-center justify-between px-2 pt-1.5">
                      <span className="text-[10px] font-bold truncate" style={{ color: preset.foregroundColor }}>Aa</span>
                      <span className="text-[10px] font-medium" style={{ color: preset.variableTextColor }}>Bb</span>
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: preset.accentColor }} />
                    </div>
                  </div>
                  <div className="py-1 px-1 bg-white/80 dark:bg-slate-800/80 text-center">
                    <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300 leading-none">{preset.name}</span>
                  </div>
                  {isActive && (
                    <div className="absolute top-1 right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-[9px] font-bold">✓</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-5">
          {/* Background Color */}
          <div className="space-y-2">
            <Label htmlFor="backgroundColor" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Background Color
            </Label>
            <div className="flex gap-3 items-center">
              <Input
                id="backgroundColor"
                type="color"
                value={currentSettings?.backgroundColor || "#f8fafc"}
                onChange={(e) => handleInputChange("backgroundColor", e.target.value)}
                className="w-16 h-12 p-1 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 cursor-pointer"
                data-testid="input-background-color"
              />
              <Input
                type="text"
                value={currentSettings?.backgroundColor || "#f8fafc"}
                onChange={(e) => handleInputChange("backgroundColor", e.target.value)}
                className="flex-1 px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 font-mono"
                placeholder=""
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">The main page background colour used throughout the app</p>
          </div>
          {/* Fixed Text Color */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="foregroundColor" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Fixed Text Color
                </Label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Page headings, labels, sidebar titles — high-visibility text</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs gap-1 shrink-0"
                onClick={() => handleInputChange("foregroundColor", autoFixTextColor(currentSettings?.backgroundColor || "#f8fafc"))}
                title="Automatically pick the best contrasting colour"
                data-testid="button-autofix-fixed-text"
              >
                <Wand2 size={11} />
                Auto-fix
              </Button>
            </div>
            <div className="flex gap-3 items-center">
              <Input
                id="foregroundColor"
                type="color"
                value={currentSettings?.foregroundColor || "#1e293b"}
                onChange={(e) => handleInputChange("foregroundColor", e.target.value)}
                className="w-16 h-12 p-1 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 cursor-pointer"
                data-testid="input-foreground-color"
              />
              <Input
                type="text"
                value={currentSettings?.foregroundColor || "#1e293b"}
                onChange={(e) => handleInputChange("foregroundColor", e.target.value)}
                className="flex-1 px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 font-mono"
                placeholder=""
              />
            </div>
            {currentSettings?.backgroundColor && (() => {
              const ratio = calculateContrastRatio(currentSettings.backgroundColor, currentSettings?.foregroundColor || "#1e293b");
              const rating = getContrastRating(ratio);
              return (
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${rating.cls}`}>{rating.label}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{ratio.toFixed(1)}:1 — {rating.tip}</span>
                </div>
              );
            })()}
          </div>
          {/* Variable Text Color */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="variableTextColor" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Variable Text Color
                </Label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Data values, sub-headings, secondary content — supporting text</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs gap-1 shrink-0"
                onClick={() => handleInputChange("variableTextColor", autoFixTextColor(currentSettings?.backgroundColor || "#f8fafc"))}
                title="Automatically pick the best contrasting colour"
                data-testid="button-autofix-variable-text"
              >
                <Wand2 size={11} />
                Auto-fix
              </Button>
            </div>
            <div className="flex gap-3 items-center">
              <Input
                id="variableTextColor"
                type="color"
                value={currentSettings?.variableTextColor || "#374151"}
                onChange={(e) => handleInputChange("variableTextColor", e.target.value)}
                className="w-16 h-12 p-1 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 cursor-pointer"
                data-testid="input-variable-text-color"
              />
              <Input
                type="text"
                value={currentSettings?.variableTextColor || "#374151"}
                onChange={(e) => handleInputChange("variableTextColor", e.target.value)}
                className="flex-1 px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 font-mono"
                placeholder=""
              />
            </div>
            {currentSettings?.backgroundColor && (() => {
              const ratio = calculateContrastRatio(currentSettings.backgroundColor, currentSettings?.variableTextColor || "#374151");
              const rating = getContrastRating(ratio);
              return (
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${rating.cls}`}>{rating.label}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{ratio.toFixed(1)}:1 — {rating.tip}</span>
                </div>
              );
            })()}
          </div>
          {/* Accent Color */}
          <div className="space-y-2">
            <Label htmlFor="accentColor" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Accent Color
            </Label>
            <div className="flex gap-3 items-center">
              <Input
                id="accentColor"
                type="color"
                value={currentSettings?.accentColor || "#3b82f6"}
                onChange={(e) => handleInputChange("accentColor", e.target.value)}
                className="w-16 h-12 p-1 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 cursor-pointer"
                data-testid="input-accent-color"
              />
              <Input
                type="text"
                value={currentSettings?.accentColor || "#3b82f6"}
                onChange={(e) => handleInputChange("accentColor", e.target.value)}
                className="flex-1 px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 font-mono"
                placeholder=""
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Buttons, links, highlights, and interactive elements</p>
          </div>
          {/* Live Preview */}
          <div className="pt-4 border-t border-white/20 dark:border-slate-700/30">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Live Preview</p>
            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="px-5 py-4 space-y-2" style={{ backgroundColor: currentSettings?.backgroundColor || '#f8fafc' }}>
                <p className="text-base font-bold" style={{ color: currentSettings?.foregroundColor || '#1e293b' }}>Page Heading — Fixed Text</p>
                <p className="text-sm" style={{ color: currentSettings?.foregroundColor || '#1e293b' }}>Staff Management · Visitor Records · Contractor Log</p>
                <p className="text-sm mt-1" style={{ color: currentSettings?.variableTextColor || '#374151' }}>Variable text: visitor name, data values, secondary content, descriptions and labels that change per record.</p>
                <div className="flex gap-2 mt-3">
                  <span className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: currentSettings?.accentColor || '#3b82f6' }}>Accent Button</span>
                  <span className="px-3 py-1.5 rounded-lg text-xs border" style={{ color: currentSettings?.accentColor || '#3b82f6', borderColor: currentSettings?.accentColor || '#3b82f6' }}>Outline Button</span>
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-2 pt-4 border-t border-white/20 dark:border-slate-700/30">
            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Nav Bar Colour
            </Label>
            <p className="text-xs text-slate-500 dark:text-slate-400">Set a custom background colour for the top navigation bar. Leave blank to use the default glass effect.</p>
            <div className="flex gap-3 items-center">
              <Input
                type="color"
                value={currentSettings?.navBannerColor || "#ffffff"}
                onChange={(e) => handleInputChange("navBannerColor", e.target.value)}
                className="w-20 h-12 p-1 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
              />
              <Input
                type="text"
                value={currentSettings?.navBannerColor || ""}
                onChange={(e) => handleInputChange("navBannerColor", e.target.value)}
                className="flex-1 px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 font-mono"
                placeholder="e.g. #1e3a5f  (leave blank for default)"
              />
              {currentSettings?.navBannerColor && (
                <button
                  type="button"
                  onClick={() => handleInputChange("navBannerColor", "")}
                  className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700 border border-slate-300 rounded-lg"
                  title="Clear custom colour"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Switch
                id="navBannerInvert"
                checked={!!currentSettings?.navBannerInvert}
                onCheckedChange={(checked) => handleInputChange("navBannerInvert", checked)}
              />
              <div>
                <Label htmlFor="navBannerInvert" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  Invert Icons &amp; Text
                </Label>
                <p className="text-xs text-slate-500 dark:text-slate-400">Turn on to make nav icons and text white — ideal for dark banner colours.</p>
              </div>
            </div>
            {currentSettings?.navBannerColor && (
              <div className="mt-3 rounded-xl overflow-hidden border border-white/30 dark:border-slate-700/30">
                <div
                  className="px-4 py-3 flex items-center gap-3 text-sm font-medium"
                  style={{
                    backgroundColor: currentSettings.navBannerColor,
                    color: currentSettings.navBannerInvert ? '#ffffff' : undefined,
                  }}
                >
                  <span className="opacity-60 text-xs">Preview:</span>
                  <span>Your Company</span>
                  <span className="opacity-60 ml-auto text-xs">Nav icons will appear here</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </GlassCard>
      
      <GlassCard>
        <div className="flex items-center mb-6">
          <Monitor className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
          <h3 className="text-lg font-semibold text-fixed">Kiosk Banner</h3>
        </div>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-fixed">
              Welcome Banner Image
            </Label>
            <p className="text-xs text-variable mb-3">Displayed prominently on kiosk mode. Recommended: 1200x300px or similar wide format</p>
            
            {currentSettings?.bannerUrl && !currentSettings.bannerUrl.includes('test') && (
              <div className="mb-4 p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl border border-white/30 dark:border-slate-700/30">
                <img 
                  src={`/objects${currentSettings.bannerUrl}`}
                  alt="Kiosk Banner" 
                  className="w-full max-w-lg h-auto object-contain rounded-lg"
                  onError={(e) => {
                    console.error("Banner failed to load:", currentSettings.bannerUrl);
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            )}
            
            <ObjectUploader
              onUploadComplete={handleBannerUpload}
              accept="image/*"
              maxSize={5 * 1024 * 1024}
              buttonClassName="w-full"
            >
              <Upload className="mr-2" size={16} />
              {currentSettings?.bannerUrl ? "Replace Banner" : "Upload Banner"}
            </ObjectUploader>
            
            <p className="text-xs text-variable">Recommended: JPG or PNG, max 5MB, wide format (3:1 or 4:1 ratio)</p>

            <div className="space-y-2 mt-6 pt-6 border-t border-white/20">
              <Label className="text-sm font-medium text-fixed">Kiosk Notice Message</Label>
              <p className="text-xs text-variable mb-3">
                Displayed on the kiosk home screen as a notice for all visitors. Leave blank to hide the notice panel entirely.
              </p>
              <Textarea
                value={formData?.kioskNoticeMessage ?? ""}
                onChange={(e) => handleInputChange("kioskNoticeMessage", e.target.value)}
                placeholder="e.g. All visitors must sign in before entering the building..."
                className="min-h-[100px] text-sm resize-y"
                maxLength={300}
                data-testid="input-kiosk-notice-message"
              />
              <p className="text-xs text-variable text-right">
                {(formData?.kioskNoticeMessage ?? "").length}/300 characters
              </p>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  </TabsContent>
  <TabsContent value="theme" className="space-y-6">
    <GlassCard>
      <div className="flex items-center mb-6">
        <Monitor className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
        <h3 className="text-lg font-semibold text-fixed">Application Theme</h3>
      </div>
      
      <div className="space-y-6">
        <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl border border-white/30 dark:border-slate-700/30">
          <div className="flex items-center space-x-4">
            <Sun className="text-yellow-500" size={24} />
            <div>
              <h4 className="font-medium text-slate-800 dark:text-slate-200">Light Mode</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400">Clean, bright interface</p>
            </div>
          </div>
          <Button
            variant={theme === "light" ? "default" : "outline"}
            onClick={() => setTheme("light")}
            data-testid="button-light-theme"
          >
            {theme === "light" && "✓"} Select
          </Button>
        </div>
        
        <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl border border-white/30 dark:border-slate-700/30">
          <div className="flex items-center space-x-4">
            <Moon className="text-slate-700 dark:text-slate-300" size={24} />
            <div>
              <h4 className="font-medium text-slate-800 dark:text-slate-200">Dark Mode</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400">Easy on the eyes for long sessions</p>
            </div>
          </div>
          <Button
            variant={theme === "dark" ? "default" : "outline"}
            onClick={() => setTheme("dark")}
            data-testid="button-dark-theme"
          >
            {theme === "dark" && "✓"} Select
          </Button>
        </div>
        
        <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl border border-white/30 dark:border-slate-700/30">
          <div className="flex items-center space-x-4">
            <SunMoon className="text-indigo-600" size={24} />
            <div>
              <h4 className="font-medium text-slate-800 dark:text-slate-200">High Contrast (Tablet)</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400">Maximum readability for tablets and bright environments</p>
            </div>
          </div>
          <Button
            variant={theme === "high-contrast" ? "default" : "outline"}
            onClick={() => setTheme("high-contrast")}
            data-testid="button-high-contrast-theme"
          >
            {theme === "high-contrast" && "✓"} Select
          </Button>
        </div>
        <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl border border-white/30 dark:border-slate-700/30">
          <div className="flex items-center space-x-4">
            <Monitor className="text-blue-600 dark:text-blue-400" size={24} />
            <div>
              <h4 className="font-medium text-slate-800 dark:text-slate-200">System Default</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400">Matches your device settings</p>
            </div>
          </div>
          <Button
            variant={theme === "system" ? "default" : "outline"}
            onClick={() => setTheme("system")}
            data-testid="button-system-theme"
          >
            {theme === "system" && "✓"} Select
          </Button>
        </div>
      </div>
    </GlassCard>
  </TabsContent>
</Tabs>
    </div>
  );
}
