import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Layers } from "lucide-react";

interface PlatformAdminCustomerFormProps {
  onSuccess: () => void;
}

export default function PlatformAdminCustomerForm({ onSuccess }: PlatformAdminCustomerFormProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    companyName: "",
    contactEmail: "",
    adminUsername: "",
    adminEmail: "",
    adminPassword: "",
    adminFirstName: "",
    adminLastName: "",
    planType: "tpr_basic" as "trial" | "tpr_basic" | "tpr_pro" | "tpr_max" | "enterprise",
    trialDays: 14,
    timezone: "Europe/London",
    currency: "GBP",
    isEnterprise: false,
    siteManagementStyle: "central" as "central" | "independent",
  });

  const [createdCustomer, setCreatedCustomer] = useState<any>(null);

  const createCustomerMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/platform-admin/customers", formData);
      return response.json();
    },
    onSuccess: (data) => {
      setCreatedCustomer(data);
      toast({
        title: "Success",
        description: `Customer "${data.customer.companyName}" created successfully`,
      });
    },
    onError: (error: any) => {
      let description = error.message || "Failed to create customer";
      if (description.includes("already registered") || description.includes("COMPANY_EXISTS")) {
        description = "A company with this name already exists. Please choose a different name.";
      } else if (description.includes("adminUsername") || description.includes("Username")) {
        description = "Username can only contain letters, numbers, underscores, and hyphens (min 3 characters)";
      }
      toast({
        title: "Error",
        description,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createCustomerMutation.mutate();
  };

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (createdCustomer) {
    return (
      <div className="space-y-4">
        <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertDescription className="ml-2">
            <div className="space-y-2">
              <p className="font-semibold text-green-800 dark:text-green-200">
                Customer Created Successfully!
              </p>
              <div className="text-sm space-y-1 text-green-700 dark:text-green-300">
                <p><strong>Company:</strong> {createdCustomer.customer.companyName}</p>
                <p><strong>Slug:</strong> {createdCustomer.customer.slug}</p>
                <p><strong>Admin User:</strong> {createdCustomer.adminUser.username}</p>
                <p><strong>Admin Email:</strong> {createdCustomer.adminUser.email}</p>
                <p className="pt-2"><strong>Login URL:</strong> {createdCustomer.loginUrl}</p>
              </div>
            </div>
          </AlertDescription>
        </Alert>
        
        <div className="flex justify-end space-x-2">
          <Button onClick={onSuccess} data-testid="button-close">
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Company Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Company Information</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <Label htmlFor="companyName">Company Name</Label>
            <Input
              id="companyName"
              data-testid="input-company-name"
              value={formData.companyName}
              onChange={(e) => handleChange("companyName", e.target.value)}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="contactEmail">Contact Email</Label>
            <Input
              id="contactEmail"
              type="email"
              data-testid="input-contact-email"
              value={formData.contactEmail}
              onChange={(e) => handleChange("contactEmail", e.target.value)}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="planType">Plan Type</Label>
            <Select
              value={formData.planType}
              onValueChange={(value) => handleChange("planType", value)}
            >
              <SelectTrigger data-testid="select-plan-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trial">Trial (pre-sales demo)</SelectItem>
                <SelectItem value="tpr_basic">TPR Basic — £49/site/mo</SelectItem>
                <SelectItem value="tpr_pro">TPR Pro — £89/site/mo</SelectItem>
                <SelectItem value="tpr_max">TPR Max — £195/site/mo</SelectItem>
                <SelectItem value="enterprise">Enterprise — priced per customer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Admin User Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Admin User</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="adminFirstName">First Name</Label>
            <Input
              id="adminFirstName"
              data-testid="input-admin-first-name"
              value={formData.adminFirstName}
              onChange={(e) => handleChange("adminFirstName", e.target.value)}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="adminLastName">Last Name</Label>
            <Input
              id="adminLastName"
              data-testid="input-admin-last-name"
              value={formData.adminLastName}
              onChange={(e) => handleChange("adminLastName", e.target.value)}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="adminUsername">Username</Label>
            <Input
              id="adminUsername"
              data-testid="input-admin-username"
              value={formData.adminUsername}
              onChange={(e) => handleChange("adminUsername", e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
              placeholder=""
              required
            />
            <p className="text-xs text-muted-foreground">Letters, numbers, underscores, and hyphens only. Min 3 characters.</p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="adminEmail">Email</Label>
            <Input
              id="adminEmail"
              type="email"
              data-testid="input-admin-email"
              value={formData.adminEmail}
              onChange={(e) => handleChange("adminEmail", e.target.value)}
              required
            />
          </div>
          
          <div className="col-span-2 space-y-2">
            <Label htmlFor="adminPassword">Password</Label>
            <Input
              id="adminPassword"
              type="password"
              data-testid="input-admin-password"
              value={formData.adminPassword}
              onChange={(e) => handleChange("adminPassword", e.target.value)}
              placeholder="Minimum 8 characters, include upper, lower, and number"
              required
            />
          </div>
        </div>
      </div>

      {/* Enterprise Option */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Enterprise</h3>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label className="font-medium flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-600" />
              Enterprise customer
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">Enables multi-site management, compliance dashboard, and estate reporting.</p>
          </div>
          <Switch
            checked={formData.isEnterprise}
            onCheckedChange={(v) => handleChange("isEnterprise", v)}
          />
        </div>

        {formData.isEnterprise && (
          <div className="rounded-lg border p-3 space-y-2">
            <Label className="font-medium">Site management style</Label>
            <p className="text-xs text-muted-foreground">Controls whether sites are managed centrally by HQ or independently by each site admin.</p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleChange("siteManagementStyle", "central")}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  formData.siteManagementStyle === "central"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                    : "border-muted hover:border-muted-foreground/40"
                }`}
              >
                <div className="font-medium text-sm">Central</div>
                <div className="text-xs text-muted-foreground mt-0.5">HQ manages all sites and users</div>
              </button>
              <button
                type="button"
                onClick={() => handleChange("siteManagementStyle", "independent")}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  formData.siteManagementStyle === "independent"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                    : "border-muted hover:border-muted-foreground/40"
                }`}
              >
                <div className="font-medium text-sm">Independent</div>
                <div className="text-xs text-muted-foreground mt-0.5">Each site manages its own users</div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <div className="flex justify-end space-x-2">
        <Button
          type="button"
          variant="outline"
          onClick={onSuccess}
          data-testid="button-cancel"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={createCustomerMutation.isPending}
          data-testid="button-create-customer"
        >
          {createCustomerMutation.isPending ? "Creating..." : "Create Customer"}
        </Button>
      </div>
    </form>
  );
}
