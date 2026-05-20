import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft, Plus, Trash2, Loader2, RotateCcw, Save } from "lucide-react";

const CAT_LABELS: Record<string, string> = {
  legal_payroll: "Legal & Payroll",
  equipment: "Equipment",
  access: "Access & Systems",
  knowledge: "Knowledge & People",
};

export default function LeaverTemplateSettings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [dirty, setDirty] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/hr/leaver-template"],
    queryFn: () => fetch("/api/hr/leaver-template", { credentials: "include" }).then(r => r.json()),
  });

  useEffect(() => {
    if (data?.items && !dirty) setItems(data.items.map((i: any) => ({ ...i })));
  }, [data, dirty]);

  const save = useMutation({
    mutationFn: (body: any) => apiRequest("PUT", "/api/hr/leaver-template", body),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["/api/hr/leaver-template"] });
      toast({ title: "Template saved" });
    },
    onError: () => toast({ title: "Error", description: "Failed to save template", variant: "destructive" }),
  });

  const reset = useMutation({
    mutationFn: () => apiRequest("POST", "/api/hr/leaver-template/reset", {}),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["/api/hr/leaver-template"] });
      toast({ title: "Reset to defaults" });
    },
  });

  const update = (idx: number, patch: any) => {
    setItems(s => { const c = [...s]; c[idx] = { ...c[idx], ...patch }; return c; });
    setDirty(true);
  };
  const remove = (idx: number) => {
    setItems(s => s.filter((_, i) => i !== idx));
    setDirty(true);
  };
  const add = (kind: string, category: string) => {
    setItems(s => [...s, {
      kind, category, item_key: `tpl_${Date.now()}`, label: "",
      is_critical: false, is_auto: false, enabled: true, display_order: s.length,
    }]);
    setDirty(true);
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const checklistByCat: Record<string, any[]> = { legal_payroll: [], equipment: [], access: [], knowledge: [] };
  const equipment: any[] = [];
  items.forEach((it, idx) => {
    const entry = { ...it, __idx: idx };
    if (it.kind === "equipment") equipment.push(entry);
    else (checklistByCat[it.category] ||= []).push(entry);
  });

  return (
    <div className="space-y-5 max-w-5xl mx-auto p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/hr/leavers">
            <Button variant="ghost" size="sm" className="mb-2"><ArrowLeft className="h-4 w-4 mr-1" /> Back to Leavers</Button>
          </Link>
          <h1 className="text-2xl font-bold">Leaver Template</h1>
          <p className="text-gray-500 text-sm">
            Customise the default checklist and equipment list used when initiating a leaver process.
            {!data?.isCustom && <Badge className="ml-2 bg-blue-100 text-blue-700">Using defaults</Badge>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => reset.mutate()} disabled={reset.isPending}>
            <RotateCcw className="h-4 w-4 mr-1" /> Reset
          </Button>
          <Button onClick={() => save.mutate({ items })} disabled={!dirty || save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save Template
          </Button>
        </div>
      </div>

      {Object.keys(CAT_LABELS).filter(k => k !== "equipment").map(catKey => (
        <Card key={catKey}>
          <CardHeader className="py-3"><CardTitle className="text-base">{CAT_LABELS[catKey]}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(checklistByCat[catKey] || []).map(it => (
              <div key={it.__idx} className="flex items-center gap-2 p-2 border rounded bg-gray-50">
                <Input
                  className="flex-1 h-8 text-sm" value={it.label}
                  onChange={e => update(it.__idx, { label: e.target.value })}
                  placeholder="Item label"
                />
                <label className="text-xs flex items-center gap-1 whitespace-nowrap">
                  <input type="checkbox" checked={!!it.is_critical}
                    onChange={e => update(it.__idx, { is_critical: e.target.checked })} />
                  Critical
                </label>
                <label className="text-xs flex items-center gap-1 whitespace-nowrap opacity-70">
                  <input type="checkbox" checked={!!it.is_auto} disabled />
                  Auto
                </label>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-600"
                  onClick={() => remove(it.__idx)} disabled={!!it.is_auto}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button variant="ghost" size="sm" className="text-blue-600 h-7" onClick={() => add("checklist", catKey)}>
              <Plus className="h-3 w-3 mr-1" /> Add item
            </Button>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-base">Equipment list (default per leaver)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-gray-500 mb-2">
            These items are pre-populated as equipment rows on each new leaver. Asset tags and serial numbers are filled in per-leaver.
          </p>
          {equipment.map(it => (
            <div key={it.__idx} className="flex items-center gap-2 p-2 border rounded bg-gray-50">
              <Input
                className="flex-1 h-8 text-sm" value={it.label}
                onChange={e => update(it.__idx, { label: e.target.value })}
                placeholder="Equipment name"
              />
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-600"
                onClick={() => remove(it.__idx)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" className="text-blue-600 h-7" onClick={() => add("equipment", "equipment")}>
            <Plus className="h-3 w-3 mr-1" /> Add equipment
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
