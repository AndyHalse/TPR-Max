import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Edit, RefreshCw, FileText, AlertTriangle, CheckCircle } from 'lucide-react';
import { TemplateEditor } from './TemplateEditor';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { UkHSDocumentTemplate } from '@shared/schema';

// API response type with string dates
interface UkHSDocumentTemplateResponse {
  id: string;
  customerId: string;
  documentCode: string;
  documentName: string;
  documentDescription?: string;
  templateContent: string;
  autoFillFields: string[];
  isUKHSRequired: boolean;
  complianceCategory: string;
  legalReference?: string;
  version: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DefaultTemplateManagerProps {
  className?: string;
}

export function DefaultTemplateManager({ className }: DefaultTemplateManagerProps) {
  const [editingTemplate, setEditingTemplate] = useState<UkHSDocumentTemplate | undefined>();
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const { toast } = useToast();

  // Fetch default templates
  const { data: defaultTemplates = [], isLoading, error } = useQuery<UkHSDocumentTemplateResponse[]>({
    queryKey: ['/api/uk-hs-documents/defaults'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Reset template mutation
  const resetTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await fetch(`/api/uk-hs-documents/defaults/${templateId}/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reset template');
      }

      return response.json();
    },
    onSuccess: (data, templateId) => {
      toast({
        title: "Template Reset",
        description: "Template has been reset to system default successfully.",
      });
      // Invalidate queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['/api/uk-hs-documents/defaults'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Reset Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Get the category display info
  const getCategoryInfo = (category: string) => {
    const categoryMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
      'immigration': { label: 'Immigration', variant: 'default' },
      'safety_training': { label: 'Safety Training', variant: 'secondary' },
      'work_permit': { label: 'Work Permit', variant: 'outline' },
      'contract': { label: 'Contract', variant: 'default' },
      'risk_management': { label: 'Risk Management', variant: 'secondary' },
      'induction': { label: 'Induction', variant: 'outline' },
    };
    return categoryMap[category] || { label: category, variant: 'outline' as const };
  };

  // Template editing handlers
  const handleEditTemplate = (template: UkHSDocumentTemplateResponse) => {
    // Convert string dates to Date objects for TemplateEditor
    const templateForEditor: UkHSDocumentTemplate = {
      ...template,
      createdAt: new Date(template.createdAt),
      updatedAt: new Date(template.updatedAt)
    };
    setEditingTemplate(templateForEditor);
    setShowTemplateEditor(true);
  };

  const handleCloseTemplateEditor = () => {
    setShowTemplateEditor(false);
    setEditingTemplate(undefined);
  };

  const handleResetTemplate = (templateId: string, templateName: string) => {
    if (window.confirm(`Are you sure you want to reset "${templateName}" to the system default? This will overwrite any customizations you've made.`)) {
      resetTemplateMutation.mutate(templateId);
    }
  };

  if (isLoading) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-variable" />
          <span className="ml-2 text-variable">Loading default templates...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`space-y-6 ${className}`}>
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            Failed to load default templates. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-fixed flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Default UK H&S Document Templates
          </h3>
          <p className="text-sm text-variable mt-1">
            Customize your default templates that will be used when creating new documents.
          </p>
        </div>
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
          {defaultTemplates.length} Templates
        </Badge>
      </div>

      {/* Info Alert */}
      <Alert>
        <CheckCircle className="w-4 h-4" />
        <AlertDescription>
          These are your default UK H&S document templates. Any changes you make here will be preserved and used when creating new documents.
          You can reset any template back to the system default at any time.
        </AlertDescription>
      </Alert>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {defaultTemplates.map((template: UkHSDocumentTemplateResponse) => {
          const categoryInfo = getCategoryInfo(template.complianceCategory);
          
          return (
            <Card key={template.id} className="p-4 hover:shadow-md transition-shadow border border-slate-200">
              <div className="flex flex-col h-full">
                {/* Template Header */}
                <div className="flex-1 mb-4">
                  <h4 className="font-semibold text-fixed mb-2 leading-tight">
                    {template.documentName}
                  </h4>
                  <p className="text-sm text-variable mb-3 line-clamp-2">
                    {template.documentDescription || 'No description available'}
                  </p>
                  
                  {/* Category and Legal Reference */}
                  <div className="space-y-2">
                    <Badge 
                      variant={categoryInfo.variant}
                      className="text-xs"
                    >
                      {categoryInfo.label}
                    </Badge>
                    
                    {template.legalReference && (
                      <p className="text-xs text-variable">
                        <strong>Legal Ref:</strong> {template.legalReference}
                      </p>
                    )}
                  </div>
                </div>

                {/* Auto-fill Info */}
                <div className="mb-4">
                  <div className="flex items-center gap-1 text-xs text-variable">
                    <CheckCircle className="w-3 h-3" />
                    <span>Auto-fill enabled ({template.autoFillFields.length} fields)</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleEditTemplate(template)}
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    data-testid={`button-edit-default-template-${template.id}`}
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    onClick={() => handleResetTemplate(template.id, template.documentName)}
                    size="sm"
                    variant="ghost"
                    className="px-3"
                    disabled={resetTemplateMutation.isPending}
                    data-testid={`button-reset-default-template-${template.id}`}
                  >
                    {resetTemplateMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </Button>
                </div>

                {/* Last Updated */}
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <p className="text-xs text-variable">
                    Updated: {new Date(template.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Empty State */}
      {defaultTemplates.length === 0 && (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 mx-auto mb-4 text-slate-300" />
          <h3 className="text-lg font-medium text-fixed mb-2">No Default Templates Found</h3>
          <p className="text-variable">
            Your default UK H&S document templates will appear here once they are seeded.
          </p>
        </div>
      )}

      {/* Template Editor Modal */}
      <TemplateEditor
        template={editingTemplate}
        isOpen={showTemplateEditor}
        onClose={handleCloseTemplateEditor}
        onSave={() => {
          // Refresh default templates when saved
          queryClient.invalidateQueries({ queryKey: ['/api/uk-hs-documents/defaults'] });
        }}
        // Override the API endpoint for default templates
        apiEndpoint="/api/uk-hs-documents/defaults"
        title={editingTemplate ? `Edit Default Template: ${editingTemplate.documentName}` : 'Edit Default Template'}
      />
    </div>
  );
}