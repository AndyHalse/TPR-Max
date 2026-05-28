import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CompanySettings, InsertCompanySettings } from "@shared/schema";

export type CompanySettingsWithFlags = CompanySettings & { smtpPasswordSet?: boolean; platformDisabledFeatures?: string[] };

const CREDENTIAL_FIELDS = new Set([
  'biostarPassword', 'biostarUsername', 'biostarServerUrl',
  'paxtonPassword', 'paxtonUsername', 'paxtonServerUrl',
  'cluePassword', 'clueUsername', 'clueApiKey',
  'smtpPassword', 'smtpUser',
  'loneWorkerSmsApiKey',
]);

export function useSettingsAutoSave() {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Partial<InsertCompanySettings>>({});
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<Record<string, any>>({});

  const { data: settings, isLoading } = useQuery<CompanySettingsWithFlags>({
    queryKey: ["/api/settings"],
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: Partial<InsertCompanySettings>) => {
      const response = await apiRequest("PUT", "/api/settings", updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Auto-saved", description: "Settings saved successfully", duration: 2000 });
    },
    onError: (error: any) => {
      const msg = error?.message || '';
      const isAuthError = msg.toLowerCase().includes('authentication') || msg.toLowerCase().includes('unauthorized') || msg.includes('401');
      toast({
        title: isAuthError ? "Session Expired" : "Auto-save Error",
        description: isAuthError
          ? "Your session has expired. Please refresh the page and log in again."
          : "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const triggerAutoSave = (field: string, value: any) => {
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    setFormData(prev => ({ ...prev, [field]: value }));
    if (CREDENTIAL_FIELDS.has(field) && (value === '' || value === null || value === undefined)) return;
    pendingUpdatesRef.current = { ...pendingUpdatesRef.current, [field]: value };
    const delay = typeof value === 'boolean' ? 0 : 800;
    autoSaveTimeoutRef.current = setTimeout(() => {
      const updates = { ...pendingUpdatesRef.current };
      pendingUpdatesRef.current = {};
      updateSettingsMutation.mutate(updates);
    }, delay);
  };

  const handleInputChange = (field: string, value: any) => {
    triggerAutoSave(field, value);
  };

  const currentSettings = { ...settings, ...formData };

  return {
    settings,
    isLoading,
    formData,
    setFormData,
    currentSettings,
    handleInputChange,
    triggerAutoSave,
    updateSettingsMutation,
    autoSaveTimeoutRef,
    pendingUpdatesRef,
  };
}
