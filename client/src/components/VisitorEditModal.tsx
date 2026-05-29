import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { Visitor, VisitorHistory } from '@shared/schema';
import { CompanyCombobox } from '@/components/CompanyCombobox';
import { Save, X, Clock, CheckCircle, XCircle, History, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

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
    notes: visitor?.notes || '',
    needsEvacuationAssistance: visitor?.needsEvacuationAssistance ?? false,
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
        notes: visitor.notes || '',
        needsEvacuationAssistance: visitor.needsEvacuationAssistance ?? false,
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
    if (!formData.email.trim()) {
      toast({ title: 'Email required', description: 'Please enter an email address.', variant: 'destructive' });
      return;
    }
    updateVisitorMutation.mutate(formData);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const { data: companies = [] } = useQuery<string[]>({
    queryKey: ['/api/companies'],
  });

  // Fetch visitor history
  const { data: visitorHistory = [], refetch: refetchHistory } = useQuery<VisitorHistory[]>({
    queryKey: [`/api/visitors/${visitor?.id}/history`],
    enabled: !!visitor?.id,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
  
  // Refetch history when visitor changes or modal opens
  useEffect(() => {
    if (visitor?.id && open) {
      refetchHistory();
    }
  }, [visitor?.id, open, refetchHistory]);
  
  // Debug log the history
  useEffect(() => {
    if (visitorHistory.length > 0) {
      console.info(`📊 Visitor history loaded: ${visitorHistory.length} visits`, visitorHistory);
    }
  }, [visitorHistory]);

  if (!visitor) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-effect border border-white/30 max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-fixed">
            📝 Edit Visitor Profile
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="profile" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History size={16} />
              Visit History
              {visitorHistory.length > 0 && (
                <Badge variant="secondary" className="ml-1">{visitorHistory.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="flex-1 overflow-auto">
            <form onSubmit={handleSubmit} className="space-y-6">
          {/* Personal Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-fixed">Personal Information</h3>
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
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  required
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
            <h3 className="text-lg font-semibold text-fixed">Company Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="company">Company</Label>
                <CompanyCombobox
                  value={formData.company}
                  onChange={(val) => handleInputChange('company', val)}
                  companies={companies}
                  testId="input-edit-company"
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
            <h3 className="text-lg font-semibold text-fixed">Additional Information</h3>
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
              <div className="md:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  rows={3}
                  placeholder="Add any additional notes about this visitor..."
                  data-testid="textarea-edit-notes"
                />
              </div>
            </div>
          </div>

          {/* PEEP toggle */}
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-700">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.needsEvacuationAssistance}
                onChange={(e) => setFormData(prev => ({ ...prev, needsEvacuationAssistance: e.target.checked }))}
                className="mt-0.5 w-4 h-4 accent-amber-600 bg-gray-100 border-gray-300 rounded"
              />
              <div>
                <span className="text-sm font-medium text-amber-800 dark:text-amber-200">♿ Requires Evacuation Assistance (PEEP)</span>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">This visitor needs assistance during emergency evacuation and will be highlighted on muster lists.</p>
              </div>
            </label>
          </div>

          {/* Compliance Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-fixed">Compliance & Safety</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-2 p-3 border rounded-lg bg-[var(--background)]">
                <CheckCircle size={20} className={visitor.hsRulesAccepted ? 'text-green-600' : 'text-variable'} />
                <div className="flex-1">
                  <p className="text-sm font-medium">H&S Rules</p>
                  <p className="text-xs text-variable">
                    {visitor.hsRulesAccepted 
                      ? `Accepted on ${visitor.hsRulesAcceptedAt ? format(new Date(visitor.hsRulesAcceptedAt), 'dd/MM/yyyy HH:mm') : 'N/A'}`
                      : 'Not accepted'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 border rounded-lg bg-[var(--background)]">
                <CheckCircle size={20} className={visitor.inductionCompleted ? 'text-green-600' : 'text-variable'} />
                <div className="flex-1">
                  <p className="text-sm font-medium">Induction</p>
                  <p className="text-xs text-variable">
                    {visitor.inductionCompleted 
                      ? `Completed on ${visitor.inductionCompletedAt ? format(new Date(visitor.inductionCompletedAt), 'dd/MM/yyyy HH:mm') : 'N/A'}`
                      : 'Not completed'}
                  </p>
                </div>
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
      </TabsContent>

      <TabsContent value="history" className="flex-1 overflow-auto">
        <ScrollArea className="h-[500px] pr-4">
          {visitorHistory.length === 0 ? (
            <div className="text-center py-8 text-variable">
              <History size={48} className="mx-auto mb-3 text-slate-300" />
              <p className="text-lg font-medium">No visit history</p>
              <p className="text-sm">This visitor has no recorded visits yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {visitorHistory.map((visit, index) => (
                <div key={visit.id} className="border rounded-lg p-4 bg-[var(--background)]">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Clock size={16} className="text-variable" />
                      <p className="font-medium text-sm">Visit #{visitorHistory.length - index}</p>
                    </div>
                    {!visit.checkOutTime && (
                      <Badge variant="default" className="bg-green-600">Currently On-Site</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-variable">Check-In:</p>
                      <p className="font-medium">{format(new Date(visit.checkInTime), 'dd/MM/yyyy HH:mm')}</p>
                    </div>
                    {visit.checkOutTime && (
                      <div>
                        <p className="text-variable">Check-Out:</p>
                        <p className="font-medium">{format(new Date(visit.checkOutTime), 'dd/MM/yyyy HH:mm')}</p>
                      </div>
                    )}
                    {visit.hostName && (
                      <div>
                        <p className="text-variable">Host:</p>
                        <p className="font-medium">{visit.hostName}</p>
                      </div>
                    )}
                    {visit.purpose && (
                      <div>
                        <p className="text-variable">Purpose:</p>
                        <p className="font-medium">{visit.purpose}</p>
                      </div>
                    )}
                    <div className="md:col-span-2">
                      <p className="text-variable flex items-center gap-1">
                        <ShieldCheck size={13} />
                        H&amp;S Rules:
                      </p>
                      {visit.hsRulesAccepted ? (
                        <p className="font-medium text-green-700 flex items-center gap-1">
                          <CheckCircle size={14} className="flex-shrink-0" />
                          Accepted
                          {visit.hsRulesAcceptedAt && (
                            <span className="text-gray-500 font-normal ml-1">
                              — {format(new Date(visit.hsRulesAcceptedAt), 'dd/MM/yyyy HH:mm')}
                            </span>
                          )}
                        </p>
                      ) : (
                        <p className="font-medium text-amber-600 flex items-center gap-1">
                          <XCircle size={14} className="flex-shrink-0" />
                          Not accepted / Not required at time of visit
                        </p>
                      )}
                    </div>
                  </div>
                  {visit.inductionCompleted && (
                    <div className="flex gap-2 mt-3">
                      <Badge variant="secondary" className="text-xs">
                        <CheckCircle size={12} className="mr-1" />
                        Induction Completed
                      </Badge>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </TabsContent>
    </Tabs>
      </DialogContent>
    </Dialog>
  );
}