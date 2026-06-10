import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  CreditCard, Save, Upload, Plus, Settings, Move, Palette, Type, 
  QrCode, Hash, User, Building2, TestTube, Trash, Eye, Printer,
  RotateCcw, Copy, Download, Grid, Ruler, Layers
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Staff } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface CardElement {
  id: string;
  type: 'photo' | 'name' | 'department' | 'employeeId' | 'company' | 'accessLevel' | 'text' | 'qrcode' | 'barcode' | 'logo';
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontWeight?: string;
  fontFamily?: string;
  color?: string;
  content?: string;
  variable?: string; // Staff database field for dynamic content
  visible?: boolean;
}

interface CardTemplate {
  id: string;
  name: string;
  description: string;
  elements: CardElement[];
  cardSize: 'CR80' | 'CR79' | 'Custom';
  background: string;
  backgroundType?: 'solid' | 'gradient' | 'image';
  backgroundImage?: string;
}

// Available staff database variables for dynamic content
const STAFF_VARIABLES = [
  { key: 'firstName', label: 'First Name', category: 'Personal' },
  { key: 'lastName', label: 'Last Name', category: 'Personal' },
  { key: 'email', label: 'Email Address', category: 'Contact' },
  { key: 'department', label: 'Department', category: 'Work' },
  { key: 'employeeId', label: 'Employee ID', category: 'Work' },
  { key: 'accessLevel', label: 'Access Level', category: 'Security' },
  { key: 'phoneNumber', label: 'Phone Number', category: 'Contact' },
  { key: 'company', label: 'Company Name', category: 'Organization' },
  { key: 'jobTitle', label: 'Job Title', category: 'Work' },
  { key: 'emergencyContact', label: 'Emergency Contact', category: 'Emergency' },
  { key: 'inductionStatus', label: 'Induction Status', category: 'Training' },
  { key: 'validUntil', label: 'Valid Until Date', category: 'Security' },
  { key: 'issueDate', label: 'Issue Date', category: 'Security' },
  { key: 'fullName', label: 'Full Name (First + Last)', category: 'Personal' },
  { key: 'custom', label: 'Custom Text', category: 'Custom' }
];

const INDUSTRY_TEMPLATES: CardTemplate[] = [
  {
    id: 'staff-standard',
    name: 'Staff Standard',
    description: 'General employee with QR code',
    cardSize: 'CR80',
    background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
    elements: [
      { id: 'photo', type: 'photo', x: 20, y: 20, width: 80, height: 80, visible: true },
      { id: 'name', type: 'text', x: 120, y: 30, width: 180, height: 24, fontSize: 16, fontWeight: 'bold', color: '#1e293b', visible: true, content: 'Full Name', variable: 'fullName' },
      { id: 'department', type: 'text', x: 120, y: 55, width: 180, height: 18, fontSize: 12, color: '#64748b', visible: true, content: 'Department', variable: 'department' },
      { id: 'employeeId', type: 'text', x: 120, y: 75, width: 180, height: 16, fontSize: 11, color: '#64748b', visible: true, content: 'Employee ID', variable: 'employeeId' },
      { id: 'company', type: 'text', x: 20, y: 115, width: 200, height: 16, fontSize: 10, color: '#64748b', visible: true, content: 'Company', variable: 'company' },
      { id: 'accessLevel', type: 'text', x: 20, y: 135, width: 200, height: 16, fontSize: 10, fontWeight: 'bold', color: '#3b82f6', visible: true, content: 'Access Level', variable: 'accessLevel' },
      { id: 'logo', type: 'logo', x: 260, y: 20, width: 50, height: 40, visible: true },
      { id: 'qrcode', type: 'qrcode', x: 260, y: 110, width: 50, height: 50, visible: true }
    ]
  },
  {
    id: 'management',
    name: 'Management Executive',
    description: 'Executive with enhanced security features',
    cardSize: 'CR80',
    background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
    elements: [
      { id: 'photo', type: 'photo', x: 20, y: 20, width: 90, height: 90, visible: true },
      { id: 'name', type: 'text', x: 130, y: 25, width: 180, height: 28, fontSize: 18, fontWeight: 'bold', color: '#1e40af', visible: true, content: 'Full Name', variable: 'fullName' },
      { id: 'department', type: 'text', x: 130, y: 55, width: 180, height: 20, fontSize: 13, fontWeight: 'bold', color: '#1e40af', visible: true, content: 'Department', variable: 'department' },
      { id: 'employeeId', type: 'text', x: 130, y: 80, width: 180, height: 16, fontSize: 11, color: '#64748b', visible: true, content: 'Employee ID', variable: 'employeeId' },
      { id: 'company', type: 'text', x: 20, y: 125, width: 200, height: 16, fontSize: 10, color: '#64748b', visible: true, content: 'Company', variable: 'company' },
      { id: 'accessLevel', type: 'text', x: 20, y: 145, width: 200, height: 18, fontSize: 12, fontWeight: 'bold', color: '#dc2626', visible: true, content: 'Access Level', variable: 'accessLevel' },
      { id: 'logo', type: 'logo', x: 240, y: 20, width: 60, height: 30, visible: true },
      { id: 'qrcode', type: 'qrcode', x: 260, y: 115, width: 45, height: 45, visible: true },
      { id: 'barcode', type: 'barcode', x: 230, y: 80, width: 80, height: 25, visible: true }
    ]
  },
  {
    id: 'contractor',
    name: 'Contractor Temporary',
    description: 'Temporary access with expiry date',
    cardSize: 'CR80',
    background: '#fef3c7',
    elements: [
      { id: 'photo', type: 'photo', x: 20, y: 20, width: 70, height: 70, visible: true },
      { id: 'name', type: 'name', x: 110, y: 25, width: 180, height: 22, fontSize: 14, fontWeight: 'bold', color: '#92400e', visible: true },
      { id: 'department', type: 'department', x: 110, y: 50, width: 180, height: 16, fontSize: 11, color: '#92400e', visible: true },
      { id: 'company', type: 'company', x: 110, y: 70, width: 180, height: 16, fontSize: 11, color: '#92400e', visible: true },
      { id: 'accessLevel', type: 'accessLevel', x: 20, y: 105, width: 200, height: 18, fontSize: 12, fontWeight: 'bold', color: '#dc2626', visible: true },
      { id: 'expiry', type: 'text', x: 20, y: 130, width: 200, height: 16, fontSize: 10, color: '#dc2626', content: 'EXPIRES: DD/MM/YYYY', visible: true },
      { id: 'qrcode', type: 'qrcode', x: 270, y: 20, width: 40, height: 40, visible: true },
      { id: 'visitor-text', type: 'text', x: 20, y: 150, width: 200, height: 16, fontSize: 10, fontWeight: 'bold', color: '#dc2626', content: 'CONTRACTOR ACCESS', visible: true }
    ]
  },
  {
    id: 'visitor',
    name: 'Visitor Pass',
    description: 'Guest access with host information',
    cardSize: 'CR80',
    background: '#ffffff',
    elements: [
      { id: 'photo', type: 'photo', x: 20, y: 20, width: 60, height: 60, visible: true },
      { id: 'name', type: 'name', x: 95, y: 25, width: 180, height: 20, fontSize: 14, fontWeight: 'bold', color: '#000000', visible: true },
      { id: 'company', type: 'company', x: 95, y: 45, width: 180, height: 16, fontSize: 11, color: '#64748b', visible: true },
      { id: 'date', type: 'text', x: 95, y: 60, width: 180, height: 14, fontSize: 10, color: '#64748b', content: new Date().toLocaleDateString(), visible: true },
      { id: 'host-label', type: 'text', x: 20, y: 95, width: 60, height: 14, fontSize: 10, color: '#64748b', content: 'Host:', visible: true },
      { id: 'host-name', type: 'text', x: 80, y: 95, width: 150, height: 14, fontSize: 10, fontWeight: 'bold', color: '#000000', content: 'Reception Desk', visible: true },
      { id: 'company-footer', type: 'text', x: 20, y: 115, width: 200, height: 14, fontSize: 10, color: '#64748b', content: 'ACS Safety & Security Ltd', visible: true },
      { id: 'visitor-badge', type: 'text', x: 20, y: 135, width: 200, height: 16, fontSize: 11, fontWeight: 'bold', color: '#3b82f6', content: 'VISITOR', visible: true },
      { id: 'qrcode', type: 'qrcode', x: 270, y: 110, width: 45, height: 45, visible: true }
    ]
  }
];

interface IdCardDesignSystemProps {
  className?: string;
}

export function IdCardDesignSystem({ className }: IdCardDesignSystemProps) {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState('staff-standard');
  const [cardElements, setCardElements] = useState<CardElement[]>(INDUSTRY_TEMPLATES[0].elements);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [selectedCardBackground, setSelectedCardBackground] = useState(INDUSTRY_TEMPLATES[0].background);
  const [backgroundType, setBackgroundType] = useState<'solid' | 'gradient' | 'image'>('gradient');
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [backgroundImage, setBackgroundImage] = useState('');
  const [showTestPrint, setShowTestPrint] = useState(false);
  const [selectedTestStaffId, setSelectedTestStaffId] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);

  // Get staff list for test printing
  const { data: staffList = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  // Load saved design on component mount
  useEffect(() => {
    const loadSavedDesign = async () => {
      try {
        console.info('🔍 Loading saved ID card design...');
        const response = await fetch('/api/idcard/design');
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.design) {
            if (data.design.elements && data.design.elements.length > 0) {
              console.info(`✅ Loaded saved design with ${data.design.elements.length} elements`);
              setCardElements(data.design.elements);
              setSelectedCardBackground(data.design.background || INDUSTRY_TEMPLATES[0].background);
            } else {
              console.info('📝 No saved design found, using default template');
            }
          }
        }
      } catch (error) {
        console.error('❌ Error loading saved design:', error);
        // Silently fail and use default template
      }
    };

    loadSavedDesign();
  }, []);

  const loadTemplate = (templateId: string) => {
    const template = INDUSTRY_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplate(templateId);
      setCardElements([...template.elements]);
      setSelectedCardBackground(template.background);
      setSelectedElement(null);
      toast({
        title: "Template Loaded",
        description: `${template.name} template loaded successfully`,
      });
    }
  };

  const getElementPreviewText = (element: CardElement): string => {
    if (element.variable && element.variable !== 'custom') {
      // Return sample data based on variable type
      switch (element.variable) {
        case 'firstName': return 'John';
        case 'lastName': return 'Smith';
        case 'fullName': return 'John Smith';
        case 'email': return 'j.smith@company.com';
        case 'department': return 'Engineering';
        case 'employeeId': return 'ENG-123';
        case 'accessLevel': return 'STAFF ACCESS';
        case 'company': return 'ACS Safety & Security Ltd';
        case 'phoneNumber': return '+44 1234 567890';
        case 'jobTitle': return 'Senior Engineer';
        case 'emergencyContact': return 'Emergency: 999';
        case 'inductionStatus': return 'COMPLETED';
        case 'validUntil': return new Date(Date.now() + 365*24*60*60*1000).toLocaleDateString('en-GB');
        case 'issueDate': return new Date().toLocaleDateString('en-GB');
        default: return element.content || 'Sample Text';
      }
    }
    
    // Legacy type-based preview text
    switch (element.type) {
      case 'name': return 'John Smith';
      case 'department': return 'Engineering';
      case 'employeeId': return 'ENG-123';
      case 'company': return 'ACS Safety & Security Ltd';
      case 'accessLevel': return 'STAFF ACCESS';
      case 'text': return element.content || 'Sample Text';
      default: return '';
    }
  };

  const updateElementProperty = (property: string, value: any) => {
    if (!selectedElement) return;
    
    setCardElements(prev => prev.map(el => 
      el.id === selectedElement 
        ? { ...el, [property]: value }
        : el
    ));
  };

  const addNewElement = (type: CardElement['type']) => {
    const newId = `${type}-${Date.now()}`;
    const newElement: CardElement = {
      id: newId,
      type,
      x: 50,
      y: 50,
      width: type === 'photo' ? 80 : type === 'logo' ? 60 : 150,
      height: type === 'photo' ? 80 : type === 'logo' ? 40 : type === 'qrcode' ? 50 : 20,
      fontSize: type === 'text' ? 12 : undefined,
      color: type === 'text' ? '#1e293b' : undefined,
      content: type === 'text' ? 'New Text' : undefined,
      variable: type === 'text' ? 'custom' : undefined,
      visible: true
    };
    
    setCardElements(prev => [...prev, newElement]);
    setSelectedElement(newId);
    
    toast({
      title: "Element Added",
      description: `New ${type} element added to card`,
    });
  };

  const updateBackground = (type: 'solid' | 'gradient' | 'image', value?: string) => {
    setBackgroundType(type);
    
    let newBackground = selectedCardBackground;
    
    switch (type) {
      case 'solid':
        newBackground = backgroundColor;
        break;
      case 'gradient':
        newBackground = 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)';
        break;
      case 'image':
        newBackground = backgroundImage || selectedCardBackground;
        break;
    }
    
    setSelectedCardBackground(newBackground);
  };

  const addElement = (type: CardElement['type']) => {
    const newElement: CardElement = {
      id: `${type}-${Date.now()}`,
      type,
      x: 50,
      y: 50,
      width: type === 'photo' ? 60 : type === 'qrcode' ? 40 : type === 'barcode' ? 80 : 120,
      height: type === 'photo' ? 60 : type === 'qrcode' ? 40 : type === 'barcode' ? 20 : 16,
      fontSize: 12,
      fontWeight: 'normal',
      color: '#000000',
      content: type === 'text' ? 'New Text' : undefined,
      visible: true
    };
    
    setCardElements(prev => [...prev, newElement]);
    setSelectedElement(newElement.id);
    
    toast({
      title: "Element Added",
      description: `${type.charAt(0).toUpperCase() + type.slice(1)} element added to card`,
    });
  };

  const removeElement = (elementId: string) => {
    setCardElements(prev => prev.filter(el => el.id !== elementId));
    setSelectedElement(null);
    toast({
      title: "Element Removed",
      description: "Element removed from card design",
    });
  };

  const handleMouseDown = (e: React.MouseEvent, elementId: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setSelectedElement(elementId);
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selectedElement) return;

    const cardRect = e.currentTarget.getBoundingClientRect();
    const newX = e.clientX - cardRect.left - dragOffset.x;
    const newY = e.clientY - cardRect.top - dragOffset.y;

    setCardElements(prev => prev.map(el => 
      el.id === selectedElement 
        ? { 
            ...el, 
            x: Math.max(0, Math.min(newX, 340 - el.width)), 
            y: Math.max(0, Math.min(newY, 216 - el.height)) 
          }
        : el
    ));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Card Designer */}
        <div className="xl:col-span-2">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <CreditCard className="mr-3 text-blue-600" size={24} />
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Professional ID Card Designer</h3>
                  <p className="text-sm text-slate-600">Industry-standard CR80 card templates with full customization</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={async () => {
                    try {
                      console.info('💾 Saving ID card design with', cardElements.length, 'elements');
                      
                      const response = await apiRequest('PUT', '/api/idcard/design', {
                        elements: cardElements,
                        background: selectedCardBackground,
                        cardSize: 'CR80'
                      });
                      const data = await response.json();
                      console.info('✅ ID card design saved successfully:', data);
                      
                      toast({
                        title: "Template Saved",
                        description: "ID card template saved to database successfully",
                      });
                    } catch (error) {
                      console.error('❌ Error saving ID card design:', error);
                      toast({
                        title: "Save Failed",
                        description: "Failed to save ID card template. Please try again.",
                        variant: "destructive",
                      });
                    }
                  }}
                  data-testid="button-save-template"
                >
                  <Save className="w-4 h-4 mr-1" />
                  Save Template
                </Button>
                <Button 
                  size="sm" 
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => setShowTestPrint(true)}
                  data-testid="button-test-print"
                >
                  <TestTube className="w-4 h-4 mr-1" />
                  Test Print
                </Button>
              </div>
            </div>

            {/* Card Preview - CR80 Standard */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium text-slate-800">Live Card Preview</h4>
                <div className="flex items-center gap-4">
                  <div className="text-xs text-slate-500">
                    CR80 Standard: 85.60 × 53.98 mm (3.375" × 2.125")
                  </div>
                  <Button 
                    variant="outline" 
                    size="xs"
                    onClick={() => setShowGrid(!showGrid)}
                    data-testid="button-toggle-grid"
                  >
                    <Grid className="w-3 h-3 mr-1" />
                    {showGrid ? 'Hide' : 'Show'} Grid
                  </Button>
                </div>
              </div>
              
              <div className="flex justify-center p-6 bg-slate-50 rounded-xl">
                <div 
                  id="id-card-preview"
                  className="relative bg-white border border-slate-200 shadow-lg rounded-lg overflow-hidden cursor-grab active:cursor-grabbing"
                  style={{ 
                    width: '340px',  // CR80 scaled: 85.60mm * 4 = 342.4px ≈ 340px
                    height: '216px', // CR80 scaled: 53.98mm * 4 = 215.92px ≈ 216px
                    background: selectedCardBackground
                  }}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  {/* Grid overlay */}
                  {showGrid && (
                    <div className="absolute inset-0 opacity-20 pointer-events-none">
                      <div className="w-full h-full" style={{
                        backgroundImage: 'linear-gradient(to right, #cbd5e1 1px, transparent 1px), linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)',
                        backgroundSize: '20px 20px'
                      }} />
                    </div>
                  )}
                  
                  {/* Company Logo Background */}
                  <div className="absolute inset-0 opacity-5">
                    <Building2 size={80} className="absolute right-4 bottom-4 text-slate-400" />
                  </div>
                  
                  {/* Dynamic ID Card Elements */}
                  {cardElements.filter(el => el.visible).map((element) => (
                    <div
                      key={element.id}
                      className={`absolute cursor-move select-none ${
                        selectedElement === element.id ? 'ring-2 ring-blue-500 ring-opacity-50' : ''
                      }`}
                      style={{
                        left: `${element.x}px`,
                        top: `${element.y}px`,
                        width: `${element.width}px`,
                        height: `${element.height}px`,
                        fontSize: `${element.fontSize}px`,
                        fontWeight: element.fontWeight,
                        color: element.color,
                        fontFamily: element.fontFamily || 'Arial, sans-serif'
                      }}
                      onMouseDown={(e) => handleMouseDown(e, element.id)}
                      onClick={() => setSelectedElement(element.id)}
                      data-testid={`card-element-${element.type}`}
                    >
                      {element.type === 'photo' ? (
                        <div className="w-full h-full bg-slate-200 rounded border flex items-center justify-center">
                          <User className="text-slate-400" size={Math.min(element.width, element.height) * 0.5} />
                        </div>
                      ) : element.type === 'logo' ? (
                        <div className="w-full h-full bg-slate-100 border-2 border-dashed border-slate-300 rounded flex items-center justify-center">
                          <Building2 className="text-slate-500" size={Math.min(element.width, element.height) * 0.4} />
                          <span className="text-xs text-slate-500 ml-1">LOGO</span>
                        </div>
                      ) : element.type === 'qrcode' ? (
                        <div className="w-full h-full bg-white border rounded flex items-center justify-center">
                          <img 
                            src=""
                            alt="QR Code"
                            className="w-full h-full object-contain"
                            ref={el => { if (!el) return; import('qrcode').then(Q => Q.toDataURL('STAFF-ID-PREVIEW', { width: element.width, margin: 1 })).then(u => { el.src = u; }); }}
                          />
                        </div>
                      ) : element.type === 'barcode' ? (
                        <div className="w-full h-full bg-white border rounded flex items-center justify-center">
                          <div className="text-center">
                            <div className="font-mono text-black text-xs leading-none">||||| ||||| |||||</div>
                            <div className="text-[6px] mt-1">*123456789*</div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-left leading-tight overflow-hidden">
                          {getElementPreviewText(element)}
                        </div>
                      )}
                      
                      {/* Resize handles when selected */}
                      {selectedElement === element.id && (
                        <>
                          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 rounded-full cursor-nw-resize border border-white" />
                          <div className="absolute -top-1 -left-1 w-3 h-3 bg-blue-500 rounded-full cursor-nw-resize border border-white" />
                        </>
                      )}
                    </div>
                  ))}
                  
                  {/* Card Border */}
                  <div className="absolute inset-0 border border-slate-300 rounded-lg pointer-events-none"></div>
                </div>
              </div>
              
              <div className="mt-4 text-center">
                <p className="text-sm text-slate-600">
                  ✨ Click elements to select • Drag to move • Resize handles on selection
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Industry standard CR80 size • Thermal printer optimized
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Design Controls */}
        <div className="space-y-6">
          {/* Quick Templates */}
          <Card className="p-4">
            <div className="flex items-center mb-4">
              <CreditCard className="mr-2 text-blue-600" size={20} />
              <h4 className="font-semibold text-slate-800">Industry Templates</h4>
            </div>
            
            <div className="space-y-2">
              {INDUSTRY_TEMPLATES.map((template) => (
                <div 
                  key={template.id}
                  className={`p-3 ${selectedTemplate === template.id ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'} border rounded-lg cursor-pointer hover:bg-slate-50 transition-colors`}
                  onClick={() => loadTemplate(template.id)}
                  data-testid={`template-${template.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="font-medium text-slate-800">{template.name}</h5>
                      <p className="text-xs text-slate-600">{template.description}</p>
                    </div>
                    {selectedTemplate === template.id && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                  </div>
                </div>
              ))}
            
              <Button 
                variant="outline" 
                className="w-full mt-3"
                onClick={() => {
                  toast({
                    title: "Feature Coming Soon",
                    description: "Custom template creation will be available in the next update",
                  });
                }}
                data-testid="button-create-template"
              >
                <Plus className="w-4 h-4 mr-1" />
                Create New Template
              </Button>
            </div>
          </Card>

          {/* Element Properties */}
          <Card className="p-4">
            <div className="flex items-center mb-4">
              <Settings className="mr-2 text-blue-600" size={20} />
              <h4 className="font-semibold text-slate-800">Element Properties</h4>
            </div>
            
            {selectedElement ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Element Type</label>
                  <div className="text-sm text-slate-600 capitalize">
                    {cardElements.find(el => el.id === selectedElement)?.type.replace('_', ' ')}
                  </div>
                </div>

                {/* Variable Selection for Text Elements */}
                {cardElements.find(el => el.id === selectedElement)?.type === 'text' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Data Source</label>
                    <Select
                      value={cardElements.find(el => el.id === selectedElement)?.variable || 'custom'}
                      onValueChange={(value) => updateElementProperty('variable', value)}
                    >
                      <SelectTrigger data-testid="select-variable">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">Custom Text</SelectItem>
                        {STAFF_VARIABLES.map((variable) => (
                          <SelectItem key={variable.key} value={variable.key}>
                            {variable.label} ({variable.category})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500 mt-1">
                      Choose staff database field or custom text
                    </p>
                  </div>
                )}

                {/* Custom Text Content (only for custom variable) */}
                {cardElements.find(el => el.id === selectedElement)?.type === 'text' && 
                 cardElements.find(el => el.id === selectedElement)?.variable === 'custom' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Text Content</label>
                    <Input
                      type="text"
                      value={cardElements.find(el => el.id === selectedElement)?.content || ''}
                      onChange={(e) => updateElementProperty('content', e.target.value)}
                      placeholder="Enter custom text"
                      data-testid="input-text-content"
                    />
                  </div>
                )}
                
                {/* Font Size */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Font Size</label>
                  <input
                    type="range"
                    min="8"
                    max="24"
                    value={cardElements.find(el => el.id === selectedElement)?.fontSize || 12}
                    onChange={(e) => updateElementProperty('fontSize', parseInt(e.target.value))}
                    className="w-full"
                    data-testid="range-font-size"
                  />
                  <div className="text-xs text-slate-500 text-center mt-1">
                    {cardElements.find(el => el.id === selectedElement)?.fontSize}px
                  </div>
                </div>
                
                {/* Font Weight */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Font Weight</label>
                  <Select
                    value={cardElements.find(el => el.id === selectedElement)?.fontWeight || 'normal'}
                    onValueChange={(value) => updateElementProperty('fontWeight', value)}
                  >
                    <SelectTrigger data-testid="select-font-weight">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="bold">Bold</SelectItem>
                      <SelectItem value="300">Light</SelectItem>
                      <SelectItem value="600">Semi Bold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Text Color */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Text Color</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={cardElements.find(el => el.id === selectedElement)?.color || '#000000'}
                      onChange={(e) => updateElementProperty('color', e.target.value)}
                      className="w-12 h-8 border rounded cursor-pointer"
                      data-testid="input-color"
                    />
                    <input
                      type="text"
                      value={cardElements.find(el => el.id === selectedElement)?.color || '#000000'}
                      onChange={(e) => updateElementProperty('color', e.target.value)}
                      className="flex-1 p-2 border rounded text-sm font-mono"
                      placeholder="#000000"
                    />
                  </div>
                </div>
                
                {/* Size Controls */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-sm font-medium text-slate-700">Width</Label>
                    <Input
                      type="number"
                      value={cardElements.find(el => el.id === selectedElement)?.width || 100}
                      onChange={(e) => updateElementProperty('width', parseInt(e.target.value))}
                      min="10"
                      max="320"
                      data-testid="input-width"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-700">Height</Label>
                    <Input
                      type="number"
                      value={cardElements.find(el => el.id === selectedElement)?.height || 20}
                      onChange={(e) => updateElementProperty('height', parseInt(e.target.value))}
                      min="10"
                      max="200"
                      data-testid="input-height"
                    />
                  </div>
                </div>
                
                {/* Position Controls */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-sm font-medium text-slate-700">X Position</Label>
                    <Input
                      type="number"
                      value={cardElements.find(el => el.id === selectedElement)?.x || 0}
                      onChange={(e) => updateElementProperty('x', parseInt(e.target.value))}
                      min="0"
                      max="300"
                      data-testid="input-x-position"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-700">Y Position</Label>
                    <Input
                      type="number"
                      value={cardElements.find(el => el.id === selectedElement)?.y || 0}
                      onChange={(e) => updateElementProperty('y', parseInt(e.target.value))}
                      min="0"
                      max="180"
                      data-testid="input-y-position"
                    />
                  </div>
                </div>
                
                {/* Text Content for text elements */}
                {cardElements.find(el => el.id === selectedElement)?.type === 'text' && (
                  <div>
                    <Label className="text-sm font-medium text-slate-700">Text Content</Label>
                    <Input
                      type="text"
                      value={cardElements.find(el => el.id === selectedElement)?.content || ''}
                      onChange={(e) => updateElementProperty('content', e.target.value)}
                      placeholder="Enter text content"
                      data-testid="input-text-content"
                    />
                  </div>
                )}
                
                <Button 
                  variant="destructive" 
                  size="sm" 
                  className="w-full"
                  onClick={() => removeElement(selectedElement)}
                  data-testid="button-remove-element"
                >
                  <Trash className="w-4 h-4 mr-1" />
                  Remove Element
                </Button>
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-8">
                Click on a card element to customize its properties
              </p>
            )}
          </Card>

          {/* Add Elements */}
          <Card className="p-4">
            <div className="flex items-center mb-4">
              <Plus className="mr-2 text-blue-600" size={20} />
              <h4 className="font-semibold text-slate-800">Add Elements</h4>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="flex items-center gap-1"
                onClick={() => addNewElement('text')}
                data-testid="button-add-text"
              >
                <Type size={14} />
                Text
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="flex items-center gap-1"
                onClick={() => addNewElement('qrcode')}
                data-testid="button-add-qr"
              >
                <QrCode size={14} />
                QR Code
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="flex items-center gap-1"
                onClick={() => addNewElement('barcode')}
                data-testid="button-add-barcode"
              >
                <Hash size={14} />
                Barcode
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="flex items-center gap-1"
                onClick={() => addNewElement('photo')}
                data-testid="button-add-photo"
              >
                <User size={14} />
                Photo
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="flex items-center gap-1"
                onClick={() => addNewElement('logo')}
                data-testid="button-add-logo"
              >
                <Building2 size={14} />
                Logo
              </Button>
            </div>
          </Card>

          {/* Card Options */}
          <Card className="p-4">
            <div className="flex items-center mb-4">
              <Palette className="mr-2 text-blue-600" size={20} />
              <h4 className="font-semibold text-slate-800">Card Options</h4>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Background Type</label>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <Button
                    variant={backgroundType === 'solid' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => updateBackground('solid')}
                    data-testid="button-bg-solid"
                  >
                    Solid
                  </Button>
                  <Button
                    variant={backgroundType === 'gradient' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => updateBackground('gradient')}
                    data-testid="button-bg-gradient"
                  >
                    Gradient
                  </Button>
                  <Button
                    variant={backgroundType === 'image' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => updateBackground('image')}
                    data-testid="button-bg-image"
                  >
                    Image
                  </Button>
                </div>
                
                {backgroundType === 'solid' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Background Color</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={backgroundColor}
                        onChange={(e) => {
                          setBackgroundColor(e.target.value);
                          setSelectedCardBackground(e.target.value);
                        }}
                        className="w-12 h-8 rounded border cursor-pointer"
                        data-testid="input-bg-color"
                      />
                      <Input
                        type="text"
                        value={backgroundColor}
                        onChange={(e) => {
                          setBackgroundColor(e.target.value);
                          setSelectedCardBackground(e.target.value);
                        }}
                        className="flex-1"
                        placeholder="#ffffff"
                        data-testid="input-bg-color-hex"
                      />
                    </div>
                  </div>
                )}

                {backgroundType === 'gradient' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Gradient Presets</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { name: 'Light Gray', value: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)' },
                        { name: 'Blue Professional', value: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)' },
                        { name: 'Corporate Blue', value: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' },
                        { name: 'Security Red', value: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)' }
                      ].map((bg) => (
                        <div
                          key={bg.name}
                          className={`w-full h-10 rounded cursor-pointer border-2 p-1 ${
                            selectedCardBackground === bg.value ? 'border-blue-500' : 'border-slate-200'
                          }`}
                          style={{ background: bg.value }}
                          onClick={() => setSelectedCardBackground(bg.value)}
                          title={bg.name}
                          data-testid={`gradient-${bg.name.toLowerCase().replace(/\\s+/g, '-')}`}
                        >
                          <div className="text-xs text-center text-slate-600 font-medium pt-1">
                            {bg.name}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {backgroundType === 'image' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Background Image</label>
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center">
                      <Upload className="mx-auto text-slate-400 mb-2" size={24} />
                      <p className="text-sm text-slate-600 mb-2">Drop image here or click to upload</p>
                      <Button variant="outline" size="sm">
                        Choose Image
                      </Button>
                      <p className="text-xs text-slate-500 mt-2">Recommended: 340x216px (CR80 aspect ratio)</p>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Quick Actions</label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowGrid(!showGrid);
                      toast({
                        title: showGrid ? "Grid Hidden" : "Grid Shown",
                        description: "Design grid toggled for precise element positioning",
                      });
                    }}
                    data-testid="button-toggle-grid"
                  >
                    <Grid size={14} className="mr-1" />
                    {showGrid ? 'Hide' : 'Show'} Grid
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCardElements(INDUSTRY_TEMPLATES[0].elements);
                      setSelectedCardBackground(INDUSTRY_TEMPLATES[0].background);
                      toast({
                        title: "Card Reset",
                        description: "Card elements reset to default template",
                      });
                    }}
                    data-testid="button-reset-card"
                  >
                    <RotateCcw size={14} className="mr-1" />
                    Reset Card
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Test Print Modal */}
      <Dialog open={showTestPrint} onOpenChange={(open) => {
        setShowTestPrint(open);
        if (!open) {
          setSelectedTestStaffId(''); // Clear selection when modal closes
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TestTube className="text-blue-600" size={20} />
              Test Print ID Card
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">Select Staff Member</Label>
              <Select value={selectedTestStaffId} onValueChange={setSelectedTestStaffId}>
                <SelectTrigger data-testid="select-test-staff">
                  <SelectValue placeholder="Choose a staff member to print" />
                </SelectTrigger>
                <SelectContent>
                  {staffList.map((staff) => (
                    <SelectItem key={staff.id} value={staff.id.toString()}>
                      {staff.firstName} {staff.lastName} - {staff.department}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => setShowTestPrint(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                onClick={async () => {
                  try {
                    if (!selectedTestStaffId) {
                      toast({
                        title: "Staff Selection Required",
                        description: "Please select a staff member to print",
                        variant: "destructive",
                      });
                      return;
                    }

                    const response = await apiRequest('POST', '/api/idcard/test-print', {
                      staffId: selectedTestStaffId,
                      design: cardElements,
                      background: selectedCardBackground
                    });
                    const result = await response.json();
                    
                    setShowTestPrint(false);
                    toast({
                      title: "🖨️ Test Print Successful",
                      description: result.message,
                    });
                  } catch (error) {
                    toast({
                      title: "Test Print Failed",
                      description: "Failed to send test print to printer",
                      variant: "destructive",
                    });
                  }
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                data-testid="button-confirm-test-print"
              >
                <Printer className="w-4 h-4 mr-1" />
                Print Test Card
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}