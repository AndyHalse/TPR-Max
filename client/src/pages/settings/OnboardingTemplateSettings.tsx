import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft, Plus, Trash2, Loader2, RotateCcw, Save, GripVertical, ArrowUp, ArrowDown } from "lucide-react";

export default function OnboardingTemplateSettings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [dirty, setDirty] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/onboarding/template"],
    queryFn: () => fetch("/api/onboarding/template", { credentials: "include" }).then(r => r.json()),
  });

  useEffect(() => {
    if (data?.items && !dirty) setItems(data.items.map((i: any) => ({ ...i })));
  }, [data, dirty]);

  const save = useMutation({
    mutationFn: (body: any) => apiRequest("PUT", "/api/onboarding/template", body),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["/api/onboarding/template"] });
      toast({ title: "Template saved" });
    },
    onError: () => toast({ title: "Error", description: "Failed to save template", variant: "destructive" }),
  });

  const reset = useMutation({
    mutationFn: () => apiRequest("POST", "/api/onboarding/template/reset", {}),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["/api/onboarding/template"] });
      toast({ title: "Reset to defaults" });
    },
  });

  const update = (idx: number, patch: any) => {
    setItems(s => { const c = [...s]; c[idx] = { ...c[idx], ...patch }; return c; });
    setDirty(true);
  };
  const remove = (idx: number) => { setItems(s => s.filter((_, i) => i !== idx)); setDirty(true); };
  const move = (idx: number, dir: -1 | 1) => {
    setItems(s => {
      const c = [...s];
      const j = idx + dir;
      if (j < 0 || j >= c.length) return c;
      [c[idx], c[j]] = [c[j], c[idx]];
      return c;
    });
    setDirty(true);
  };
  const add = () => {
    setItems(s => [...s, {
      item_key: `tpl_${Date.now()}`, label: "", due_day_offset: 0,
      is_required: true, is_active: true,
    }]);
    setDirty(true);
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-5 max-w-5xl mx-auto p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/hr/onboarding">
            <Button variant="ghost" size="sm" className="mb-2"><ArrowLeft className="h-4 w-4 mr-1" /> Back to Onboarding</Button>
          </Link>
          <h1 className="text-2xl font-bold">Onboarding Template</h1>
          <p className="text-gray-500 text-sm">
            Customise the checklist used when starting onboarding for new staff.
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

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Checklist items</CardTitle>
          <p className="text-xs text-gray-500">
            "Due day" is how many days after the start date the item is due. Negative numbers mean before the start date. Required items must be completed to finish onboarding.
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
                <button className="hover:text-blue-600" onClick={() => move(idx, -1)} disabled={idx === 0}><ArrowUp className="h-3 w-3" /></button>
                <button className="hover:text-blue-600" onClick={() => move(idx, 1)} disabled={idx === items.length - 1}><ArrowDown className="h-3 w-3" /></button>
              </div>
              <Input
                className="col-span-6 h-8 text-sm" value={it.label}
                onChange={e => update(idx, { label: e.target.value })}
                placeholder="Item label"
              />
              <Input
                type="number" className="col-span-2 h-8 text-sm text-center"
                value={it.due_day_offset ?? ""}
                onChange={e => update(idx, { due_day_offset: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="0"
              />
              <div className="col-span-2 flex justify-center">
                <input
                  type="checkbox" checked={it.is_required !== false}
                  onChange={e => update(idx, { is_required: e.target.checked })}
                />
              </div>
              <Button variant="ghost" size="sm" className="col-span-1 h-7 w-7 p-0 text-gray-400 hover:text-red-600"
                onClick={() => remove(idx)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" className="text-blue-600 h-7" onClick={add}>
            <Plus className="h-3 w-3 mr-1" /> Add item
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
