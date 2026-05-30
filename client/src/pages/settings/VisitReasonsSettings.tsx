import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, MapPin, Shield, Check, X } from "lucide-react";

interface VisitReason {
  id: string;
  label: string;
  instructions: string;
  requireHsAcceptance: boolean;
  hsContent: string;
  isActive: boolean;
  sortOrder: number;
  appliesTo: string;
}

const EMPTY_FORM = {
  label: "",
  instructions: "",
  requireHsAcceptance: false,
  hsContent: "",
  isActive: true,
  appliesTo: "both",
};

export default function VisitReasonsSettings() {
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  const { data: reasons = [], isLoading } = useQuery<VisitReason[]>({
    queryKey: ["/api/visit-reasons/all"],
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) => apiRequest("POST", "/api/visit-reasons", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/visit-reasons/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visit-reasons"] });
      setShowAddForm(false);
      setFormData({ ...EMPTY_FORM });
      toast({ title: "Reason added", description: "Visit reason created successfully." });
    },
    onError: () => toast({ title: "Error", description: "Failed to create visit reason.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof EMPTY_FORM> }) =>
      apiRequest("PUT", `/api/visit-reasons/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/visit-reasons/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visit-reasons"] });
      setEditingId(null);
      setFormData({ ...EMPTY_FORM });
      toast({ title: "Saved", description: "Visit reason updated." });
    },
    onError: () => toast({ title: "Error", description: "Failed to update visit reason.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/visit-reasons/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/visit-reasons/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visit-reasons"] });
      toast({ title: "Deactivated", description: "Visit reason deactivated." });
    },
    onError: () => toast({ title: "Error", description: "Failed to deactivate visit reason.", variant: "destructive" }),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => apiRequest("PUT", "/api/visit-reasons/reorder", { ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/visit-reasons/all"] }),
  });

  const activeReasons = reasons.filter(r => r.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const inactiveReasons = reasons.filter(r => !r.isActive);

  const handleMove = (reason: VisitReason, direction: "up" | "down") => {
    const sorted = [...activeReasons];
    const idx = sorted.findIndex(r => r.id === reason.id);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === sorted.length - 1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]];
    reorderMutation.mutate(sorted.map(r => r.id));
  };

  const startEdit = (reason: VisitReason) => {
    setEditingId(reason.id);
    setFormData({
      label: reason.label,
      instructions: reason.instructions,
      requireHsAcceptance: reason.requireHsAcceptance,
      hsContent: reason.hsContent,
      isActive: reason.isActive,
      appliesTo: reason.appliesTo,
    });
    setShowAddForm(false);
  };

  const handleSave = () => {
    if (!formData.label.trim()) {
      toast({ title: "Label required", description: "Please enter a label for this reason.", variant: "destructive" });
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setShowAddForm(false);
    setFormData({ ...EMPTY_FORM });
  };

  const appliesToLabel = (v: string) =>
    v === "visitors" ? "Visitors only" : v === "contractors" ? "Contractors only" : "Both";

  const ReasonForm = () => (
    <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-sm font-medium">Label <span className="text-red-500">*</span></Label>
          <Input
            value={formData.label}
            onChange={e => setFormData(p => ({ ...p, label: e.target.value }))}
            placeholder="e.g. Meeting / Appointment"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-sm font-medium">Applies to</Label>
          <Select value={formData.appliesTo} onValueChange={v => setFormData(p => ({ ...p, appliesTo: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="visitors">Visitors only</SelectItem>
              <SelectItem value="contractors">Contractors only</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-sm font-medium">Instructions</Label>
        <Textarea
          value={formData.instructions}
          onChange={e => setFormData(p => ({ ...p, instructions: e.target.value }))}
          placeholder="Directions shown to the visitor after they select this reason. Leave blank for no instructions."
          rows={3}
        />
        <p className="text-xs text-slate-500">Shown on-screen at the kiosk after the visitor selects this reason.</p>
      </div>

      <div className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <Switch
          checked={formData.requireHsAcceptance}
          onCheckedChange={v => setFormData(p => ({ ...p, requireHsAcceptance: v }))}
        />
        <div>
          <p className="text-sm font-medium">Require H&amp;S acceptance</p>
          <p className="text-xs text-slate-500">Visitor must accept H&amp;S rules before completing check-in</p>
        </div>
      </div>

      {formData.requireHsAcceptance && (
        <div className="space-y-1">
          <Label className="text-sm font-medium">H&amp;S rules content</Label>
          <Textarea
            value={formData.hsContent}
            onChange={e => setFormData(p => ({ ...p, hsContent: e.target.value }))}
            placeholder="Specific H&S rules for this visit type. Leave blank to use the company-wide H&S rules."
            rows={4}
          />
          <p className="text-xs text-slate-500">If left blank, falls back to the company-wide H&amp;S rules content.</p>
        </div>
      )}

      <div className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <Switch
          checked={formData.isActive}
          onCheckedChange={v => setFormData(p => ({ ...p, isActive: v }))}
        />
        <p className="text-sm font-medium">Active</p>
      </div>

      <div className="flex gap-2 pt-1">
        <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} size="sm">
          <Check size={14} className="mr-1" />
          {editingId ? "Save Changes" : "Add Reason"}
        </Button>
        <Button onClick={handleCancel} variant="outline" size="sm">
          <X size={14} className="mr-1" />
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card variant="glass">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin size={18} className="text-blue-600" />
                Visit Reasons
              </CardTitle>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Define the reasons visitors and contractors can select when signing in, and the instructions shown to them.
              </p>
            </div>
            {!showAddForm && !editingId && (
              <Button onClick={() => { setShowAddForm(true); setFormData({ ...EMPTY_FORM }); }} size="sm">
                <Plus size={14} className="mr-1" />
                Add Reason
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showAddForm && !editingId && <ReasonForm />}

          {isLoading ? (
            <div className="text-center py-8 text-slate-500 text-sm">Loading...</div>
          ) : activeReasons.length === 0 && !showAddForm ? (
            <div className="text-center py-10 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
              <MapPin size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-slate-500 font-medium">No visit reasons configured</p>
              <p className="text-slate-400 text-sm mt-1">Add reasons so visitors can select their purpose at sign-in.</p>
              <Button onClick={() => setShowAddForm(true)} variant="outline" size="sm" className="mt-3">
                <Plus size={14} className="mr-1" /> Add first reason
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {activeReasons.map((reason, idx) => (
                <div key={reason.id}>
                  {editingId === reason.id ? (
                    <ReasonForm />
                  ) : (
                    <div className="flex items-start gap-3 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-200 transition-colors">
                      <div className="flex flex-col gap-0.5 flex-shrink-0 mt-0.5">
                        <button
                          onClick={() => handleMove(reason, "up")}
                          disabled={idx === 0}
                          className="p-0.5 rounded text-slate-400 hover:text-slate-700 disabled:opacity-20 disabled:cursor-not-allowed"
                        >
                          <ChevronUp size={15} />
                        </button>
                        <button
                          onClick={() => handleMove(reason, "down")}
                          disabled={idx === activeReasons.length - 1}
                          className="p-0.5 rounded text-slate-400 hover:text-slate-700 disabled:opacity-20 disabled:cursor-not-allowed"
                        >
                          <ChevronDown size={15} />
                        </button>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800 dark:text-slate-100">{reason.label}</span>
                          <Badge variant="outline" className="text-xs">
                            {appliesToLabel(reason.appliesTo)}
                          </Badge>
                          {reason.requireHsAcceptance && (
                            <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200">
                              <Shield size={10} className="mr-1" />
                              H&amp;S Required
                            </Badge>
                          )}
                        </div>
                        {reason.instructions && (
                          <p className="text-sm text-slate-500 mt-1 line-clamp-2">{reason.instructions}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => startEdit(reason)}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => deleteMutation.mutate(reason.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {inactiveReasons.length > 0 && (
            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Inactive</p>
              <div className="space-y-2">
                {inactiveReasons.map(reason => (
                  <div key={reason.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-700 opacity-60">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-500 line-through">{reason.label}</span>
                      <span className="ml-2 text-xs text-slate-400">{appliesToLabel(reason.appliesTo)}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => updateMutation.mutate({ id: reason.id, data: { isActive: true } })}
                    >
                      Reactivate
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
