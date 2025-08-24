import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { Visitor } from '@shared/schema';
import { Save, X } from 'lucide-react';

interface VisitorEditModalProps {
  visitor: Visitor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VisitorEditModal({ visitor, open, onOpenChange }: VisitorEditModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    firstName: visitor?.firstName || '',
    lastName: visitor?.lastName || '',
    email: visitor?.email || '',
    phoneNumber: visitor?.phoneNumber || '',
    mobileNumber: visitor?.mobileNumber || '',
    company: visitor?.company || '',
    jobTitle: visitor?.jobTitle || '',
    address: visitor?.address || '',
    purpose: visitor?.purpose || '',
    carRegistration: visitor?.carRegistration || '',
  });

  // Update form data when visitor changes
  useEffect(() => {
    if (visitor) {
      setFormData({
        firstName: visitor.firstName || '',
        lastName: visitor.lastName || '',
        email: visitor.email || '',
        phoneNumber: visitor.phoneNumber || '',
        mobileNumber: visitor.mobileNumber || '',
        company: visitor.company || '',
        jobTitle: visitor.jobTitle || '',
        address: visitor.address || '',
        purpose: visitor.purpose || '',
        carRegistration: visitor.carRegistration || '',
      });
    }
  }, [visitor]);

  const updateVisitorMutation = useMutation({
    mutationFn: async (updates: Partial<Visitor>) => {
      if (!visitor) throw new Error('No visitor selected');
      const response = await apiRequest('PUT', `/api/visitors/${visitor.id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/visitors'] });
      toast({
        title: 'Success',
        description: 'Visitor profile updated successfully!',
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update visitor profile',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateVisitorMutation.mutate(formData);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!visitor) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-effect border border-white/30 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800">
            📝 Edit Visitor Profile
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Personal Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-800">Personal Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => handleInputChange('firstName', e.target.value)}
                  required
                  data-testid="input-edit-first-name"
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => handleInputChange('lastName', e.target.value)}
                  required
                  data-testid="input-edit-last-name"
                />
              </div>
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  data-testid="input-edit-email"
                />
              </div>
              <div>
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                  data-testid="input-edit-phone"
                />
              </div>
              <div>
                <Label htmlFor="mobileNumber">Mobile Number</Label>
                <Input
                  id="mobileNumber"
                  value={formData.mobileNumber}
                  onChange={(e) => handleInputChange('mobileNumber', e.target.value)}
                  data-testid="input-edit-mobile"
                />
              </div>
              <div>
                <Label htmlFor="jobTitle">Job Title</Label>
                <Input
                  id="jobTitle"
                  value={formData.jobTitle}
                  onChange={(e) => handleInputChange('jobTitle', e.target.value)}
                  data-testid="input-edit-job-title"
                />
              </div>
            </div>
          </div>

          {/* Company Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-800">Company Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  value={formData.company}
                  onChange={(e) => handleInputChange('company', e.target.value)}
                  data-testid="input-edit-company"
                />
              </div>
              <div>
                <Label htmlFor="purpose">Purpose of Visit</Label>
                <Input
                  id="purpose"
                  value={formData.purpose}
                  onChange={(e) => handleInputChange('purpose', e.target.value)}
                  data-testid="input-edit-purpose"
                />
              </div>
            </div>
          </div>

          {/* Additional Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-800">Additional Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="carRegistration">Car Registration</Label>
                <Input
                  id="carRegistration"
                  value={formData.carRegistration}
                  onChange={(e) => handleInputChange('carRegistration', e.target.value)}
                  data-testid="input-edit-car-registration"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  rows={3}
                  data-testid="textarea-edit-address"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateVisitorMutation.isPending}
              data-testid="button-cancel-edit"
            >
              <X size={16} className="mr-1" />
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateVisitorMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-save-visitor"
            >
              <Save size={16} className="mr-1" />
              {updateVisitorMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}