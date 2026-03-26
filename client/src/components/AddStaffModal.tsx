import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CloudUpload, Upload, X, Shield, Phone, Copy, AlertCircle, Camera } from "lucide-react";
import { Switch } from "@/components/ui/switch";
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
    jobTitle: "",
    employeeId: "",
    biostarUserId: "",
    paxtonUserId: "",
    photoUrl: "",
    accessLevel: "staff",
    password: "",
    isFireMarshal: false,
    needsEvacuationAssistance: false,
    phoneNumber: "",
    voiceNotificationsEnabled: false,
    preferredNotificationMethod: "email",
    voiceLanguage: "en-GB",
    voiceProfile: "en-GB-Standard-A",
    zoneId: "",
  });
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showTemplateSelect, setShowTemplateSelect] = useState(false);
  
  const isEditMode = !!staffToEdit;

  // Fetch departments dynamically
  const { data: departmentNames } = useQuery<string[]>({
    queryKey: ["/api/departments/names"],
  });

  const { data: zones = [] } = useQuery<any[]>({
    queryKey: ["/api/zones"],
  });

  // Update form data when staffToEdit changes
  useEffect(() => {
    if (staffToEdit) {
      setFormData({
        firstName: staffToEdit.firstName || "",
        lastName: staffToEdit.lastName || "",
        email: staffToEdit.email || "",
        department: staffToEdit.department || "",
        jobTitle: staffToEdit.jobTitle || "",
        employeeId: staffToEdit.employeeId || "",
        biostarUserId: staffToEdit.biostarUserId || "",
        paxtonUserId: staffToEdit.paxtonUserId || "",
        photoUrl: staffToEdit.photoUrl || "",
        accessLevel: staffToEdit.accessLevel || "staff",
        password: "", // Never pre-fill password
        isFireMarshal: staffToEdit.isFireMarshal || false,
        needsEvacuationAssistance: staffToEdit.needsEvacuationAssistance || false,
        phoneNumber: staffToEdit.phoneNumber || "",
        voiceNotificationsEnabled: staffToEdit.voiceNotificationsEnabled || false,
        preferredNotificationMethod: staffToEdit.preferredNotificationMethod || "email",
        voiceLanguage: staffToEdit.voiceLanguage || "en-GB",
        voiceProfile: staffToEdit.voiceProfile || "en-GB-Standard-A",
        zoneId: staffToEdit.zoneId || "",
      });
      setUploadedPhoto(staffToEdit.photoUrl || null);
    } else {
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        department: "",
        jobTitle: "",
        employeeId: "",
        biostarUserId: "",
        paxtonUserId: "",
        photoUrl: "",
        accessLevel: "staff",
        password: "",
        isFireMarshal: false,
        needsEvacuationAssistance: false,
        phoneNumber: "",
        voiceNotificationsEnabled: false,
        preferredNotificationMethod: "email",
        voiceLanguage: "en-GB",
        voiceProfile: "en-GB-Standard-A",
        zoneId: "",
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
    setFormData({ 
      firstName: "", 
      lastName: "", 
      email: "", 
      department: "", 
      employeeId: "", 
      biostarUserId: "",
      paxtonUserId: "",
      photoUrl: "", 
      accessLevel: "staff", 
      password: "", 
      isFireMarshal: false,
      phoneNumber: "",
      voiceNotificationsEnabled: false,
      preferredNotificationMethod: "email",
      voiceLanguage: "en-GB",
      voiceProfile: "en-GB-Standard-A",
      zoneId: "",
      needsEvacuationAssistance: false,
    });
    setUploadedPhoto(null);
    onClose();
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let base64: string;
    try {
      base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
    } catch (readError: any) {
      toast({ title: "Error", description: "Could not read the file. Please try selecting it again.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const res = await apiRequest("POST", "/api/objects/upload", { data: base64, mimeType: file.type });
      const { objectPath } = await res.json();
      setUploadedPhoto(objectPath);
      setFormData(prev => ({ ...prev, photoUrl: objectPath }));
      toast({ title: "Success", description: "Photo uploaded successfully!" });
    } catch (error: any) {
      console.error("Photo upload error:", error?.message || String(error));
      toast({ title: "Error", description: "Failed to upload photo", variant: "destructive" });
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

    // Check if password is required for admin level (only for new users or when changing access level)
    if (formData.accessLevel === "admin" && !formData.password.trim() && !isEditMode) {
      toast({
        title: "Error",
        description: "Password is required for Administrator access level",
        variant: "destructive",
      });
      return;
    }

    // Validate phone number if voice notifications are enabled
    if (formData.voiceNotificationsEnabled && !formData.phoneNumber.trim()) {
      toast({
        title: "Error",
        description: "Phone number is required when voice notifications are enabled",
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
      jobTitle: formData.jobTitle.trim() || null,
      employeeId,
      biostarUserId: formData.biostarUserId.trim() || null,
      paxtonUserId: formData.paxtonUserId.trim() || null,
      photoUrl: uploadedPhoto || undefined,
      accessLevel: formData.accessLevel,
      isFireMarshal: formData.isFireMarshal,
      needsEvacuationAssistance: formData.needsEvacuationAssistance,
      phoneNumber: formData.phoneNumber.trim() || null,
      voiceNotificationsEnabled: formData.voiceNotificationsEnabled,
      preferredNotificationMethod: formData.preferredNotificationMethod,
      voiceLanguage: formData.voiceLanguage,
      voiceProfile: formData.voiceProfile,
      zoneId: formData.zoneId || null,
    };

    // Only include password if it's provided and user has admin access
    if (formData.password.trim() && formData.accessLevel === "admin") {
      staffData.password = formData.password.trim();
    }

    staffMutation.mutate(staffData);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] glass-effect border-white/20 overflow-y-auto" data-testid="add-staff-modal">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-fixed">
            {isEditMode ? "Edit Staff Member" : "Add New Staff Member"}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-sm font-medium text-fixed">
                First Name *
              </Label>
              <Input
                id="firstName"
                type="text"
                required
                value={formData.firstName}
                onChange={(e) => handleInputChange("firstName", e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                placeholder=""
                data-testid="input-first-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-sm font-medium text-fixed">
                Last Name *
              </Label>
              <Input
                id="lastName"
                type="text"
                required
                value={formData.lastName}
                onChange={(e) => handleInputChange("lastName", e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                placeholder=""
                data-testid="input-last-name"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-fixed">
              Email Address *
            </Label>
            <Input
              id="email"
              type="email"
              required
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              placeholder=""
              data-testid="input-email"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="department" className="text-sm font-medium text-fixed">
              Department *
            </Label>
            <Select value={formData.department} onValueChange={(value) => handleInputChange("department", value)}>
              <SelectTrigger className="w-full px-3 py-2 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed" data-testid="select-department">
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
            <Label htmlFor="jobTitle" className="text-sm font-medium text-fixed">
              Job Title
            </Label>
            <Input
              id="jobTitle"
              type="text"
              value={formData.jobTitle}
              onChange={(e) => handleInputChange("jobTitle", e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              placeholder="e.g. Site Manager, Engineer"
              data-testid="input-job-title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="employeeId" className="text-sm font-medium text-fixed">
              Employee ID
            </Label>
            <Input
              id="employeeId"
              type="text"
              value={formData.employeeId}
              onChange={(e) => handleInputChange("employeeId", e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              placeholder="Auto-generated if left blank"
              data-testid="input-employee-id"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="biostarUserId" className="text-sm font-medium text-fixed">
              Biostar 2 User ID
            </Label>
            <Input
              id="biostarUserId"
              type="text"
              value={formData.biostarUserId}
              onChange={(e) => handleInputChange("biostarUserId", e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              placeholder="Optional - For access control sync"
              data-testid="input-biostar-user-id"
            />
            <p className="text-xs text-variable">
              Links this staff member to a user in Biostar 2 access control system
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="paxtonUserId" className="text-sm font-medium text-fixed">
              Paxton Net2 User ID
            </Label>
            <Input
              id="paxtonUserId"
              type="text"
              value={formData.paxtonUserId}
              onChange={(e) => handleInputChange("paxtonUserId", e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              placeholder="Optional - For Paxton access control sync"
              data-testid="input-paxton-user-id"
            />
            <p className="text-xs text-variable">
              Links this staff member to a user in Paxton Net2 access control system
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="accessLevel" className="text-sm font-medium text-fixed">
              Access Level *
            </Label>
            <Select value={formData.accessLevel} onValueChange={(value) => handleInputChange("accessLevel", value)}>
              <SelectTrigger className="w-full px-3 py-2 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed" data-testid="select-access-level">
                <SelectValue placeholder="Select access level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">Standard User</SelectItem>
                <SelectItem value="admin">Administrator</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {zones.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="zoneId" className="text-sm font-medium text-fixed">
                Zone / Location
              </Label>
              <Select value={formData.zoneId} onValueChange={(value) => handleInputChange("zoneId", value)}>
                <SelectTrigger className="w-full px-3 py-2 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed" data-testid="select-zone">
                  <SelectValue placeholder="Select zone (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {zones.filter((z: any) => z.isActive).map((zone: any) => (
                    <SelectItem key={zone.id} value={zone.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: zone.color }} />
                        <span>{zone.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          {/* Fire Marshal Assignment */}
          <div className="space-y-3 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-200 dark:border-orange-800">
            <div className="flex items-center space-x-3">
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
            
            {/* Fire Marshal URL - shown when designated */}
            {formData.isFireMarshal && (
              <div className="pt-3 border-t border-orange-200 dark:border-orange-700">
                {staffToEdit?.fireMarshalUrlId ? (
                  <>
                    <label className="text-xs font-medium text-orange-700 dark:text-orange-300 block mb-2">
                      🔗 Fire Marshal Emergency Access URL
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`${window.location.origin}/fire-marshal/${staffToEdit.fireMarshalUrlId}`}
                        className="flex-1 px-3 py-2 text-xs bg-white dark:bg-gray-800 border border-orange-300 dark:border-orange-700 rounded-lg text-orange-900 dark:text-orange-100 font-mono"
                        data-testid="fire-marshal-url"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/fire-marshal/${staffToEdit.fireMarshalUrlId}`);
                          toast({ title: "✓ URL Copied", description: "Fire Marshal emergency access URL copied to clipboard" });
                        }}
                        className="shrink-0"
                        data-testid="button-copy-fire-marshal-url"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                      This permanent URL can be saved as a favorite for instant emergency access
                    </p>
                  </>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                    <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0" />
                    <p className="text-xs text-orange-700 dark:text-orange-300">
                      <strong>Emergency URL will be generated when you save.</strong> This permanent URL provides instant emergency access for this Fire Marshal.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PEEP - Personal Emergency Evacuation Plan */}
          <div className="space-y-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-700">
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="needsEvacuationAssistance"
                checked={formData.needsEvacuationAssistance}
                onChange={(e) => setFormData(prev => ({ ...prev, needsEvacuationAssistance: e.target.checked }))}
                className="w-4 h-4 accent-amber-600 bg-gray-100 border-gray-300 rounded"
                data-testid="checkbox-peep"
              />
              <div className="flex-1">
                <label htmlFor="needsEvacuationAssistance" className="flex items-center text-sm font-medium text-amber-800 dark:text-amber-200 cursor-pointer">
                  <span className="mr-2">♿</span>
                  Requires Evacuation Assistance (PEEP)
                </label>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Personal Emergency Evacuation Plan required — this person needs assistance during emergency evacuation. They will be highlighted on muster lists.
                </p>
              </div>
            </div>
          </div>
          
          {/* Voice Notification Settings */}
          <div className="space-y-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
            <div className="flex items-center space-x-3">
              <Phone className="h-5 w-5 text-blue-600" />
              <Label className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Voice Notifications
              </Label>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phoneNumber" className="text-sm font-medium text-fixed">
                Phone Number
              </Label>
              <Input
                id="phoneNumber"
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                placeholder=""
                data-testid="input-phone-number"
              />
              <p className="text-xs text-variable">
                Required for voice notifications (UK format: +44...)
              </p>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Label className="text-sm font-medium text-fixed">
                  Enable Voice Notifications
                </Label>
                <p className="text-xs text-variable mt-1">
                  Receive automated voice calls when visitors arrive
                </p>
              </div>
              <Switch
                checked={formData.voiceNotificationsEnabled}
                onCheckedChange={(checked) => handleInputChange("voiceNotificationsEnabled", checked.toString())}
                data-testid="switch-voice-notifications"
              />
            </div>
            
            {formData.voiceNotificationsEnabled && formData.phoneNumber && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="preferredNotificationMethod" className="text-sm font-medium text-fixed">
                    Preferred Notification Method
                  </Label>
                  <Select value={formData.preferredNotificationMethod} onValueChange={(value) => handleInputChange("preferredNotificationMethod", value)}>
                    <SelectTrigger className="w-full px-3 py-2 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed" data-testid="select-notification-method">
                      <SelectValue placeholder="Select notification method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email Only</SelectItem>
                      <SelectItem value="voice">Voice Call Only</SelectItem>
                      <SelectItem value="both">Both Email & Voice</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="voiceLanguage" className="text-sm font-medium text-fixed">
                      Voice Language
                    </Label>
                    <Select value={formData.voiceLanguage} onValueChange={(value) => handleInputChange("voiceLanguage", value)}>
                      <SelectTrigger className="w-full px-3 py-2 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed" data-testid="select-voice-language">
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en-GB">English (UK)</SelectItem>
                        <SelectItem value="en-US">English (US)</SelectItem>
                        <SelectItem value="fr-FR">French</SelectItem>
                        <SelectItem value="de-DE">German</SelectItem>
                        <SelectItem value="es-ES">Spanish</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="voiceProfile" className="text-sm font-medium text-fixed">
                      Voice Profile
                    </Label>
                    <Select value={formData.voiceProfile} onValueChange={(value) => handleInputChange("voiceProfile", value)}>
                      <SelectTrigger className="w-full px-3 py-2 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed" data-testid="select-voice-profile">
                        <SelectValue placeholder="Select voice" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en-GB-Standard-A">Standard Female (UK)</SelectItem>
                        <SelectItem value="en-GB-Standard-B">Standard Male (UK)</SelectItem>
                        <SelectItem value="en-GB-Neural2-A">Neural Female (UK)</SelectItem>
                        <SelectItem value="en-GB-Neural2-B">Neural Male (UK)</SelectItem>
                        <SelectItem value="en-GB-Neural2-C">Neural Female Alt (UK)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}
          </div>
          
          {formData.accessLevel === "admin" && (
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-fixed">
                Password * {isEditMode ? "(leave blank to keep current)" : ""}
              </Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => handleInputChange("password", e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                placeholder="Enter secure password"
                data-testid="input-password"
                required={!isEditMode}
              />
              <p className="text-xs text-variable">
                Admin and supervisor access requires password authentication
              </p>
            </div>
          )}
          
          <div className="space-y-2">
            <Label className="text-sm font-medium text-fixed">
              Photo
            </Label>
            {/* Hidden file inputs */}
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/bmp,image/svg+xml"
              onChange={handlePhotoUpload}
              className="hidden"
              id="staff-photo-upload"
              disabled={uploading}
            />
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoUpload}
              className="hidden"
              id="staff-photo-camera"
              disabled={uploading}
            />
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
                <p className="text-sm text-variable">Photo uploaded successfully</p>
                <div className="flex justify-center gap-3 mt-1">
                  <label htmlFor="staff-photo-upload" className="cursor-pointer text-xs text-blue-600 hover:underline">Change</label>
                  <span className="text-xs text-slate-400">·</span>
                  <label htmlFor="staff-photo-camera" className="cursor-pointer text-xs text-blue-600 hover:underline">Retake</label>
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-white/30 rounded-xl p-4">
                {uploading ? (
                  <div className="text-center">
                    <Upload className="mx-auto h-8 w-8 text-blue-500 mb-2 animate-pulse" />
                    <p className="text-sm text-blue-600">Uploading...</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-6">
                    <label htmlFor="staff-photo-upload" className="flex flex-col items-center gap-1 cursor-pointer group">
                      <div className="rounded-full p-2 bg-white/40 dark:bg-white/10 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 transition-colors">
                        <CloudUpload className="h-6 w-6 text-variable" />
                      </div>
                      <p className="text-xs text-variable">Upload</p>
                    </label>
                    <label htmlFor="staff-photo-camera" className="flex flex-col items-center gap-1 cursor-pointer group">
                      <div className="rounded-full p-2 bg-white/40 dark:bg-white/10 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 transition-colors">
                        <Camera className="h-6 w-6 text-variable" />
                      </div>
                      <p className="text-xs text-variable">Take Photo</p>
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="flex flex-wrap gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1 min-w-[80px] px-3 py-2 rounded-xl border border-slate-300 text-fixed font-medium hover:bg-slate-50 transition-colors"
              data-testid="button-cancel-add-staff"
            >
              Cancel
            </Button>
            {isEditMode && staffToEdit && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowTemplateSelect(true)}
                className="px-3 py-2 rounded-xl border border-blue-300 text-blue-700 font-medium hover:bg-blue-50 transition-colors text-sm"
                data-testid="button-print-id-card"
              >
                Print ID Card
              </Button>
            )}
            <Button
              type="submit"
              disabled={staffMutation.isPending || uploading}
              className="flex-1 min-w-[120px] gradient-blue text-white px-3 py-2 rounded-xl font-medium hover:shadow-lg transition-all duration-300 disabled:opacity-50"
              data-testid="button-submit-staff"
            >
              {staffMutation.isPending ? (isEditMode ? "Updating..." : "Adding...") : (isEditMode ? "Update" : "Add Staff Member")}
            </Button>
          </div>
        </form>
      </DialogContent>
      
      {/* Template Selection Dialog */}
      <Dialog open={showTemplateSelect} onOpenChange={setShowTemplateSelect}>
        <DialogContent className="w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select ID Card Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-variable mb-4">
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
                  <div className="text-xs text-variable">General employee template</div>
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
                  <div className="text-xs text-variable">Executive & supervisor template</div>
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
                  <div className="text-xs text-variable">Temporary access template</div>
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
                  <div className="text-xs text-variable">High-security access template</div>
                </div>
              </Button>
            </div>
            
            <div className="mt-6 pt-4 border-t border-slate-200">
              <div className="flex items-center gap-2 text-xs text-variable">
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
