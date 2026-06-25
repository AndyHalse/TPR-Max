import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Pencil,
  Trash2,
  Wrench,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { apiRequest, getSessionToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import EquipmentCertificatesTab from "./EquipmentCertificatesTab";

interface Equipment {
  id: string;
  company_id: string;
  name: string;
  category: string;
  make_model: string | null;
  serial_or_reg: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  valid_cert_count: number;
  expired_cert_count: number;
  pending_cert_count: number;
}

interface Props {
  companyId: string;
}

const CATEGORIES = [
  { value: "mewp",         label: "MEWP (Mobile Elevated Work Platform)" },
  { value: "scissor_lift", label: "Scissor Lift" },
  { value: "generator",    label: "Generator" },
  { value: "ladder",       label: "Ladder / Steps" },
  { value: "tower",        label: "Mobile Access Tower" },
  { value: "power_tool",   label: "Power Tool" },
  { value: "vehicle",      label: "Vehicle" },
  { value: "lifting_gear", label: "Lifting Gear / Hoist" },
  { value: "other",        label: "Other" },
];

function categoryLabel(value: string) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function categoryColor(value: string) {
  const map: Record<string, string> = {
    mewp:         "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    scissor_lift: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
    generator:    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    ladder:       "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    tower:        "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    power_tool:   "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
    vehicle:      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    lifting_gear: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    other:        "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300",
  };
  return map[value] ?? map.other;
}

function CertSummary({ item }: { item: Equipment }) {
  const valid = Number(item.valid_cert_count);
  const expired = Number(item.expired_cert_count);
  const pending = Number(item.pending_cert_count);
  if (expired > 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
        <XCircle className="w-3 h-3" /> {expired} expired
      </span>
    );
  }
  if (pending > 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
        <Clock className="w-3 h-3" /> {pending} pending
      </span>
    );
  }
  if (valid > 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
        <CheckCircle className="w-3 h-3" /> {valid} valid
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">No certificates</span>;
}

interface EquipForm {
  name: string;
  category: string;
  makeModel: string;
  serialOrReg: string;
  notes: string;
}

const EMPTY_FORM: EquipForm = { name: "", category: "", makeModel: "", serialOrReg: "", notes: "" };

export default function ContractorEquipmentTab({ companyId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Equipment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Equipment | null>(null);
  const [form, setForm] = useState<EquipForm>(EMPTY_FORM);

  const { data: equipment = [], isLoading } = useQuery<Equipment[]>({
    queryKey: ["/api/contractors", companyId, "equipment"],
    queryFn: async () => {
      const token = getSessionToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`/api/contractors/${companyId}/equipment`, { credentials: "include", headers });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to load equipment (${res.status})`);
      }
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim() || !form.category) throw new Error("Name and category are required");
      const payload = {
        name: form.name.trim(),
        category: form.category,
        makeModel: form.makeModel.trim() || null,
        serialOrReg: form.serialOrReg.trim() || null,
        notes: form.notes.trim() || null,
      };
      const res = editTarget
        ? await apiRequest("PATCH", `/api/contractors/${companyId}/equipment/${editTarget.id}`, payload)
        : await apiRequest("POST", `/api/contractors/${companyId}/equipment`, payload);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save equipment");
      }
      return res.json();
    },
    onSuccess: (saved: Equipment) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", companyId, "equipment"] });
      if (!editTarget) {
        setExpandedId(saved.id);
      }
      toast({ title: editTarget ? "Equipment updated" : "Equipment added — upload certificates below" });
      closeDialog();
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (equip: Equipment) => {
      const res = await apiRequest("DELETE", `/api/contractors/${companyId}/equipment/${equip.id}`);
      if (!res.ok) throw new Error("Failed to remove equipment");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", companyId, "equipment"] });
      toast({ title: "Equipment removed" });
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  function openAdd() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(equip: Equipment) {
    setEditTarget(equip);
    setForm({
      name: equip.name,
      category: equip.category,
      makeModel: equip.make_model ?? "",
      serialOrReg: equip.serial_or_reg ?? "",
      notes: equip.notes ?? "",
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditTarget(null);
    setForm(EMPTY_FORM);
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-6 text-center">Loading equipment…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Plant & Equipment Register</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track equipment brought on site and manage LOLER, PUWER, PAT and other certificates.
          </p>
        </div>
        <Button size="sm" onClick={openAdd} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" /> Add Equipment
        </Button>
      </div>

      {equipment.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/20">
          <Wrench className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No equipment registered yet.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Add MEWPs, vehicles, tools and other plant equipment to track their legal certificates.
          </p>
          <Button size="sm" variant="outline" className="mt-4 gap-2" onClick={openAdd}>
            <Plus className="w-3 h-3" /> Add first item
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {equipment.map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <Card key={item.id} className="overflow-hidden">
                <CardHeader className="p-3 pb-0">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{item.name}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${categoryColor(item.category)}`}>
                          {categoryLabel(item.category)}
                        </span>
                        <CertSummary item={item} />
                      </div>
                      {(item.make_model || item.serial_or_reg) && (
                        <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                          {item.make_model && <span>{item.make_model}</span>}
                          {item.serial_or_reg && <span>S/N or Reg: {item.serial_or_reg}</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => openEdit(item)}
                        title="Edit equipment details"
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(item)}
                        title="Remove equipment"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 gap-1 text-xs"
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      >
                        {isExpanded ? (
                          <><ChevronUp className="w-3 h-3" /> Hide certificates</>
                        ) : (
                          <><ChevronDown className="w-3 h-3" /> Certificates</>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="p-3 pt-3 border-t mt-3">
                    <EquipmentCertificatesTab equipmentId={item.id} />
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              {editTarget ? "Edit Equipment" : "Add Equipment"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Equipment name <span className="text-red-500">*</span></Label>
              <Input
                placeholder="e.g. Genie GS-1930 Scissor Lift"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Category <span className="text-red-500">*</span></Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Make / Model</Label>
              <Input
                placeholder="e.g. Genie GS-1930"
                value={form.makeModel}
                onChange={(e) => setForm((f) => ({ ...f, makeModel: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Serial number / Vehicle reg</Label>
              <Input
                placeholder="e.g. SN123456 or AB12 CDE"
                value={form.serialOrReg}
                onChange={(e) => setForm((f) => ({ ...f, serialOrReg: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                placeholder="Any additional details…"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : editTarget ? "Save changes" : "Add equipment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove equipment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{deleteTarget?.name}</strong> and its certificates from the register. The audit trail is preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
