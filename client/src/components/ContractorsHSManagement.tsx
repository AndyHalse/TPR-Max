import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  FileText, 
  Shield,
  Plus,
  Edit
} from "lucide-react";
import { TemplateEditor } from './TemplateEditor';
import { queryClient } from "@/lib/queryClient";
import type { UkHSDocumentTemplate } from "@shared/schema";



// Glass card component
const GlassCard = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <Card className={`backdrop-blur-sm bg-white/80 border-white/30 shadow-lg ${className}`}>
    <div className="p-6">{children}</div>
  </Card>
);

export default function ContractorsHSManagement() {
  const { toast } = useToast();
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<UkHSDocumentTemplate | undefined>(undefined);
  
  // Get current user for customer isolation and admin access control
  const { data: currentUser, isError: authError } = useQuery<{ id: string; username: string; customerId: string; role?: string }>({
    queryKey: ["/api/auth/me"],
    retry: false, // Don't retry if auth fails
    staleTime: 5000,
  });

  // Use fallback customer ID if auth fails or use default dev customer
  const customerId = currentUser?.customerId || 'dev-customer-001';

  // Get current staff member to check access level for admin enforcement
  const { data: currentStaff } = useQuery<{ accessLevel: string; firstName: string; lastName: string }>({
    queryKey: ["/api/staff/me", customerId],
    enabled: !!customerId,
    retry: false,
    staleTime: 5000,
  });

  // Fetch UK H&S document templates with customer isolation
  const { data: documentTemplates = [], isLoading: templatesLoading } = useQuery<UkHSDocumentTemplate[]>({
    queryKey: ["/api/uk-hs-documents/templates", customerId],
    enabled: !!customerId,
    refetchInterval: 30000,
  });


  // Template editing handlers
  const handleCreateTemplate = () => {
    setEditingTemplate(undefined);
    setShowTemplateEditor(true);
  };

  const handleEditTemplate = (template: UkHSDocumentTemplate) => {
    setEditingTemplate(template);
    setShowTemplateEditor(true);
  };

  const handleCloseTemplateEditor = () => {
    setShowTemplateEditor(false);
    setEditingTemplate(undefined);
  };

  // Check if user has admin/supervisor access for H&S management (after all hooks)
  const hasAdminAccess = currentUser?.role === 'admin' || 
                        currentStaff?.accessLevel === 'admin' || 
                        currentStaff?.accessLevel === 'supervisor';
  
  // Show access denied if user doesn't have proper permissions
  if (!hasAdminAccess && !authError) {
    return (
      <div className="space-y-6">
        <GlassCard>
          <div className="text-center py-8">
            <Shield className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Access Restricted</h3>
            <p className="text-slate-600">
              UK Health & Safety compliance management requires administrator or supervisor access.
            </p>
            <p className="text-sm text-slate-500 mt-2">
              Contact your system administrator if you need access to this feature.
            </p>
          </div>
        </GlassCard>
      </div>
    );
  }

  // Show loading state only when data is loading (not auth failure)
  if (templatesLoading) {
    return (
      <div className="space-y-6">
        <GlassCard>
          <div className="text-center py-8">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
            <p className="mt-2 text-slate-600">Loading H&S document templates...</p>
            {authError && (
              <p className="mt-1 text-xs text-orange-600">
                Using development mode - Auth unavailable
              </p>
            )}
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <GlassCard>
        <div className="flex items-center mb-6">
          <FileText className="mr-3 text-blue-600" size={24} />
          <h3 className="text-lg font-semibold text-slate-900">H&S Document Templates</h3>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Manage UK Health & Safety document templates. These templates are used for worker compliance assignments.
        </p>
      </GlassCard>

      {/* Document Templates */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-md font-semibold text-slate-800 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            UK H&S Document Templates
          </h4>
          <Button
            onClick={handleCreateTemplate}
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white"
            data-testid="button-create-new-template"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create New Template
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {documentTemplates.map((template) => (
            <div key={template.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h5 className="font-medium text-slate-800 text-sm">{template.documentName}</h5>
                  <p className="text-xs text-slate-600 mt-1">{template.complianceCategory}</p>
                  {template.autoFillFields && template.autoFillFields.length > 0 && (
                    <Badge variant="secondary" className="mt-2 text-xs">
                      Auto-fill enabled
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEditTemplate(template)}
                    className="h-6 w-6 p-0"
                    data-testid={`button-edit-template-${template.id}`}
                  >
                    <Edit className="w-3 h-3" />
                  </Button>
                  <Shield className="w-4 h-4 text-green-600 flex-shrink-0" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>



      {/* Template Editor */}
      <TemplateEditor
        template={editingTemplate}
        isOpen={showTemplateEditor}
        onClose={handleCloseTemplateEditor}
        onSave={() => {
          // Refresh templates when saved
          queryClient.invalidateQueries({ queryKey: ["/api/uk-hs-documents/templates", customerId] });
        }}
      />
    </div>
  );
}