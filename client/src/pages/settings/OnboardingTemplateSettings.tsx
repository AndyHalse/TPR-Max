import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft, Plus, Trash2, Loader2, Save, ArrowUp, ArrowDown, Copy } from "lucide-react";

const BUILTIN_ID = "builtin-default";

export default function OnboardingTemplateSettings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string>(BUILTIN_ID);
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: sets = [] } = useQuery<any[]>({
    queryKey: ["/api/onboarding/templates"],
    queryFn: () => fetch("/api/onboarding/templates", { credentials: "include" }).then(r => r.json()),
  });

  const { data: template, isLoading } = useQuery<any>({
    queryKey: ["/api/onboarding/templates", selectedId],
    queryFn: () => fetch(`/api/onboarding/templates/${selectedId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedId,
  });

  useEffect(() => {
    if (template && !dirty) {
      setItems((template.items || []).map((i: any) => ({ ...i })));
      setName(template.name || "");
      setIsDefault(!!template.is_default);
    }
  }, [template, dirty]);

  useEffect(() => { setDirty(false); }, [selectedId]);

  const isBuiltin = selectedId === BUILTIN_ID || template?.is_builtin;
  const canDelete = !isBuiltin;

  const save = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/onboarding/templates/${selectedId}`, { name, items, is_default: isDefault || selectedId === BUILTIN_ID }),
    onSuccess: async (res: any) => {
      const data = await res.json().catch(() => ({}));
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["/api/onboarding/templates"] });
      if (data?.materialized && data?.id) {
        setSelectedId(data.id);
        toast({ title: "Default template saved", description: "Built-in default has been copied into your customer settings and is now editable." });
      } else {
        toast({ title: "Template saved" });
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed to save", variant: "destructive" }),
  });

  const create = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/onboarding/templates", body),
    onSuccess: async (res: any) => {
      const data = await res.json();
      qc.invalidateQueries({ queryKey: ["/api/onboarding/templates"] });
      setNewDialogOpen(false);
      setNewName("");
      if (data?.id) setSelectedId(data.id);
      toast({ title: "Template created" });
    },
  });

  const remove = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/onboarding/templates/${selectedId}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding/templates"] });
      setSelectedId(BUILTIN_ID);
      toast({ title: "Template deleted" });
    },
  });

  const update = (idx: number, patch: any) => {
    setItems(s => { const c = [...s]; c[idx] = { ...c[idx], ...patch }; return c; });
    setDirty(true);
  };
  const removeItem = (idx: number) => { setItems(s => s.filter((_, i) => i !== idx)); setDirty(true); };
  const move = (idx: number, dir: -1 | 1) => {
    setItems(s => {
      const c = [...s]; const j = idx + dir;
      if (j < 0 || j >= c.length) return c;
      [c[idx], c[j]] = [c[j], c[idx]];
      return c;
    });
    setDirty(true);
  };
  const addItem = () => {
    setItems(s => [...s, { item_key: `tpl_${Date.now()}`, label: "", due_day_offset: 0, is_required: true }]);
    setDirty(true);
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/hr/onboarding">
            <Button variant="ghost" size="sm" className="mb-2"><ArrowLeft className="h-4 w-4 mr-1" /> Back to Onboarding</Button>
          </Link>
          <h1 className="text-2xl font-bold">Onboarding Templates</h1>
          <p className="text-gray-500 text-sm">Create and customise the checklists used when starting onboarding.</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="text-xs text-gray-500">Editing template</label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {sets.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} {s.is_default && "(default)"}{s.is_builtin && " (built-in)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => setNewDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New template
          </Button>
          {canDelete && (
            <Button variant="outline" className="text-red-600" onClick={() => {
              if (confirm("Delete this template? Existing checklists are not affected.")) remove.mutate();
            }} disabled={remove.isPending}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <Card>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex-1 min-w-[240px]">
                <Input value={name} onChange={e => { setName(e.target.value); setDirty(true); }}
                  placeholder="Template name" className="font-semibold" />
                {isBuiltin ? (
                  <p className="text-xs text-blue-700 mt-2 flex items-center gap-1">
                    <Copy className="h-3 w-3" /> Editing the built-in default — saving creates an editable copy saved as your default.
                  </p>
                ) : (
                  <label className="text-xs flex items-center gap-1 mt-2 text-gray-600">
                    <input type="checkbox" checked={isDefault}
                      onChange={e => { setIsDefault(e.target.checked); setDirty(true); }} />
                    Use as default when starting onboarding
                  </label>
                )}
              </div>
              <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
                {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Save
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              "Due day" is how many days after the start date the item is due. Negative = before start. Required items must be completed to finish onboarding.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-2">
              <div className="col-span-1"></div>
              <div className="col-span-6">Item</div>
              <div className="col-span-2 text-center">Due day</div>
              <div className="col-span-2 text-center">Required</div>
              <div className="col-span-1"></div>
            </div>
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center p-2 border rounded bg-gray-50">
                <div className="col-span-1 flex flex-col items-center text-gray-400">
                  <button className="hover:text-blue-600 disabled:opacity-30" onClick={() => move(idx, -1)} disabled={idx === 0}><ArrowUp className="h-3 w-3" /></button>
                  <button className="hover:text-blue-600 disabled:opacity-30" onClick={() => move(idx, 1)} disabled={idx === items.length - 1}><ArrowDown className="h-3 w-3" /></button>
                </div>
                <Input
                  className="col-span-6 h-8 text-sm" value={it.label}
                  onChange={e => update(idx, { label: e.target.value })} placeholder="Item label"
                />
                <Input
                  type="number" className="col-span-2 h-8 text-sm text-center"
                  value={it.due_day_offset ?? ""}
                  onChange={e => update(idx, { due_day_offset: e.target.value === "" ? null : Number(e.target.value) })}
                  placeholder="0"
                />
                <div className="col-span-2 flex justify-center">
                  <input type="checkbox" checked={it.is_required !== false}
                    onChange={e => update(idx, { is_required: e.target.checked })} />
                </div>
                <Button variant="ghost" size="sm" className="col-span-1 h-7 w-7 p-0 text-gray-400 hover:text-red-600"
                  onClick={() => removeItem(idx)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button variant="ghost" size="sm" className="text-blue-600 h-7" onClick={addItem}>
              <Plus className="h-3 w-3 mr-1" /> Add item
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New onboarding template</DialogTitle>
            <DialogDescription>Start from a copy of the currently selected template.</DialogDescription>
          </DialogHeader>
          <Input placeholder="Template name (e.g. Apprentice, Contractor, Senior Hire)"
            value={newName} onChange={e => setNewName(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate({ name: newName, copyFromId: selectedId })}
              disabled={!newName.trim() || create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
