import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { UserPlus } from "lucide-react";
import { CompanyCombobox } from "@/components/CompanyCombobox";

interface AddVisitorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phoneNumber: "",
  mobileNumber: "",
  company: "",
  jobTitle: "",
  address: "",
  notes: "",
};

type FormErrors = Partial<Record<keyof typeof EMPTY_FORM, boolean>>;

export default function AddVisitorModal({ isOpen, onClose }: AddVisitorModalProps) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});

  const { data: companies = [] } = useQuery<string[]>({
    queryKey: ["/api/companies"],
    enabled: isOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM) => {
      const res = await apiRequest("POST", "/api/visitors/add-profile", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      toast({
        title: "Visitor added",
        description: `${form.firstName} ${form.lastName} has been added to your visitor list.`,
      });
      handleClose();
    },
    onError: () => {
      toast({
        title: "Failed to add visitor",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  function set(field: keyof typeof EMPTY_FORM, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: false }));
  }

  function validate() {
    const e: FormErrors = {};
    if (!form.firstName.trim()) e.firstName = true;
    if (!form.lastName.trim()) e.lastName = true;
    if (!form.company.trim()) e.company = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    createMutation.mutate(form);
  }

  function handleClose() {
    setForm(EMPTY_FORM);
    setErrors({});
    onClose();
  }

  const field = (label: string, key: keyof typeof EMPTY_FORM, opts?: { required?: boolean; type?: string }) => (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-fixed">
        {label}{opts?.required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <Input
        type={opts?.type ?? "text"}
        value={form[key]}
        onChange={e => set(key, e.target.value)}
        className={`w-full rounded-xl border bg-white/50 focus:outline-none focus:ring-2 text-fixed ${
          errors[key]
            ? "border-red-500 focus:ring-red-500 ring-red-200"
            : "border-white/30 focus:ring-blue-500"
        }`}
      />
      {errors[key] && <p className="text-xs text-red-500">This field is required</p>}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="p-1.5 bg-blue-100 rounded-lg">
              <UserPlus className="text-blue-600" size={20} />
            </div>
            Add Visitor
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          {/* Required */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-fixed uppercase tracking-wide text-slate-500 border-b border-slate-200 pb-1.5">
              Required Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field("First Name", "firstName", { required: true })}
              {field("Last Name", "lastName", { required: true })}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-fixed">
                Company<span className="text-red-500 ml-0.5">*</span>
              </Label>
              <CompanyCombobox
                value={form.company}
                onChange={v => set("company", v)}
                companies={companies}
                placeholder="Select or type company name..."
                className={`rounded-xl border bg-white/50 focus:outline-none focus:ring-2 text-fixed ${
                  errors.company
                    ? "border-red-500 focus:ring-red-500 ring-red-200"
                    : "border-white/30 focus:ring-blue-500"
                }`}
              />
              {errors.company && <p className="text-xs text-red-500">Company is required</p>}
            </div>
          </div>

          {/* Optional */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-fixed uppercase tracking-wide text-slate-500 border-b border-slate-200 pb-1.5">
              Additional Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field("Email Address", "email", { type: "email" })}
              {field("Job Title", "jobTitle")}
              {field("Phone Number", "phoneNumber", { type: "tel" })}
              {field("Mobile Number", "mobileNumber", { type: "tel" })}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-fixed">Address</Label>
              <Textarea
                value={form.address}
                onChange={e => set("address", e.target.value)}
                placeholder="Street, city, postcode"
                className="w-full rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed min-h-[72px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-fixed">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={e => set("notes", e.target.value)}
                placeholder="Any additional notes about this visitor"
                className="w-full rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed min-h-[72px]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2"
            >
              <UserPlus size={16} />
              {createMutation.isPending ? "Adding..." : "Add Visitor"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
