import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ContractorPortalLayout, { portalFetch, getPortalToken } from "./ContractorPortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, Phone, Mail, Loader2, HardHat, Plus, User } from "lucide-react";

interface Worker {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phoneNumber?: string;
  mobileNumber?: string;
  jobTitle?: string;
  trade?: string;
  isActive: boolean;
}

const empty = { firstName: "", lastName: "", email: "", mobileNumber: "", jobTitle: "" };

export default function ContractorPortalWorkers() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...empty });
  const [formError, setFormError] = useState("");

  const { data: workers = [], isLoading } = useQuery<Worker[]>({
    queryKey: ["portal-workers"],
    queryFn: async () => {
      const r = await portalFetch("/api/contractor-portal/workers");
      if (!r.ok) throw new Error("workers");
      return r.json();
    },
    enabled: !!getPortalToken(),
  });

  const addWorker = useMutation({
    mutationFn: (data: typeof empty) =>
      portalFetch("/api/contractor-portal/workers", {
        method: "POST",
        body: JSON.stringify(data),
      }).then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Failed to add worker.");
        return json;
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-workers"] });
      setOpen(false);
      setForm({ ...empty });
      setFormError("");
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const handleOpen = () => { setForm({ ...empty }); setFormError(""); setOpen(true); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setFormError("First name and last name are required.");
      return;
    }
    addWorker.mutate(form);
  };

  return (
    <ContractorPortalLayout>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Workers</h2>
          <p className="text-slate-500 mt-1">
            People registered under your company who may work on site.
          </p>
        </div>
        <Button onClick={handleOpen} className="bg-blue-600 hover:bg-blue-700 shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          Add worker
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : workers.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">No workers yet</p>
            <p className="text-slate-400 text-sm mt-1 mb-4">
              Add your workers so the site team knows who to expect on site.
            </p>
            <Button onClick={handleOpen} variant="outline">
              <Plus className="h-4 w-4 mr-1.5" />
              Add first worker
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workers.map((worker) => (
            <Card key={worker.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-sm font-semibold text-blue-700">
                      {worker.firstName[0]}{worker.lastName[0]}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-900">
                        {worker.firstName} {worker.lastName}
                      </p>
                      <Badge
                        variant={worker.isActive ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {worker.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>

                    {(worker.jobTitle || worker.trade) && (
                      <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                        <HardHat className="h-3 w-3" />
                        {worker.jobTitle || worker.trade}
                      </div>
                    )}

                    <div className="mt-2 space-y-0.5">
                      {worker.email && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Mail className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{worker.email}</span>
                        </div>
                      )}
                      {(worker.mobileNumber || worker.phoneNumber) && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Phone className="h-3 w-3 flex-shrink-0" />
                          {worker.mobileNumber || worker.phoneNumber}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Worker Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add worker</DialogTitle>
            <DialogDescription>
              Add a person who works for your company to the compliance register.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="wFirstName">First name <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="wFirstName"
                    placeholder="First"
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="pl-9"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wLastName">Last name <span className="text-red-500">*</span></Label>
                <Input
                  id="wLastName"
                  placeholder="Last"
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wEmail">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  id="wEmail"
                  type="email"
                  placeholder="worker@company.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wMobile">Mobile number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  id="wMobile"
                  type="tel"
                  placeholder="+44 7700 900000"
                  value={form.mobileNumber}
                  onChange={(e) => setForm((f) => ({ ...f, mobileNumber: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wJobTitle">Job title / trade</Label>
              <div className="relative">
                <HardHat className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  id="wJobTitle"
                  placeholder="e.g. Electrician, Site Manager"
                  value={form.jobTitle}
                  onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700"
                disabled={addWorker.isPending}
              >
                {addWorker.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Adding...</>
                ) : (
                  "Add worker"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ContractorPortalLayout>
  );
}
