import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Building, Plus, Edit, Trash2, BarChart3, Download, Users } from "lucide-react";
import type { Department, InsertDepartment } from "@shared/schema";

export default function DepartmentsSettings() {
  const { toast } = useToast();
  const [showDepartmentDialog, setShowDepartmentDialog] = useState(false);
  const [departmentToEdit, setDepartmentToEdit] = useState<Department | null>(null);
  const [departmentForm, setDepartmentForm] = useState<Partial<InsertDepartment>>({
    name: "",
    description: "",
    color: "bg-blue-50 dark:bg-blue-950/300"
  });

  const { data: currentUser } = useQuery<{ id: string; username: string; customerId: string; role: string }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: departments } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const { data: departmentAnalytics } = useQuery<Array<{ department: string; staffCount: number; visitorCount: number }>>({
    queryKey: ["/api/analytics/departments"],
  });

  const departmentMutation = useMutation({
    mutationFn: async (data: { department: InsertDepartment; isEdit: boolean; id?: string }) => {
      const { department, isEdit, id } = data;
      if (isEdit && id) {
        const response = await apiRequest("PUT", `/api/departments/${id}`, department);
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/departments", department);
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/departments/names"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/departments"] });
      setShowDepartmentDialog(false);
      setDepartmentToEdit(null);
      setDepartmentForm({ name: "", description: "", color: "bg-blue-50 dark:bg-blue-950/300" });
      toast({ title: "Success", description: departmentToEdit ? "Department updated successfully!" : "Department created successfully!" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to save department", variant: "destructive" });
    },
  });

  const deleteDepartmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/departments/${id}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/departments/names"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/departments"] });
      toast({ title: "Success", description: "Department deleted successfully!" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete department", variant: "destructive" });
    },
  });

  const handleDeleteDepartment = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this department? This action cannot be undone.")) {
      deleteDepartmentMutation.mutate(id);
    }
  };

  const handleDepartmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!departmentForm.name?.trim()) {
      toast({ title: "Error", description: "Department name is required", variant: "destructive" });
      return;
    }
    if (!currentUser?.customerId) {
      toast({ title: "Error", description: "User not authenticated", variant: "destructive" });
      return;
    }
    departmentMutation.mutate({
      department: {
        name: departmentForm.name.trim(),
        description: departmentForm.description?.trim() || "",
        color: departmentForm.color || "bg-blue-50 dark:bg-blue-950/300",
        customerId: currentUser.customerId
      },
      isEdit: !!departmentToEdit,
      id: departmentToEdit?.id
    });
  };

  return (
    <div className="space-y-6">
<GlassCard>
  <div className="flex items-center justify-between mb-6">
    <div className="flex items-center">
      <Building className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
      <div>
        <h3 className="text-lg font-semibold text-fixed">Department Management</h3>
        <p className="text-sm text-variable">
          Organize your workforce and improve visitor experiences with department-based routing
        </p>
      </div>
    </div>
    <div className="flex gap-3">
      <Button
        variant="outline"
        className="text-variable border-slate-300"
        data-testid="button-export-departments"
      >
        <Download className="mr-2" size={16} />
        Export
      </Button>
      <Button
        onClick={() => {
          setDepartmentToEdit(null);
          setDepartmentForm({ name: "", description: "", color: "bg-blue-50 dark:bg-blue-950/300" });
          setShowDepartmentDialog(true);
        }}
        className="gradient-blue text-white font-medium hover:shadow-lg transition-all duration-300"
        data-testid="button-add-department"
      >
        <Building className="mr-2" size={16} />
        Add Department
      </Button>
    </div>
  </div>
  <div className="space-y-4">
    {departments && departments.length > 0 ? (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {departments.map((department) => (
          <div
            key={department.id}
            className="p-4 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm"
            style={{ 
              backgroundColor: department.color ? 
                (department.color.startsWith('#') ? `${department.color}20` : 
                 department.color.includes('blue') ? '#3b82f620' :
                 department.color.includes('green') ? '#10b98120' :
                 department.color.includes('purple') ? '#a855f720' :
                 department.color.includes('red') ? '#ef444420' :
                 department.color.includes('yellow') ? '#eab30820' :
                 department.color.includes('pink') ? '#ec489920' :
                 department.color.includes('orange') ? '#f9731620' :
                 department.color.includes('indigo') ? '#6366f120' :
                 '#3b82f620') : '#3b82f620'
            }}
            data-testid={`card-department-${department.id}`}
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-fixed" data-testid={`text-department-name-${department.id}`}>
                {department.name}
              </h4>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setDepartmentToEdit(department);
                    setDepartmentForm({
                      name: department.name,
                      description: department.description || "",
                      color: department.color || "bg-blue-50 dark:bg-blue-950/300"
                    });
                    setShowDepartmentDialog(true);
                  }}
                  variant="ghost"
                  size="sm"
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:text-blue-300"
                  data-testid={`button-edit-department-${department.id}`}
                >
                  <Edit size={14} />
                </Button>
                <Button
                  onClick={() => handleDeleteDepartment(department.id)}
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-800"
                  data-testid={`button-delete-department-${department.id}`}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
            {department.description && (
              <p className="text-sm text-variable mb-3" data-testid={`text-department-description-${department.id}`}>
                {department.description}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full border border-slate-300"
                  style={{ 
                    backgroundColor: department.color ? 
                      (department.color.startsWith('#') ? department.color : 
                       department.color.includes('blue') ? '#3b82f6' :
                       department.color.includes('green') ? '#10b981' :
                       department.color.includes('purple') ? '#a855f7' :
                       department.color.includes('red') ? '#ef4444' :
                       department.color.includes('yellow') ? '#eab308' :
                       department.color.includes('pink') ? '#ec4899' :
                       department.color.includes('orange') ? '#f97316' :
                       department.color.includes('indigo') ? '#6366f1' :
                       '#3b82f6') : '#3b82f6'
                  }}
                  data-testid={`color-indicator-${department.id}`}
                />
                <span className="text-xs text-variable capitalize">
                  {department.color || 'blue'}
                </span>
              </div>
              <div className="text-xs text-variable">
                <Users size={12} className="inline mr-1" />
                {departmentAnalytics?.find(a => a.department === department.name)?.staffCount ?? 0} staff
              </div>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="text-center py-12" data-testid="empty-departments-state">
        <Building className="mx-auto mb-4 text-variable" size={48} />
        <p className="text-variable mb-4">No departments configured</p>
        <p className="text-sm text-variable mb-6">
          Create departments to organize your staff and improve visitor management
        </p>
        <Button
          className="gradient-blue text-white"
          data-testid="button-add-first-department"
        >
          <Building className="mr-2" size={16} />
          Add Your First Department
        </Button>
      </div>
    )}
  </div>
</GlassCard>


{/* Department Dialog */}
<Dialog open={showDepartmentDialog} onOpenChange={setShowDepartmentDialog}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>
        {departmentToEdit ? "Edit Department" : "Add Department"}
      </DialogTitle>
      <DialogDescription>
        {departmentToEdit ? "Update department information and settings." : "Create a new department with a name and color."}
      </DialogDescription>
    </DialogHeader>
    
    <form onSubmit={handleDepartmentSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="departmentName">Department Name *</Label>
        <Input
          id="departmentName"
          value={departmentForm.name || ""}
          onChange={(e) => setDepartmentForm(prev => ({ ...prev, name: e.target.value }))}
          placeholder=""
          required
          data-testid="input-department-name"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="departmentDescription">Description</Label>
        <Input
          id="departmentDescription"
          value={departmentForm.description || ""}
          onChange={(e) => setDepartmentForm(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Brief description of the department"
          data-testid="input-department-description"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="departmentColor">Department Color</Label>
        <Select 
          value={departmentForm.color || "bg-blue-50 dark:bg-blue-950/300"} 
          onValueChange={(value) => setDepartmentForm(prev => ({ ...prev, color: value }))}
        >
          <SelectTrigger data-testid="select-department-color">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bg-blue-50 dark:bg-blue-950/300">🔵 Blue</SelectItem>
            <SelectItem value="bg-green-50 dark:bg-green-950/300">🟢 Green</SelectItem>
            <SelectItem value="bg-purple-500">🟣 Purple</SelectItem>
            <SelectItem value="bg-red-500">🔴 Red</SelectItem>
            <SelectItem value="bg-yellow-500">🟡 Yellow</SelectItem>
            <SelectItem value="bg-pink-500">🩷 Pink</SelectItem>
            <SelectItem value="bg-indigo-500">🟦 Indigo</SelectItem>
            <SelectItem value="bg-orange-500">🟠 Orange</SelectItem>
            <SelectItem value="bg-cyan-500">🔷 Cyan</SelectItem>
            <SelectItem value="bg-emerald-500">💎 Emerald</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-variable">
          Color coding helps staff and visitors quickly identify departments
        </p>
      </div>
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Department Benefits:</h4>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <li>• Route visitors directly to correct departments</li>
          <li>• Generate department-specific ID badges</li>
          <li>• Track visitor analytics per department</li>
          <li>• Enable department-based access controls</li>
        </ul>
      </div>
      <DialogFooter className="gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowDepartmentDialog(false)}
          data-testid="button-cancel-department"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="gradient-blue text-white"
          disabled={departmentMutation.isPending}
          data-testid="button-save-department"
        >
          {departmentMutation.isPending ? "Saving..." : departmentToEdit ? "Update" : "Create"}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>

    </div>
  );
}
