import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Shield, Lock } from "lucide-react";
import type { Staff } from "@shared/schema";

interface StaffAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (staff: Staff) => void;
  title?: string;
  description?: string;
}

export default function StaffAuthModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  title = "Staff Authentication Required",
  description = "Please enter your admin or supervisor credentials to access this feature."
}: StaffAuthModalProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const authMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const response = await apiRequest("POST", "/api/staff/auth", credentials);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success && data.staff) {
        toast({
          title: "Authentication Successful",
          description: `Welcome, ${data.staff.firstName} ${data.staff.lastName}!`,
        });
        onSuccess(data.staff);
        handleClose();
      }
    },
    onError: (error: any) => {
      toast({
        title: "Authentication Failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setFormData({ email: "", password: "" });
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email.trim() || !formData.password.trim()) {
      toast({
        title: "Error",
        description: "Please enter both email and password",
        variant: "destructive",
      });
      return;
    }

    authMutation.mutate({
      email: formData.email.trim(),
      password: formData.password.trim(),
    });
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md glass-effect border-white/20" data-testid="staff-auth-modal">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
              <Shield className="text-white" size={24} />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-fixed">
                {title}
              </DialogTitle>
              <p className="text-sm text-variable mt-1">
                {description}
              </p>
            </div>
          </div>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="auth-email" className="text-sm font-medium text-fixed">
              Email Address
            </Label>
            <Input
              id="auth-email"
              type="email"
              required
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              placeholder="admin@company.com"
              data-testid="input-auth-email"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="auth-password" className="text-sm font-medium text-fixed">
              Password
            </Label>
            <Input
              id="auth-password"
              type="password"
              required
              value={formData.password}
              onChange={(e) => handleInputChange("password", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              placeholder="Enter your password"
              data-testid="input-auth-password"
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Lock className="text-blue-600 mt-0.5" size={16} />
              <div className="text-sm text-blue-800">
                <p className="font-medium">Access Levels Required:</p>
                <p className="text-xs mt-1">👑 Admin or 🔧 Supervisor access needed for advanced features</p>
              </div>
            </div>
          </div>
          
          <div className="flex gap-3 pt-2">
            <Button 
              type="button" 
              variant="outline"
              onClick={handleClose}
              className="flex-1 px-4 py-3 rounded-xl border border-slate-300 text-variable font-medium hover:bg-slate-50 transition-colors"
              data-testid="button-cancel-auth"
            >
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={authMutation.isPending}
              className="flex-1 gradient-blue text-white px-4 py-3 rounded-xl font-medium hover:shadow-lg transition-all duration-300 disabled:opacity-50"
              data-testid="button-submit-auth"
            >
              {authMutation.isPending ? "Authenticating..." : "Authenticate"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}