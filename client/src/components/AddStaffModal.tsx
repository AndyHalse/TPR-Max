import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CloudUpload, Upload, X, Shield } from "lucide-react";
import type { InsertStaff } from "@shared/schema";

interface AddStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffToEdit?: any; // For edit mode
}

export default function AddStaffModal({ isOpen, onClose, staffToEdit }: AddStaffModalProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    department: "",
    employeeId: "",
    photoUrl: "",
    accessLevel: "staff",
    password: "",
    isFireMarshal: false,
  });
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showTemplateSelect, setShowTemplateSelect] = useState(false);
  
  const isEditMode = !!staffToEdit;

  // Fetch departments dynamically
  const { data: departmentNames } = useQuery<string[]>({
    queryKey: ["/api/departments/names"],
  });

  // Update form data when staffToEdit changes
  useEffect(() => {
    if (staffToEdit) {
      setFormData({
        firstName: staffToEdit.firstName || "",
        lastName: staffToEdit.lastName || "",
        email: staffToEdit.email || "",
        department: staffToEdit.department || "",
        employeeId: staffToEdit.employeeId || "",
        photoUrl: staffToEdit.photoUrl || "",
        accessLevel: staffToEdit.accessLevel || "staff",
        password: "", // Never pre-fill password
        isFireMarshal: staffToEdit.isFireMarshal || false,
      });
      setUploadedPhoto(staffToEdit.photoUrl || null);
    } else {
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        department: "",
        employeeId: "",
        photoUrl: "",
        accessLevel: "staff",
        password: "",
        isFireMarshal: false,
      });
      setUploadedPhoto(null);
    }
  }, [staffToEdit]);

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

  const printIdCardMutation = useMutation({
    mutationFn: async ({ staffId, template }: { staffId: string; template: string }) => {
      const response = await apiRequest("POST", `/api/staff/${staffId}/print-id-card`, {
        template: template,
        design: {
          cardSize: "cr80",
          orientation: "landscape", 
          template: template,
          elements: {
            photo: { x: 16, y: 16, width: 64, height: 64 },
            name: { x: 96, y: 16, fontSize: 18, fontWeight: "bold" },
            department: { x: 96, y: 36, fontSize: 14 },
            employeeId: { x: 96, y: 52, fontSize: 12 },
            company: { x: 16, y: 180, fontSize: 12 },
            accessLevel: { x: 16, y: 196, fontSize: 12, fontWeight: "bold" },
            qrCode: { x: 276, y: 164, width: 48, height: 48 }
          }
        }
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: data.message || "ID card printed successfully!",
      });
      setShowTemplateSelect(false);
    },
    onError: (error: any) => {
      toast({
        title: "Print Error",
        description: error.message || "Failed to print ID card",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setFormData({ firstName: "", lastName: "", email: "", department: "", employeeId: "", photoUrl: "", accessLevel: "staff", password: "", isFireMarshal: false });
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

      // Extract object key from upload URL and create photo path
      const urlParts = uploadURL.split('/.private/')[1] || uploadURL.split('/uploads/')[1];
      const objectKey = urlParts ? urlParts.split('?')[0] : 'uploaded-photo';
      const photoPath = `/objects/${objectKey.includes('uploads/') ? objectKey : 'uploads/' + objectKey}`;
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

    // Check if password is required for admin/supervisor levels (only for new users or when changing access level)
    if ((formData.accessLevel === "admin" || formData.accessLevel === "supervisor") && !formData.password.trim() && !isEditMode) {
      toast({
        title: "Error",
        description: "Password is required for admin and supervisor access levels",
        variant: "destructive",
      });
      return;
    }

    // Generate employee ID if not provided
    const employeeId = formData.employeeId.trim() || 
      `${formData.department.substring(0, 3).toUpperCase()}-${Date.now().toString().slice(-3)}`;

    const staffData: any = {
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      email: formData.email.trim(),
      department: formData.department,
      employeeId,
      photoUrl: uploadedPhoto || undefined,
      accessLevel: formData.accessLevel,
      isFireMarshal: formData.isFireMarshal,
    };

    // Only include password if it's provided and user has admin/supervisor access
    if (formData.password.trim() && (formData.accessLevel === "admin" || formData.accessLevel === "supervisor")) {
      staffData.password = formData.password.trim();
    }

    staffMutation.mutate(staffData);
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
                {departmentNames && departmentNames.length > 0 ? (
                  departmentNames.map(dept => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))
                ) : (
                  <>
                    <SelectItem value="Engineering">Engineering</SelectItem>
                    <SelectItem value="Marketing">Marketing</SelectItem>
                    <SelectItem value="Operations">Operations</SelectItem>
                    <SelectItem value="Finance">Finance</SelectItem>
                    <SelectItem value="Human Resources">Human Resources</SelectItem>
                    <SelectItem value="Sales">Sales</SelectItem>
                  </>
                )}
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
            <Label htmlFor="accessLevel" className="text-sm font-medium text-slate-700">
              Access Level *
            </Label>
            <Select value={formData.accessLevel} onValueChange={(value) => handleInputChange("accessLevel", value)}>
              <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800" data-testid="select-access-level">
                <SelectValue placeholder="Select access level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">👑 Admin - Full system access</SelectItem>
                <SelectItem value="supervisor">🔧 Supervisor - Manage staff & visitors</SelectItem>
                <SelectItem value="manager">👔 Manager - Department oversight</SelectItem>
                <SelectItem value="staff">👤 Staff - Standard access</SelectItem>
                <SelectItem value="security">🛡️ Security - Safety & monitoring</SelectItem>
                <SelectItem value="visitor">👥 Visitor - Guest access</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Fire Marshal Assignment */}
          <div className="flex items-center space-x-3 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-200 dark:border-orange-800">
            <input
              type="checkbox"
              id="isFireMarshal"
              checked={formData.isFireMarshal}
              onChange={(e) => setFormData(prev => ({ ...prev, isFireMarshal: e.target.checked }))}
              className="w-4 h-4 text-orange-600 bg-gray-100 border-gray-300 rounded focus:ring-orange-500 focus:ring-2"
              data-testid="checkbox-fire-marshal"
            />
            <div className="flex-1">
              <label htmlFor="isFireMarshal" className="flex items-center text-sm font-medium text-orange-800 dark:text-orange-200">
                <Shield className="mr-2" size={16} />
                Designate as Fire Marshal
              </label>
              <p className="text-xs text-orange-600 dark:text-orange-300 mt-1">
                Fire Marshals receive emergency notifications and can manage muster points during emergencies
              </p>
            </div>
          </div>
          
          {(formData.accessLevel === "admin" || formData.accessLevel === "supervisor") && (
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                Password * {isEditMode ? "(leave blank to keep current)" : ""}
              </Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => handleInputChange("password", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                placeholder="Enter secure password"
                data-testid="input-password"
                required={!isEditMode}
              />
              <p className="text-xs text-slate-500">
                Admin and supervisor access requires password authentication
              </p>
            </div>
          )}
          
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
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/bmp,image/svg+xml" 
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
            {isEditMode && staffToEdit && (
              <Button 
                type="button"
                variant="outline"
                onClick={() => setShowTemplateSelect(true)}
                className="px-4 py-3 rounded-xl border border-blue-300 text-blue-700 font-medium hover:bg-blue-50 transition-colors"
                data-testid="button-print-id-card"
              >
                Print ID Card
              </Button>
            )}
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
      
      {/* Template Selection Dialog */}
      <Dialog open={showTemplateSelect} onOpenChange={setShowTemplateSelect}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select ID Card Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-600 mb-4">
              Choose a template to print {staffToEdit?.firstName} {staffToEdit?.lastName}'s ID card
            </p>
            
            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full p-4 h-auto flex items-center justify-between hover:bg-blue-50 border-blue-200"
                onClick={() => printIdCardMutation.mutate({ staffId: staffToEdit.id, template: "standard" })}
                disabled={printIdCardMutation.isPending}
              >
                <div className="text-left">
                  <div className="font-medium">Staff Standard</div>
                  <div className="text-xs text-slate-500">General employee template</div>
                </div>
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              </Button>
              
              <Button
                variant="outline"
                className="w-full p-4 h-auto flex items-center justify-between hover:bg-green-50 border-green-200"
                onClick={() => printIdCardMutation.mutate({ staffId: staffToEdit.id, template: "management" })}
                disabled={printIdCardMutation.isPending}
              >
                <div className="text-left">
                  <div className="font-medium">Management</div>
                  <div className="text-xs text-slate-500">Executive & supervisor template</div>
                </div>
              </Button>
              
              <Button
                variant="outline"
                className="w-full p-4 h-auto flex items-center justify-between hover:bg-yellow-50 border-yellow-200"
                onClick={() => printIdCardMutation.mutate({ staffId: staffToEdit.id, template: "contractor" })}
                disabled={printIdCardMutation.isPending}
              >
                <div className="text-left">
                  <div className="font-medium">Contractor</div>
                  <div className="text-xs text-slate-500">Temporary access template</div>
                </div>
              </Button>
              
              <Button
                variant="outline"
                className="w-full p-4 h-auto flex items-center justify-between hover:bg-red-50 border-red-200"
                onClick={() => printIdCardMutation.mutate({ staffId: staffToEdit.id, template: "security" })}
                disabled={printIdCardMutation.isPending}
              >
                <div className="text-left">
                  <div className="font-medium">Security</div>
                  <div className="text-xs text-slate-500">High-security access template</div>
                </div>
              </Button>
            </div>
            
            <div className="mt-6 pt-4 border-t border-slate-200">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Shield size={14} />
                <span>Templates configured in Settings → ID Cards</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
