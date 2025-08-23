import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CloudUpload } from "lucide-react";
import type { InsertStaff } from "@shared/schema";

interface AddStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddStaffModal({ isOpen, onClose }: AddStaffModalProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    department: "",
    employeeId: "",
  });

  const addStaffMutation = useMutation({
    mutationFn: async (staff: InsertStaff) => {
      const response = await apiRequest("POST", "/api/staff", staff);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Success",
        description: "Staff member added successfully!",
      });
      handleClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add staff member",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setFormData({ name: "", department: "", employeeId: "" });
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.department) {
      toast({
        title: "Error",
        description: "Department is required",
        variant: "destructive",
      });
      return;
    }

    // Generate employee ID if not provided
    const employeeId = formData.employeeId.trim() || 
      `${formData.department.substring(0, 3).toUpperCase()}-${Date.now().toString().slice(-3)}`;

    addStaffMutation.mutate({
      name: formData.name.trim(),
      department: formData.department,
      employeeId,
    });
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md glass-effect border-white/20" data-testid="add-staff-modal">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-800">
            Add New Staff Member
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="staffName" className="text-sm font-medium text-slate-700">
              Full Name *
            </Label>
            <Input
              id="staffName"
              type="text"
              required
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
              placeholder="Enter staff member name"
              data-testid="input-staff-name"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="department" className="text-sm font-medium text-slate-700">
              Department *
            </Label>
            <Select value={formData.department} onValueChange={(value) => handleInputChange("department", value)}>
              <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800" data-testid="select-department">
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Engineering">Engineering</SelectItem>
                <SelectItem value="Marketing">Marketing</SelectItem>
                <SelectItem value="Operations">Operations</SelectItem>
                <SelectItem value="Finance">Finance</SelectItem>
                <SelectItem value="Human Resources">Human Resources</SelectItem>
                <SelectItem value="Sales">Sales</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="employeeId" className="text-sm font-medium text-slate-700">
              Employee ID
            </Label>
            <Input
              id="employeeId"
              type="text"
              value={formData.employeeId}
              onChange={(e) => handleInputChange("employeeId", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
              placeholder="Auto-generated if left blank"
              data-testid="input-employee-id"
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">
              Photo
            </Label>
            <div className="border-2 border-dashed border-white/30 rounded-xl p-6 text-center">
              <CloudUpload className="mx-auto h-8 w-8 text-slate-400 mb-2" />
              <p className="text-sm text-slate-600">Click to upload photo or drag and drop</p>
              <input type="file" accept="image/*" className="hidden" />
            </div>
          </div>
          
          <div className="flex gap-3 pt-4">
            <Button 
              type="button" 
              variant="outline"
              onClick={handleClose}
              className="flex-1 px-4 py-3 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
              data-testid="button-cancel-add-staff"
            >
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={addStaffMutation.isPending}
              className="flex-1 gradient-blue text-white px-4 py-3 rounded-xl font-medium hover:shadow-lg transition-all duration-300 disabled:opacity-50"
              data-testid="button-submit-add-staff"
            >
              {addStaffMutation.isPending ? "Adding..." : "Add Staff Member"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
