import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSettingsAutoSave } from "@/hooks/useSettingsAutoSave";
import GlassCard from "@/components/GlassCard";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { HardHat, Plus, Edit, Trash2, AlertTriangle } from "lucide-react";

export default function ContractorSettings() {
  const { currentSettings, handleInputChange } = useSettingsAutoSave();
  const { toast } = useToast();

  const [showAddOffenceDialog, setShowAddOffenceDialog] = useState(false);
  const [editingOffence, setEditingOffence] = useState<any>(null);
  const [offenceForm, setOffenceForm] = useState({ offenceName: '', offenceDescription: '', cardType: 'yellow' });

  const { data: cardOffences = [] } = useQuery<any[]>({
    queryKey: ["/api/card-offences"],
  });

  const createOffenceMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/card-offences", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/card-offences"] });
      setShowAddOffenceDialog(false);
      setOffenceForm({ offenceName: '', offenceDescription: '', cardType: 'yellow' });
      toast({ title: "Offence added" });
    },
    onError: () => toast({ title: "Failed to add offence", variant: "destructive" }),
  });

  const updateOffenceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PUT", `/api/card-offences/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/card-offences"] });
      setEditingOffence(null);
      toast({ title: "Offence updated" });
    },
    onError: () => toast({ title: "Failed to update offence", variant: "destructive" }),
  });

  const deleteOffenceMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/card-offences/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/card-offences"] });
      toast({ title: "Offence deleted" });
    },
    onError: () => toast({ title: "Failed to delete offence", variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
<div className="flex items-center justify-between mb-2">
  <div>
    <h2 className="text-xl font-bold text-fixed">Card Offences</h2>
    <p className="text-sm text-variable mt-1">Manage the list of safety violations used when issuing Red and Yellow cards to contractor workers.</p>
  </div>
  <Button onClick={() => { setOffenceForm({ offenceName: '', offenceDescription: '', cardType: 'yellow' }); setShowAddOffenceDialog(true); }}>
    <Plus size={16} className="mr-2" />
    Add Offence
  </Button>
</div>
{(['yellow', 'red'] as const).map((cardType) => {
  const offences = cardOffences.filter((o: any) => o.cardType === cardType);
  return (
    <GlassCard key={cardType}>
      <div className="flex items-center mb-4">
        {cardType === 'yellow' ? (
          <AlertTriangle className="mr-2 text-yellow-500" size={20} />
        ) : (
          <AlertTriangle className="mr-2 text-red-500" size={20} />
        )}
        <h3 className="text-lg font-semibold text-fixed capitalize">{cardType} Card Offences</h3>
        <Badge className="ml-2" variant="secondary">{offences.length}</Badge>
      </div>
      {offences.length === 0 ? (
        <p className="text-sm text-variable">No offences configured yet. Click "Add Offence" above to get started.</p>
      ) : (
        <div className="space-y-2">
          {offences.map((o: any) => (
            <div key={o.id} className="flex items-start justify-between p-3 rounded-lg bg-white/10 dark:bg-white/5 border border-white/20 dark:border-white/10">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <Switch
                  checked={!!o.isActive}
                  onCheckedChange={(checked) => updateOffenceMutation.mutate({ id: o.id, data: { isActive: checked } })}
                  className="mt-0.5 flex-shrink-0"
                />
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${!o.isActive ? 'line-through text-variable opacity-50' : 'text-fixed'}`}>{o.offenceName}</p>
                  {o.offenceDescription && <p className="text-xs text-variable mt-0.5 truncate">{o.offenceDescription}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => {
                    setEditingOffence(o);
                    setOffenceForm({ offenceName: o.offenceName, offenceDescription: o.offenceDescription || '', cardType: o.cardType });
                    setShowAddOffenceDialog(true);
                  }}
                >
                  <Edit size={13} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                  onClick={() => deleteOffenceMutation.mutate(o.id)}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
})}
{/* Contractor Compliance Alerts */}
<GlassCard>
  <div className="flex items-center gap-3 mb-6">
    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
      <Bell className="h-5 w-5 text-blue-600" />
    </div>
    <div>
      <h3 className="text-lg font-semibold text-fixed">Contractor Compliance Alerts</h3>
      <p className="text-sm text-variable">Choose which compliance events trigger an email notification to the admin address.</p>
    </div>
  </div>
  <div className="space-y-4">
    <div className="flex items-center justify-between p-4 rounded-lg bg-white/10 dark:bg-white/5 border border-white/20 dark:border-white/10">
      <div>
        <p className="text-sm font-medium text-fixed">Notify when a document is deleted</p>
        <p className="text-xs text-variable mt-0.5">Send an alert email when a contractor's compliance document is removed.</p>
      </div>
      <Switch
        checked={currentSettings?.notifyOnDocumentDeletion !== false}
        onCheckedChange={(checked) => triggerAutoSave('notifyOnDocumentDeletion', checked)}
      />
    </div>
    <div className="flex items-center justify-between p-4 rounded-lg bg-white/10 dark:bg-white/5 border border-white/20 dark:border-white/10">
      <div>
        <p className="text-sm font-medium text-fixed">Notify when a document expires</p>
        <p className="text-xs text-variable mt-0.5">Send an alert email when a contractor's compliance document transitions to expired status.</p>
      </div>
      <Switch
        checked={currentSettings?.notifyOnDocumentExpiry !== false}
        onCheckedChange={(checked) => triggerAutoSave('notifyOnDocumentExpiry', checked)}
      />
    </div>
  </div>
</GlassCard>


{/* Add / Edit Offence Dialog */}
<Dialog open={showAddOffenceDialog} onOpenChange={(open) => { setShowAddOffenceDialog(open); if (!open) setEditingOffence(null); }}>
  <DialogContent className="max-w-md">
    <DialogHeader>
      <DialogTitle>{editingOffence ? 'Edit Offence' : 'Add Offence'}</DialogTitle>
      <DialogDescription>Define a safety violation that can be used when issuing a Red or Yellow card.</DialogDescription>
    </DialogHeader>
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Card Type</Label>
        <Select value={offenceForm.cardType} onValueChange={(v) => setOffenceForm(f => ({ ...f, cardType: v }))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="yellow">Yellow Card</SelectItem>
            <SelectItem value="red">Red Card</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Offence Name</Label>
        <Input
          value={offenceForm.offenceName}
          onChange={(e) => setOffenceForm(f => ({ ...f, offenceName: e.target.value }))}
          placeholder="e.g. Not wearing hard hats"
        />
      </div>
      <div className="space-y-2">
        <Label>Description <span className="text-variable text-xs">(optional)</span></Label>
        <Textarea
          value={offenceForm.offenceDescription}
          onChange={(e) => setOffenceForm(f => ({ ...f, offenceDescription: e.target.value }))}
          placeholder="Brief explanation of the offence..."
          className="h-20"
        />
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => { setShowAddOffenceDialog(false); setEditingOffence(null); }}>Cancel</Button>
      <Button
        disabled={!offenceForm.offenceName || createOffenceMutation.isPending || updateOffenceMutation.isPending}
        onClick={() => {
          if (editingOffence) {
            updateOffenceMutation.mutate({ id: editingOffence.id, data: offenceForm });
          } else {
            createOffenceMutation.mutate({ ...offenceForm, isActive: true, siteConfigurable: true });
          }
        }}
      >
        {(createOffenceMutation.isPending || updateOffenceMutation.isPending) ? 'Saving...' : (editingOffence ? 'Save Changes' : 'Add Offence')}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

    </div>
  );
}
