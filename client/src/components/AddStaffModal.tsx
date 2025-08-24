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
import { CloudUpload, Upload, X } from "lucide-react";
import type { InsertStaff } from "@shared/schema";

interface AddStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffToEdit?: any; // For edit mode
}

export default function AddStaffModal({ isOpen, onClose, staffToEdit }: AddStaffModalProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    firstName: staffToEdit?.firstName || "",
    lastName: staffToEdit?.lastName || "",
    email: staffToEdit?.email || "",
    department: staffToEdit?.department || "",
    employeeId: staffToEdit?.employeeId || "",
    photoUrl: staffToEdit?.photoUrl || "",
  });
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(staffToEdit?.photoUrl || null);
  const [uploading, setUploading] = useState(false);
  
  const isEditMode = !!staffToEdit;

  const staffMutation = useMutation({
    mutationFn: async (staff: InsertStaff & { id?: string }) => {
      const endpoint = isEditMode ? `/api/staff/${staffToEdit.id}` : "/api/staff";
      const method = isEditMode ? "PUT" : "POST";
      const response = await apiRequest(method, endpoint, staff);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Success",
        description: isEditMode ? "Staff member updated successfully!" : "Staff member added successfully!",
      });
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || (isEditMode ? "Failed to update staff member" : "Failed to add staff member"),
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setFormData({ firstName: "", lastName: "", email: "", department: "", employeeId: "", photoUrl: "" });
    setUploadedPhoto(null);
    onClose();
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Get upload URL
      const uploadResponse = await apiRequest("POST", "/api/objects/upload");
      const { uploadURL } = await uploadResponse.json();

      // Upload file directly to object storage
      const uploadResult = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadResult.ok) {
        throw new Error("Failed to upload photo");
      }

      // Set photo URL for the form
      const photoPath = `/objects/uploads/${uploadURL.split('/uploads/')[1].split('?')[0]}`;
      setUploadedPhoto(photoPath);
      setFormData(prev => ({ ...prev, photoUrl: photoPath }));
      
      toast({
        title: "Success",
        description: "Photo uploaded successfully!",
      });
    } catch (error) {
      console.error("Photo upload error:", error);
      toast({
        title: "Error",
        description: "Failed to upload photo",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = () => {
    setUploadedPhoto(null);
    setFormData(prev => ({ ...prev, photoUrl: "" }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      toast({
        title: "Error",
        description: "First name and last name are required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.email.trim()) {
      toast({
        title: "Error",
        description: "Email is required",
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

    staffMutation.mutate({
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      email: formData.email.trim(),
      department: formData.department,
      employeeId,
      photoUrl: uploadedPhoto || undefined,
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
            {isEditMode ? "Edit Staff Member" : "Add New Staff Member"}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-sm font-medium text-slate-700">
                First Name *
              </Label>
              <Input
                id="firstName"
                type="text"
                required
                value={formData.firstName}
                onChange={(e) => handleInputChange("firstName", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                placeholder="First name"
                data-testid="input-first-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-sm font-medium text-slate-700">
                Last Name *
              </Label>
              <Input
                id="lastName"
                type="text"
                required
                value={formData.lastName}
                onChange={(e) => handleInputChange("lastName", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                placeholder="Last name"
                data-testid="input-last-name"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-slate-700">
              Email Address *
            </Label>
            <Input
              id="email"
              type="email"
              required
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
              placeholder="email@company.com"
              data-testid="input-email"
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
            {uploadedPhoto ? (
              <div className="relative border-2 border-white/30 rounded-xl p-4 text-center">
                <img 
                  src={uploadedPhoto} 
                  alt="Staff photo" 
                  className="w-20 h-20 rounded-full mx-auto mb-2 object-cover"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={removePhoto}
                  className="absolute top-2 right-2 p-1 h-auto"
                >
                  <X size={14} />
                </Button>
                <p className="text-sm text-slate-600">Photo uploaded successfully</p>
              </div>
            ) : (
              <div className="border-2 border-dashed border-white/30 rounded-xl p-6 text-center">
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handlePhotoUpload}
                  className="hidden" 
                  id="photo-upload"
                  disabled={uploading}
                />
                <label htmlFor="photo-upload" className="cursor-pointer">
                  {uploading ? (
                    <>
                      <Upload className="mx-auto h-8 w-8 text-blue-500 mb-2 animate-pulse" />
                      <p className="text-sm text-blue-600">Uploading...</p>
                    </>
                  ) : (
                    <>
                      <CloudUpload className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                      <p className="text-sm text-slate-600">Click to upload photo or drag and drop</p>
                    </>
                  )}
                </label>
              </div>
            )}
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
              disabled={staffMutation.isPending || uploading}
              className="flex-1 gradient-blue text-white px-4 py-3 rounded-xl font-medium hover:shadow-lg transition-all duration-300 disabled:opacity-50"
              data-testid="button-submit-staff"
            >
              {staffMutation.isPending ? (isEditMode ? "Updating..." : "Adding...") : (isEditMode ? "Update Staff Member" : "Add Staff Member")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
