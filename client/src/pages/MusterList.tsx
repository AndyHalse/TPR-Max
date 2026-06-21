import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import GlassCard from "@/components/GlassCard";
import { apiRequest } from "@/lib/queryClient";
import { Download, Printer, Users, UserCheck, Shield, Fingerprint, Eye, Wifi, WifiOff, Settings, Plus, Trash2, ChevronDown, ChevronUp, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatTimeLocale } from "@/utils/formatDate";

interface BiostarStaffMember {
  userId: string;
  userName: string;
  lastEvent: number;
  lastEventTime: Date;
  isOnSite: boolean;
  deviceId: string;
  department: string;
}

interface MusterEntry {
  id: string;
  name: string;
  type: "staff" | "visitor" | "contractor" | "member";
  department?: string;
  company?: string;
  employeeId?: string;
  purpose?: string;
  hostStaffId?: string;
  checkedInAt: string;
  location: string;
  isBiostarOnly?: boolean;
}

interface MusterSettings {
  statusOptionsEnabled: boolean;
  statusOptions: string[];
}

const DEFAULT_OPTIONS = ['Location unknown', 'Working remotely / offsite', 'Sent to another location'];

export default function MusterList() {
  const [activeFilter, setActiveFilter] = useState<"all" | "staff" | "visitors" | "contractors" | "members">("all");
  const [showBiostarData, setShowBiostarData] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [localEnabled, setLocalEnabled] = useState<boolean | null>(null);
  const [localOptions, setLocalOptions] = useState<string[] | null>(null);
  const [newOption, setNewOption] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation(['muster', 'common']);

  const { data: musterList, isLoading } = useQuery<MusterEntry[]>({
    queryKey: ["/api/muster"],
    staleTime: 10 * 1000,
  });

  const { data: biostarStaff, isLoading: biostarLoading } = useQuery<BiostarStaffMember[]>({
    queryKey: ["/api/biostar/staff-status"],
    enabled: showBiostarData,
    refetchInterval: 30000,
  });

  const { data: settings } = useQuery<{
    biostarEnabled?: boolean;
    biostarServerUrl?: string;
  }>({
    queryKey: ["/api/settings"],
  });

  const { data: musterSettings, isLoading: settingsLoading } = useQuery<MusterSettings>({
    queryKey: ["/api/muster/settings"],
    staleTime: 10 * 1000,
  });

  // Save muster settings
  const saveSettingsMutation = useMutation({
    mutationFn: async (payload: { statusOptionsEnabled: boolean; statusOptions: string[] }) => {
      return apiRequest("PUT", "/api/muster/settings", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/muster/settings"] });
      toast({ title: t('muster:toasts.settingsSaved'), description: t('muster:toasts.musterStatusUpdated') });
      setLocalEnabled(null);
      setLocalOptions(null);
    },
    onError: () => {
      toast({ title: t('muster:toasts.saveFailed'), description: t('muster:toasts.saveFailedDesc'), variant: "destructive" });
    },
  });

  // Derived local state (falls back to server values)
  const effectiveEnabled = localEnabled !== null ? localEnabled : (musterSettings?.statusOptionsEnabled ?? false);
  const effectiveOptions = localOptions !== null ? localOptions : (musterSettings?.statusOptions ?? DEFAULT_OPTIONS);

  const handleSave = () => {
    saveSettingsMutation.mutate({ statusOptionsEnabled: effectiveEnabled, statusOptions: effectiveOptions });
  };

  const handleAddOption = () => {
    const trimmed = newOption.trim();
    if (!trimmed || effectiveOptions.includes(trimmed)) return;
    setLocalOptions([...effectiveOptions, trimmed]);
    setNewOption("");
  };

  const handleRemoveOption = (idx: number) => {
    setLocalOptions(effectiveOptions.filter((_, i) => i !== idx));
  };

  const handleOptionChange = (idx: number, value: string) => {
    const updated = [...effectiveOptions];
    updated[idx] = value;
    setLocalOptions(updated);
  };

  const isDirty = localEnabled !== null || localOptions !== null;

  // Merge muster list with Biostar data
  const getEnhancedMusterList = () => {
    const regularMuster = musterList || [];
    
    if (!showBiostarData || !biostarStaff || !settings?.biostarEnabled) {
      return regularMuster;
    }

    const biostarOnSite = biostarStaff.filter(staff => staff.isOnSite);
    const existingStaffIds = new Set(regularMuster
      .filter(entry => entry.type === 'staff')
      .map(entry => entry.employeeId));
    
    const biostarOnlyStaff: MusterEntry[] = biostarOnSite
      .filter(staff => !existingStaffIds.has(staff.userId))
      .map(staff => ({
        id: `biostar-${staff.userId}`,
        name: staff.userName,
        type: 'staff' as const,
        department: staff.department,
        employeeId: staff.userId,
        checkedInAt: staff.lastEventTime.toISOString(),
        location: `Device ${staff.deviceId}`,
        isBiostarOnly: true
      }));

    return [...regularMuster, ...biostarOnlyStaff];
  };

  const enhancedMusterList = getEnhancedMusterList();

  const getCounts = () => {
    const staff = enhancedMusterList.filter(e => e.type === "staff").length;
    const visitors = enhancedMusterList.filter(e => e.type === "visitor").length;
    const contractors = enhancedMusterList.filter(e => e.type === "contractor").length;
    const members = enhancedMusterList.filter(e => e.type === "member").length;
    const biostarOnly = enhancedMusterList.filter(e => e.isBiostarOnly).length;
    
    return { all: enhancedMusterList.length, staff, visitors, contractors, members, biostarOnly };
  };

  const counts = getCounts();

  const filteredList = enhancedMusterList.filter(entry => {
    if (activeFilter === "all") return true;
    if (activeFilter === "staff") return entry.type === "staff";
    if (activeFilter === "visitors") return entry.type === "visitor";
    if (activeFilter === "contractors") return entry.type === "contractor";
    if (activeFilter === "members") return entry.type === "member";
    return true;
  });

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase();

  const getAvatarColor = (type: string, index: number) => {
    if (type === "staff") {
      const colors = ["bg-blue-500", "bg-purple-500", "bg-indigo-500"];
      return colors[index % colors.length];
    }
    const colors = ["bg-green-500", "bg-orange-500", "bg-teal-500"];
    return colors[index % colors.length];
  };

  const formatTime = (dateString: string) => {
    return formatTimeLocale(dateString);
  };

  if (isLoading) {
    return <div>{t('musterList.loading')}</div>;
  }

  return (
    <div className="space-y-6 p-6 rounded-xl bg-background min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-fixed">{t('musterList.title')}</h2>
          {settings?.biostarEnabled && (
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-blue-600" />
                <span className="text-sm text-variable">{t('musterList.biostarIntegration')}</span>
                {biostarLoading ? (
                  <WifiOff size={14} className="text-amber-500" />
                ) : biostarStaff ? (
                  <Wifi size={14} className="text-green-500" />
                ) : (
                  <WifiOff size={14} className="text-red-500" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={showBiostarData}
                  onCheckedChange={setShowBiostarData}
                  data-testid="switch-biostar-muster"
                />
                <Label className="text-sm text-variable">{t('musterList.includeBiometric')}</Label>
              </div>
              {counts.biostarOnly > 0 && (
                <Badge variant="secondary" className="text-xs">
                  <Fingerprint size={12} className="mr-1" />
                  {t('musterList.biometricCount', { count: counts.biostarOnly })}
                </Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className={`font-medium hover:shadow-lg transition-all duration-300 border-dashed ${showSettings ? 'border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-950' : ''}`}
            onClick={() => setShowSettings(v => !v)}
            data-testid="button-muster-settings"
          >
            <Settings className="mr-2" size={16} />
            {t('musterSettings')}
            {showSettings ? <ChevronUp size={14} className="ml-1" /> : <ChevronDown size={14} className="ml-1" />}
          </Button>
          <Button
            variant="outline"
            className="bg-gradient-to-r from-green-600 to-emerald-600 text-white font-medium hover:shadow-lg transition-all duration-300"
            data-testid="button-export-pdf"
          >
            <Download className="mr-2" size={16} />
            {t('musterList.export')} PDF
          </Button>
          <Button
            className="gradient-blue text-white font-medium hover:shadow-lg transition-all duration-300"
            data-testid="button-print-list"
          >
            <Printer className="mr-2" size={16} />
            {t('musterList.report')}
          </Button>
        </div>
      </div>

      {/* Muster Settings Panel */}
      {showSettings && (
        <GlassCard solid className="p-5 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={18} className="text-blue-600" />
            <h3 className="text-base font-semibold text-fixed">{t('muster:settingsPanel.title')}</h3>
            {musterSettings?.statusOptionsEnabled && (
              <Badge className="bg-green-100 text-green-800 text-xs">{t('common:enabled')}</Badge>
            )}
          </div>

          <p className="text-sm text-variable mb-4">
            {t('muster:settingsPanel.desc')}
          </p>

          <div className="flex items-center gap-3 mb-5 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <Switch
              checked={effectiveEnabled}
              onCheckedChange={(v) => setLocalEnabled(v)}
              data-testid="switch-status-options-enabled"
            />
            <div>
              <Label className="text-sm font-medium text-fixed">{t('muster:settingsPanel.enableDropdown')}</Label>
              <p className="text-xs text-variable mt-0.5">{t('muster:settingsPanel.dropdownDesc')}</p>
            </div>
          </div>

          <div className="mb-4">
            <Label className="text-sm font-medium text-fixed mb-2 block">{t('muster:settingsPanel.optionsLabel')}</Label>
            <p className="text-xs text-variable mb-3">{t('muster:settingsPanel.optionsDesc')}</p>

            <div className="space-y-2 mb-3">
              {effectiveOptions.map((option, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={option}
                    onChange={e => handleOptionChange(idx, e.target.value)}
                    className="flex-1 text-sm h-9"
                    data-testid={`status-option-input-${idx}`}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleRemoveOption(idx)}
                    disabled={effectiveOptions.length <= 1}
                    data-testid={`button-remove-option-${idx}`}
                    title={t('muster:settingsPanel.removeOption')}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={newOption}
                onChange={e => setNewOption(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddOption()}
                placeholder={t('muster:settingsPanel.addPlaceholder')}
                className="flex-1 text-sm h-9"
                data-testid="input-new-status-option"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 text-blue-600 border-blue-300 hover:bg-blue-50"
                onClick={handleAddOption}
                disabled={!newOption.trim()}
                data-testid="button-add-option"
              >
                <Plus size={14} className="mr-1" />
                {t('common:add')}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              {isDirty && (
                <span className="text-xs text-amber-600 font-medium">{t('muster:settingsPanel.unsaved')}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-variable"
                onClick={() => { setLocalEnabled(null); setLocalOptions(null); setNewOption(""); }}
                disabled={!isDirty || saveSettingsMutation.isPending}
              >
                {t('common:reset')}
              </Button>
              <Button
                size="sm"
                className="gradient-blue text-white font-medium"
                onClick={handleSave}
                disabled={saveSettingsMutation.isPending}
                data-testid="button-save-muster-settings"
              >
                <Save size={14} className="mr-1.5" />
                {saveSettingsMutation.isPending ? t('common:saving') : t('muster:saveSettings')}
              </Button>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Filter Tabs */}
      <GlassCard solid className="p-1 inline-flex">
        <Button
          variant="ghost"
          onClick={() => setActiveFilter("all")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            activeFilter === "all" 
              ? "bg-[var(--card)] text-blue-600 shadow-sm" 
              : "text-variable hover:text-fixed"
          }`}
          data-testid="filter-all"
        >
          {t('musterList.allZones')} ({counts.all})
        </Button>
        <Button
          variant="ghost"
          onClick={() => setActiveFilter("staff")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            activeFilter === "staff" 
              ? "bg-[var(--card)] text-blue-600 shadow-sm" 
              : "text-variable hover:text-fixed"
          }`}
          data-testid="filter-staff"
        >
          {t('stats.staff')} ({counts.staff})
        </Button>
        <Button
          variant="ghost"
          onClick={() => setActiveFilter("visitors")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            activeFilter === "visitors" 
              ? "bg-[var(--card)] text-blue-600 shadow-sm" 
              : "text-variable hover:text-fixed"
          }`}
          data-testid="filter-visitors"
        >
          {t('stats.visitors')} ({counts.visitors})
        </Button>
        {counts.contractors > 0 && (
          <Button
            variant="ghost"
            onClick={() => setActiveFilter("contractors")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              activeFilter === "contractors" 
                ? "bg-[var(--card)] text-blue-600 shadow-sm" 
                : "text-variable hover:text-fixed"
            }`}
            data-testid="filter-contractors"
          >
            {t('stats.contractors')} ({counts.contractors})
          </Button>
        )}
        {counts.members > 0 && (
          <Button
            variant="ghost"
            onClick={() => setActiveFilter("members")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              activeFilter === "members" 
                ? "bg-[var(--card)] text-blue-600 shadow-sm" 
                : "text-variable hover:text-fixed"
            }`}
            data-testid="filter-members"
          >
            {t('stats.members')} ({counts.members})
          </Button>
        )}
      </GlassCard>

      {/* Muster List Table */}
      <GlassCard solid className="overflow-hidden">
        {filteredList.length === 0 ? (
          <div className="text-center py-12">
            <Users className="mx-auto h-12 w-12 text-variable mb-4" />
            <p className="text-variable text-lg">{t('musterList.noPersonnel')}</p>
            <p className="text-variable text-sm mt-2">
              {activeFilter === "all"
                ? t('accountability.emptyDesc')
                : `${t('musterList.noPersonnel')} (${activeFilter})`
              }
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-variable uppercase tracking-wider">{t('musterList.headers.name')}</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-variable uppercase tracking-wider">{t('musterList.headers.type')}</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-variable uppercase tracking-wider">{t('musterList.headers.company')}</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-variable uppercase tracking-wider">{t('musterList.headers.checkIn')}</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-variable uppercase tracking-wider">{t('musterList.headers.host')}</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-variable uppercase tracking-wider">{t('musterList.headers.zone')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/20">
                {filteredList.map((entry, index) => (
                  <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50" data-testid={`muster-entry-${entry.id}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className={`w-8 h-8 ${getAvatarColor(entry.type, index)} rounded-full flex items-center justify-center mr-3`}>
                          <span className="text-white text-xs font-medium">{getInitials(entry.name)}</span>
                        </div>
                        <span className="text-sm font-medium text-fixed" data-testid={`muster-name-${entry.id}`}>
                          {entry.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={entry.type === "staff" ? "default" : "secondary"}
                          className={
                            entry.type === "staff" ? "bg-blue-100 text-blue-800" : 
                            entry.type === "visitor" ? "bg-green-100 text-green-800" :
                            entry.type === "contractor" ? "bg-yellow-100 text-yellow-800" :
                            "bg-purple-100 text-purple-800"
                          }
                        >
                          <UserCheck className="mr-1" size={12} />
                          {entry.type === "staff" ? t('stats.staff') : entry.type === "visitor" ? t('stats.visitors').replace(/s$/, '') : entry.type === "contractor" ? t('stats.contractors').replace(/s$/, '') : t('stats.members').replace(/s$/, '')}
                        </Badge>
                        {entry.isBiostarOnly && (
                          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                            <Fingerprint className="mr-1" size={10} />
                            {t('musterList.biometric')}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-variable">
                      {entry.type === "staff" ? entry.department : entry.company || t('common:noCompany')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-variable">
                      {formatTimeLocale(entry.checkedInAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-variable">
                      {entry.type === "staff" ? entry.employeeId : t('common:visitor')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-variable">
                      {entry.location}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
