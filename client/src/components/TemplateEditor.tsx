import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { 
  Save, 
  X, 
  Eye, 
  Code2, 
  Plus, 
  FileText, 
  Building2, 
  User, 
  Users, 
  Calendar,
  Copy,
  Trash2
} from 'lucide-react';
import type { UkHSDocumentTemplate } from '@shared/schema';

interface TemplateEditorProps {
  template?: UkHSDocumentTemplate;
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
  apiEndpoint?: string; // Custom API endpoint (defaults to /api/uk-hs-documents/templates)
  title?: string; // Custom dialog title
}

// Available auto-fill variables organized by category
const VARIABLE_CATEGORIES = {
  company: {
    label: "Company Information",
    icon: Building2,
    variables: [
      { key: "company_logo", label: "Company Logo", description: "Company logo image" },
      { key: "company_name", label: "Company Name", description: "Full company name" },
      { key: "company_address", label: "Company Address", description: "Company address" },
      { key: "company_phone", label: "Company Phone", description: "Company phone number" },
      { key: "company_email", label: "Company Email", description: "Company email address" },
      { key: "company_contact_name", label: "Contact Name", description: "Company contact person name" },
      { key: "company_contact_title", label: "Contact Title", description: "Company contact person title" }
    ]
  },
  worker: {
    label: "Worker Information", 
    icon: User,
    variables: [
      { key: "worker_full_name", label: "Worker Full Name", description: "Worker's full name" },
      { key: "worker_email", label: "Worker Email", description: "Worker's email address" },
      { key: "worker_phone", label: "Worker Phone", description: "Worker's phone number" },
      { key: "worker_address", label: "Worker Address", description: "Worker's home address" },
      { key: "worker_id", label: "Worker ID", description: "Unique worker identifier" },
      { key: "worker_role", label: "Worker Role", description: "Worker's role/position" },
      { key: "experience_level", label: "Experience Level", description: "Worker's experience level" },
      { key: "worker_emergency_contact", label: "Emergency Contact", description: "Worker's emergency contact" }
    ]
  },
  contractor: {
    label: "Contractor Information",
    icon: Users,
    variables: [
      { key: "contractor_company_name", label: "Contractor Company", description: "Contractor company name" }
    ]
  },
  system: {
    label: "System & Dates",
    icon: Calendar,
    variables: [
      { key: "current_date", label: "Current Date", description: "Today's date" },
      { key: "permit_number", label: "Permit Number", description: "Unique permit number" },
      { key: "assessment_reference", label: "Assessment Reference", description: "Risk assessment reference" },
      { key: "work_description", label: "Work Description", description: "Description of work being performed" },
      { key: "work_location", label: "Work Location", description: "Location where work is performed" },
      { key: "assessor_name", label: "Assessor Name", description: "Person who assessed the risk" },
      { key: "review_date", label: "Review Date", description: "Date for review" }
    ]
  }
};

export function TemplateEditor({ 
  template, 
  isOpen, 
  onClose, 
  onSave, 
  apiEndpoint = '/api/uk-hs-documents/templates',
  title
}: TemplateEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [formData, setFormData] = useState({
    documentCode: template?.documentCode || '',
    documentName: template?.documentName || '',
    documentDescription: template?.documentDescription || '',
    templateContent: template?.templateContent || '',
    complianceCategory: template?.complianceCategory || 'contract',
    legalReference: template?.legalReference || '',
    autoFillFields: template?.autoFillFields || []
  });

  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [selectedCategory, setSelectedCategory] = useState<keyof typeof VARIABLE_CATEGORIES>('company');

  useEffect(() => {
    if (template) {
      setFormData({
        documentCode: template.documentCode || '',
        documentName: template.documentName || '',
        documentDescription: template.documentDescription || '',
        templateContent: template.templateContent || '',
        complianceCategory: template.complianceCategory || 'contract',
        legalReference: template.legalReference || '',
        autoFillFields: template.autoFillFields || []
      });
    }
  }, [template]);

  // Update mutation for existing templates
  const updateTemplateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const endpoint = apiEndpoint === '/api/uk-hs-documents/templates' 
        ? `${apiEndpoint}/${template?.id}`
        : `${apiEndpoint}/${template?.id}`;
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update template');
      }
      
      return await response.json() as UkHSDocumentTemplate;
    },
    onSuccess: () => {
      toast({
        title: "Template Updated",
        description: "Your template has been updated successfully.",
      });
      // Invalidate both regular templates and defaults queries
      queryClient.invalidateQueries({ queryKey: ['/api/uk-hs-documents/templates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/uk-hs-documents/defaults'] });
      onSave?.();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update template.",
        variant: "destructive",
      });
    },
  });

  // Create mutation for new templates  
  const createTemplateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch('/api/uk-hs-documents/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create template');
      }
      
      return await response.json() as UkHSDocumentTemplate;
    },
    onSuccess: () => {
      toast({
        title: "Template Created",
        description: "Your template has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/uk-hs-documents/templates'] });
      onSave?.();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create template.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (!formData.documentName.trim() || !formData.templateContent.trim()) {
      toast({
        title: "Validation Error",
        description: "Document name and template content are required.",
        variant: "destructive",
      });
      return;
    }

    // Extract auto-fill fields from template content
    const matches = formData.templateContent.match(/\{\{(\w+)\}\}/g);
    const autoFillFields = matches 
      ? Array.from(new Set(matches.map(match => match.replace(/[{}]/g, ''))))
      : [];

    const dataToSave = {
      ...formData,
      autoFillFields
    };

    if (template?.id) {
      updateTemplateMutation.mutate(dataToSave);
    } else {
      createTemplateMutation.mutate(dataToSave);
    }
  };

  const insertVariable = (variableKey: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = formData.templateContent;
    const variableText = `{{${variableKey}}}`;
    
    const newText = text.substring(0, start) + variableText + text.substring(end);
    
    setFormData(prev => ({
      ...prev,
      templateContent: newText
    }));

    // Set cursor position after inserted variable
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variableText.length, start + variableText.length);
    }, 0);
  };

  const copyVariable = (variableKey: string) => {
    navigator.clipboard.writeText(`{{${variableKey}}}`);
    toast({
      title: "Copied",
      description: `{{${variableKey}}} copied to clipboard`,
    });
  };

  // Generate preview with sample data
  const generatePreview = () => {
    let preview = formData.templateContent;
    
    // Sample data for preview
    const sampleData: Record<string, string> = {
      company_logo: '[COMPANY LOGO]',
      company_name: 'Acme Construction Ltd',
      company_address: '123 Business Street, London, UK',
      company_phone: '+44 20 1234 5678',
      company_email: 'info@acmeconstruction.co.uk',
      company_contact_name: 'John Smith',
      company_contact_title: 'Health & Safety Manager',
      worker_full_name: 'Sarah Johnson',
      worker_email: 'sarah.johnson@email.com',
      worker_phone: '+44 77 9876 5432',
      worker_address: '456 Worker Street, Manchester, UK',
      worker_id: 'EMP001',
      worker_role: 'Site Supervisor',
      experience_level: '5 years',
      worker_emergency_contact: 'Mike Johnson - 07700 900123',
      contractor_company_name: 'BuildRight Contractors',
      current_date: new Date().toLocaleDateString('en-GB'),
      permit_number: 'PTW-2024-001',
      assessment_reference: 'RA-2024-HSE-001',
      work_description: 'Electrical maintenance and installation',
      work_location: 'Main warehouse - Ground floor',
      assessor_name: 'Jane Williams',
      review_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB')
    };

    // Replace all variables with sample data
    Object.entries(sampleData).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      preview = preview.replace(regex, value);
    });

    return preview;
  };

  const isLoading = updateTemplateMutation.isPending || createTemplateMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {template ? 'Edit Template' : 'Create New Template'}
          </DialogTitle>
          <DialogDescription>
            {template 
              ? 'Modify the template content and settings below'
              : 'Create a new H&S document template with custom content and variables'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-6 h-[600px]">
          {/* Template Form */}
          <div className="col-span-2 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="documentName">Document Name *</Label>
                <Input
                  id="documentName"
                  value={formData.documentName}
                  onChange={(e) => setFormData(prev => ({ ...prev, documentName: e.target.value }))}
                  placeholder="e.g., Custom Safety Agreement"
                  data-testid="input-document-name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="documentCode">Document Code *</Label>
                <Input
                  id="documentCode"
                  value={formData.documentCode}
                  onChange={(e) => setFormData(prev => ({ ...prev, documentCode: e.target.value }))}
                  placeholder="e.g., custom_safety_agreement"
                  disabled={!!template}
                  data-testid="input-document-code"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="complianceCategory">Compliance Category</Label>
                <Select 
                  value={formData.complianceCategory} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, complianceCategory: value as any }))}
                >
                  <SelectTrigger data-testid="select-compliance-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immigration">Immigration</SelectItem>
                    <SelectItem value="safety_training">Safety Training</SelectItem>
                    <SelectItem value="work_permit">Work Permit</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="risk_management">Risk Management</SelectItem>
                    <SelectItem value="induction">Induction</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="legalReference">Legal Reference</Label>
                <Input
                  id="legalReference"
                  value={formData.legalReference}
                  onChange={(e) => setFormData(prev => ({ ...prev, legalReference: e.target.value }))}
                  placeholder="e.g., Health and Safety at Work Act 1974"
                  data-testid="input-legal-reference"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="documentDescription">Description</Label>
              <Textarea
                id="documentDescription"
                value={formData.documentDescription}
                onChange={(e) => setFormData(prev => ({ ...prev, documentDescription: e.target.value }))}
                placeholder="Brief description of this document template"
                className="h-16"
                data-testid="textarea-description"
              />
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab as any} className="flex-1">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="edit" className="flex items-center gap-2">
                  <Code2 className="h-4 w-4" />
                  Edit Content
                </TabsTrigger>
                <TabsTrigger value="preview" className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Preview
                </TabsTrigger>
              </TabsList>

              <TabsContent value="edit" className="mt-4">
                <div className="space-y-2">
                  <Label htmlFor="templateContent">Template Content *</Label>
                  <Textarea
                    ref={textareaRef}
                    id="templateContent"
                    value={formData.templateContent}
                    onChange={(e) => setFormData(prev => ({ ...prev, templateContent: e.target.value }))}
                    placeholder="Enter your template content here. Use {{variable_name}} for auto-fill fields."
                    className="min-h-[300px] font-mono text-sm"
                    data-testid="textarea-template-content"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use variables like {`{{company_name}}`} and {`{{worker_full_name}}`} for auto-fill functionality
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Preview with Sample Data</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[300px]">
                      <div 
                        className="prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ 
                          __html: generatePreview().replace(/\n/g, '<br>') 
                        }}
                      />
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Variable Helper Panel */}
          <div className="border-l pl-4">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">Insert Variables</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Click variables to insert them at cursor position
                </p>
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory as any}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(VARIABLE_CATEGORIES).map(([key, category]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <category.icon className="h-4 w-4" />
                          {category.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {VARIABLE_CATEGORIES[selectedCategory].variables.map((variable) => (
                    <Card key={variable.key} className="p-2 hover:bg-muted/50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{variable.label}</p>
                          <p className="text-xs text-muted-foreground">{variable.description}</p>
                          <Badge variant="outline" className="text-xs mt-1">
                            {`{{${variable.key}}}`}
                          </Badge>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyVariable(variable.key)}
                            data-testid={`button-copy-${variable.key}`}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => insertVariable(variable.key)}
                            data-testid={`button-insert-${variable.key}`}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel">
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          
          <Button onClick={handleSave} disabled={isLoading} data-testid="button-save-template">
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? 'Saving...' : template ? 'Update Template' : 'Create Template'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}