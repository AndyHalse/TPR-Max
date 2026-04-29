import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { QrCode, Type, Image, Save, Printer, Plus, Trash2 } from "lucide-react";

// Thermal pass constraints for B-FV4D (95mm x 65mm)
const THERMAL_PASS_WIDTH = 361; // 95mm at 96dpi
const THERMAL_PASS_HEIGHT = 247; // 65mm at 96dpi

interface ThermalElement {
  id: string;
  type: 'text' | 'qr_code' | 'logo' | 'line';
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  alignment?: 'left' | 'center' | 'right';
  rotation?: number;
  isVariable?: boolean; // For dynamic content
  variableType?: 'name' | 'company' | 'date' | 'time' | 'host' | 'purpose' | 'id' | 'phone' | 'email';
}

interface ThermalTemplate {
  id: string;
  name: string;
  type: 'visitor' | 'contractor';
  elements: ThermalElement[];
  description: string;
}

// Predefined thermal templates optimized for 85mm x 65mm
const THERMAL_TEMPLATES: ThermalTemplate[] = [
  {
    id: 'visitor-minimal',
    name: 'Visitor - Minimal',
    type: 'visitor',
    description: 'Clean minimal design for visitors',
    elements: [
      { id: 'header', type: 'text', x: 10, y: 10, width: 180, height: 20, content: 'VISITOR PASS', fontSize: 14, fontWeight: 'bold', alignment: 'left' },
      { id: 'logo', type: 'logo', x: 220, y: 10, width: 90, height: 30 },
      { id: 'line1', type: 'line', x: 10, y: 40, width: 300, height: 1 },
      { id: 'name', type: 'text', x: 10, y: 50, width: 180, height: 25, content: 'Visitor Name', fontSize: 16, fontWeight: 'bold', isVariable: true, variableType: 'name' },
      { id: 'company', type: 'text', x: 10, y: 75, width: 180, height: 18, content: 'Company Name', fontSize: 12, isVariable: true, variableType: 'company' },
      { id: 'date', type: 'text', x: 10, y: 95, width: 100, height: 15, content: 'Date', fontSize: 10, isVariable: true, variableType: 'date' },
      { id: 'time', type: 'text', x: 120, y: 95, width: 70, height: 15, content: 'Time', fontSize: 10, isVariable: true, variableType: 'time' },
      { id: 'host', type: 'text', x: 10, y: 115, width: 180, height: 15, content: 'Host:', fontSize: 10 },
      { id: 'host_name', type: 'text', x: 45, y: 115, width: 145, height: 15, content: 'Host Name', fontSize: 10, isVariable: true, variableType: 'host' },
      { id: 'qr', type: 'qr_code', x: 200, y: 50, width: 110, height: 110 },
      { id: 'footer', type: 'text', x: 10, y: 230, width: 200, height: 12, content: 'Return to Reception', fontSize: 8, alignment: 'left' },
      { id: 'id_footer', type: 'text', x: 220, y: 230, width: 90, height: 12, content: 'ID: #', fontSize: 8, isVariable: true, variableType: 'id' }
    ]
  },
  {
    id: 'contractor-safety',
    name: 'Contractor - Safety',
    type: 'contractor',
    description: 'Safety-focused design for contractors',
    elements: [
      { id: 'header', type: 'text', x: 10, y: 5, width: 200, height: 18, content: 'CONTRACTOR PASS', fontSize: 12, fontWeight: 'bold', alignment: 'left' },
      { id: 'logo', type: 'logo', x: 220, y: 5, width: 90, height: 25 },
      { id: 'line1', type: 'line', x: 10, y: 30, width: 300, height: 1 },
      { id: 'name', type: 'text', x: 10, y: 35, width: 180, height: 22, content: 'Contractor Name', fontSize: 14, fontWeight: 'bold', isVariable: true, variableType: 'name' },
      { id: 'company', type: 'text', x: 10, y: 60, width: 180, height: 16, content: 'Company', fontSize: 11, isVariable: true, variableType: 'company' },
      { id: 'phone', type: 'text', x: 10, y: 78, width: 180, height: 14, content: 'Phone:', fontSize: 9, isVariable: true, variableType: 'phone' },
      { id: 'date_time', type: 'text', x: 10, y: 95, width: 180, height: 14, content: 'Check-in:', fontSize: 9, isVariable: true, variableType: 'date' },
      { id: 'safety_box', type: 'line', x: 10, y: 115, width: 180, height: 50 },
      { id: 'safety_text', type: 'text', x: 15, y: 120, width: 170, height: 12, content: 'Right to Work: VALID', fontSize: 8, fontWeight: 'bold' },
      { id: 'induction_text', type: 'text', x: 15, y: 135, width: 170, height: 12, content: 'Induction: COMPLETE', fontSize: 8, fontWeight: 'bold' },
      { id: 'safety_status', type: 'text', x: 15, y: 150, width: 170, height: 12, content: 'Safety Status: CLEAR', fontSize: 8, fontWeight: 'bold' },
      { id: 'qr', type: 'qr_code', x: 200, y: 40, width: 110, height: 110 },
      { id: 'footer1', type: 'text', x: 10, y: 175, width: 300, height: 10, content: 'Pass valid for authorized areas only', fontSize: 7, alignment: 'center' },
      { id: 'footer2', type: 'text', x: 10, y: 190, width: 180, height: 10, content: 'Emergency: Report to Reception', fontSize: 7 },
      { id: 'id_footer', type: 'text', x: 220, y: 190, width: 90, height: 10, content: 'ID:', fontSize: 7, isVariable: true, variableType: 'id' }
    ]
  }
];

export function ThermalPassDesigner() {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState('visitor-minimal');
  const [passElements, setPassElements] = useState<ThermalElement[]>(THERMAL_TEMPLATES[0].elements);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [passType, setPassType] = useState<'visitor' | 'contractor'>('visitor');
  const [isPrinting, setIsPrinting] = useState(false);
  const [previewData, setPreviewData] = useState({
    name: 'John Smith',
    company: 'Tech Corp Ltd',
    host: 'Sarah Johnson',
    purpose: 'Meeting',
    phone: '+44 1234 567890',
    email: 'john@techcorp.com'
  });

  // Company data from customer database
  const [companyData, setCompanyData] = useState({
    companyName: 'Default Company',
    logoUrl: null,
    primaryColor: '#0066cc',
  });

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });



  const loadSavedDesign = async () => {
    try {
      const response = await fetch(`/api/thermal-passes/design/${passType}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.design && data.design.elements?.length > 0) {
          setPassElements(data.design.elements);
          console.log(`🎯 Loaded saved design`);
        }
      }
    } catch (error) {
      console.error('Error loading thermal pass design:', error);
    }
  };

  // Load company data from customer database with full isolation
  const loadCompanyData = async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        const settings = data.settings || data;
        
        setCompanyData({
          companyName: settings.companyName || 'Default Company',
          logoUrl: settings.logoUrl || null,
          primaryColor: settings.primaryColor || '#0066cc'
        });
        
        console.log(`🏢 Loaded company data for customer isolation`);
      }
    } catch (error) {
      console.error('Error loading company data:', error);
    }
  };



  useEffect(() => {
    loadSavedDesign();
    loadCompanyData();
  }, [passType]);


  // Handle element selection only
  const handleElementClick = (e: React.MouseEvent, elementId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Clear selection if clicking the same element, otherwise select the new one
    if (selectedElement === elementId) {
      setSelectedElement(null);
    } else {
      setSelectedElement(elementId);
    }
  };

  // Drag and drop handlers for element movement
  const handleMouseDown = (e: React.MouseEvent, elementId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const element = passElements.find(el => el.id === elementId);
    if (!element) return;

    // Select the element if not already selected
    if (selectedElement !== elementId) {
      setSelectedElement(elementId);
    }
    
    setIsDragging(true);
    
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    setDragStart({ x: mouseX, y: mouseY });
    setDragOffset({ x: mouseX - element.x, y: mouseY - element.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selectedElement) return;
    
    e.preventDefault();
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const newX = Math.max(0, Math.min(THERMAL_PASS_WIDTH - 20, mouseX - dragOffset.x));
    const newY = Math.max(0, Math.min(THERMAL_PASS_HEIGHT - 20, mouseY - dragOffset.y));
    
    updateElement(selectedElement, { x: newX, y: newY });
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      setDragStart({ x: 0, y: 0 });
      setDragOffset({ x: 0, y: 0 });
      
      // Auto-save design after drag
      autoSaveDesign();
    }
  };

  // Auto-save design functionality
  const autoSaveDesign = async () => {
    try {
      const designData = {
        elements: passElements,
        type: passType,
      };

      await fetch(`/api/thermal-passes/design/${passType}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(designData)
      });
      
      console.log(`🎯 Auto-saved design`);
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  };

  // Mouse event cleanup
  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    
    if (isDragging) {
      document.addEventListener('mouseup', handleGlobalMouseUp);
      return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
    }
  }, [isDragging]);

  const saveDesign = async () => {
    try {
      const designData = {
        elements: passElements,
        type: passType,
      };

      const response = await fetch(`/api/thermal-passes/design/${passType}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(designData)
      });

      if (response.ok) {
        toast({
          title: "Design Saved",
          description: `${passType} thermal pass design saved successfully`
        });
      } else {
        throw new Error('Failed to save design');
      }
    } catch (error) {
      toast({
        title: "Save Failed",
        description: "Could not save thermal pass design",
        variant: "destructive"
      });
    }
  };




  const handleMultiPrint = async (_method?: string) => {
    setIsPrinting(true);
    
    try {
      window.open('/api/passes/print/visitor/demo', '_blank');
      setLastPrintStatus('Demo pass opened — use browser print dialog (Ctrl+P)');
      toast({
        title: "Print Preview Opened",
        description: "Use your browser's print dialog to print the pass",
      });
    } finally {
      setIsPrinting(false);
    }
  };


  // Add new element to the pass design
  const addNewElement = (type: 'text' | 'qr_code' | 'logo' | 'line') => {
    const newElement: ThermalElement = {
      id: `element-${Date.now()}`,
      type,
      x: 50,
      y: 50,
      width: type === 'line' ? 200 : type === 'qr_code' ? 50 : 100,
      height: type === 'line' ? 2 : type === 'qr_code' ? 50 : 20,
      content: type === 'text' ? 'New Text' : undefined,
      fontSize: 12,
      fontWeight: 'normal',
      alignment: 'left',
      isVariable: false
    };

    setPassElements(prev => [...prev, newElement]);
    setSelectedElement(newElement.id);
    
    toast({
      title: "Element Added",
      description: `New ${type.replace('_', ' ')} element added to pass design`
    });
  };

  // Remove selected element
  const removeElement = () => {
    if (selectedElement) {
      setPassElements(prev => prev.filter(el => el.id !== selectedElement));
      setSelectedElement(null);
      
      toast({
        title: "Element Removed",
        description: "Element removed from pass design"
      });
    }
  };

  // Make element a database variable
  const makeElementVariable = (variableType: 'name' | 'company' | 'date' | 'time' | 'host' | 'purpose' | 'id' | 'phone' | 'email') => {
    if (selectedElement) {
      updateElement(selectedElement, {
        isVariable: true,
        variableType,
        content: `{{${variableType}}}`
      });
      
      toast({
        title: "Variable Created",
        description: `Element now shows ${variableType} from database`
      });
    }
  };


  // Auto-save functionality
  useEffect(() => {
    const autoSave = setTimeout(() => {
      if (passElements.length > 0) {
        localStorage.setItem(`thermal-pass-design-${passType}`, JSON.stringify({
          elements: passElements,
          template: selectedTemplate,
          timestamp: Date.now()
        }));
        console.log('🎯 Auto-saved design');
      }
    }, 2000); // Auto-save after 2 seconds of inactivity

    return () => clearTimeout(autoSave);
  }, [passElements, selectedTemplate, passType]);

  // Load saved design on component mount
  useEffect(() => {
    const savedDesign = localStorage.getItem(`thermal-pass-design-${passType}`);
    if (savedDesign) {
      try {
        const parsed = JSON.parse(savedDesign);
        if (parsed.elements && Array.isArray(parsed.elements)) {
          setPassElements(parsed.elements);
          if (parsed.template) {
            setSelectedTemplate(parsed.template);
          }
          console.log('🎯 Loaded saved design');
        }
      } catch (error) {
        console.warn('Failed to load saved design:', error);
      }
    }
  }, [passType]);

  const loadTemplate = (templateId: string) => {
    const template = THERMAL_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplate(templateId);
      setPassElements([...template.elements]);
      // Don't change pass type - let the user control that via tabs
      setSelectedElement(null);
      toast({
        title: "Template Loaded",
        description: `${template.name} template loaded`
      });
    }
  };

  const updateElement = (elementId: string, updates: Partial<ThermalElement>) => {
    setPassElements(prev => prev.map(el => 
      el.id === elementId ? { ...el, ...updates } : el
    ));
  };

  const selectedElementData = selectedElement ? 
    passElements.find(el => el.id === selectedElement) : null;

  // Generate unique visitor QR code with customer isolation
  const generateUniqueVisitorQR = () => {
    const timestamp = new Date().toISOString();
    const randomId = Math.random().toString(36).substring(2, 10).toUpperCase();
    const customerId = 'dev-customer-001'; // In production, this comes from session context
    
    const qrData = {
      id: `VG-${customerId.substring(0, 4)}-${randomId}`,
      visitor: previewData.name,
      company: companyData.companyName,
      timestamp,
      checkInTime: new Date().toISOString(),
      customerId,
      type: 'visitor_pass'
    };
    
    return JSON.stringify(qrData);
  };

  const renderPreviewContent = (element: ThermalElement) => {
    if (!element.isVariable) {
      // Handle static content that may reference company data
      if (element.content?.includes('{{company}}')) {
        return element.content.replace('{{company}}', companyData.companyName);
      }
      return element.content || '';
    }
    
    switch (element.variableType) {
      case 'name': return previewData.name;
      case 'company': 
        return companyData.companyName;
      case 'host': return previewData.host;
      case 'purpose': return previewData.purpose;
      case 'phone': return previewData.phone;
      case 'email': return previewData.email;
      case 'date': return new Date().toLocaleDateString('en-GB');
      case 'time': return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      case 'id': 
        // Generate unique visitor ID with customer isolation
        const timestamp = Date.now().toString().slice(-6);
        const customerId = 'dev-customer-001';
        return `${customerId.substring(4, 8).toUpperCase()}-${timestamp}`;
      default: return element.content || '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Thermal Pass Designer</h2>
          <p className="text-muted-foreground">Design and preview visitor and contractor passes (95mm × 65mm)</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={saveDesign} variant="outline">
            <Save className="h-4 w-4 mr-2" />
            Save Design
          </Button>
          
          {/* Browser Print Button */}
          <Button
            onClick={() => window.open('/api/passes/print/visitor/demo', '_blank')}
            variant="outline"
            size="sm"
            data-testid="button-browser-print"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print Demo Pass
          </Button>
          </div>
        </div>

      <Tabs value={passType} onValueChange={(value) => setPassType(value as 'visitor' | 'contractor')}>
        <TabsList>
          <TabsTrigger value="visitor">Visitor Passes</TabsTrigger>
          <TabsTrigger value="contractor">Contractor Passes</TabsTrigger>
        </TabsList>

        <TabsContent value={passType} className="space-y-6">
          {/* Main Layout - Redesigned for better UX */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            
            {/* Left Column: Pass Preview (Takes more space) */}
            <div className="xl:col-span-2">
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle>Pass Preview (95mm × 65mm)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div 
                    className="relative border-2 border-dashed border-gray-300 bg-white mx-auto select-none"
                    style={{ width: THERMAL_PASS_WIDTH, height: THERMAL_PASS_HEIGHT }}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onClick={(e) => {
                      // Clear selection when clicking background
                      if (e.target === e.currentTarget) {
                        setSelectedElement(null);
                      }
                    }}
                  >
                    {/* Grid overlay */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none">
                      <svg width="100%" height="100%">
                        <defs>
                          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="gray" strokeWidth="1"/>
                          </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#grid)" />
                      </svg>
                    </div>

                    {/* Pass Elements */}
                    {passElements.map((element) => (
                      <div
                        key={element.id}
                        className={`absolute cursor-move border-2 transition-all duration-200 ${
                          selectedElement === element.id 
                            ? 'border-blue-500 bg-blue-50 shadow-lg z-10' 
                            : 'border-transparent hover:border-gray-400 hover:shadow-md'
                        } ${isDragging && selectedElement === element.id ? 'cursor-grabbing' : 'cursor-grab'}`}
                        style={{
                          left: element.x,
                          top: element.y,
                          width: element.width,
                          height: element.height,
                          transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined
                        }}
                        onClick={(e) => handleElementClick(e, element.id)}
                        onMouseDown={(e) => handleMouseDown(e, element.id)}
                        data-testid={`element-${element.id}`}
                      >
                        {element.type === 'text' && (
                          <div 
                            className="text-black font-mono truncate"
                            style={{
                              fontSize: element.fontSize || 12,
                              fontWeight: element.fontWeight || 'normal',
                              textAlign: element.alignment || 'left',
                              lineHeight: '1.2'
                            }}
                          >
                            {renderPreviewContent(element)}
                          </div>
                        )}
                        {element.type === 'qr_code' && (
                          <div className="w-full h-full bg-white border border-gray-300 flex items-center justify-center text-xs overflow-hidden">
                            <div className="text-center">
                              <QrCode className="h-6 w-6 mx-auto mb-1" />
                              <div className="text-xs font-mono break-all">
                                {generateUniqueVisitorQR().substring(0, 20)}...
                              </div>
                            </div>
                          </div>
                        )}
                        {element.type === 'logo' && (
                          <div className="w-full h-full bg-gray-100 border border-gray-300 flex items-center justify-center text-xs overflow-hidden">
                            {companyData.logoUrl ? (
                              <img 
                                src={companyData.logoUrl} 
                                alt="Company Logo" 
                                className="max-w-full max-h-full object-contain"
                                style={{ filter: 'grayscale(100%) contrast(1.2)' }}
                              />
                            ) : (
                              <div className="text-center">
                                <Image className="h-6 w-6 mx-auto mb-1" />
                                <div className="text-xs font-bold">{companyData.companyName}</div>
                              </div>
                            )}
                          </div>
                        )}
                        {element.type === 'line' && (
                          <div className="w-full h-full bg-black"></div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Middle Column: Design Tools */}
            <div>
              <div className="space-y-4">
                {/* Templates */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Templates</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {THERMAL_TEMPLATES.filter(t => t.type === passType).map((template) => (
                      <Button
                        key={template.id}
                        variant={selectedTemplate === template.id ? "default" : "outline"}
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => loadTemplate(template.id)}
                        data-testid={`button-template-${template.id}`}
                      >
                        {template.name}
                      </Button>
                    ))}
                  </CardContent>
                </Card>

                {/* Add Elements */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Add Elements</CardTitle>
                    <p className="text-sm text-muted-foreground">Click to add new elements to your pass</p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button
                      onClick={() => addNewElement('text')}
                      size="sm"
                      variant="outline"
                      className="w-full justify-start"
                      data-testid="button-add-text"
                    >
                      <Type className="h-4 w-4 mr-2" />
                      Add Text
                    </Button>
                    
                    <Button
                      onClick={() => addNewElement('qr_code')}
                      size="sm"
                      variant="outline"
                      className="w-full justify-start"
                      data-testid="button-add-qr"
                    >
                      <QrCode className="h-4 w-4 mr-2" />
                      Add QR Code
                    </Button>
                    
                    <Button
                      onClick={() => addNewElement('logo')}
                      size="sm"
                      variant="outline"
                      className="w-full justify-start"
                      data-testid="button-add-logo"
                    >
                      <Image className="h-4 w-4 mr-2" />
                      Add Logo
                    </Button>
                    
                    <Button
                      onClick={() => addNewElement('line')}
                      size="sm"
                      variant="outline"
                      className="w-full justify-start"
                      data-testid="button-add-line"
                    >
                      ━ Add Line
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Right Column: Most Important First Approach */}
            <div className="xl:col-span-2 space-y-4">
              
              {/* 1. MOST IMPORTANT: Element Properties (when element selected) */}
              {selectedElementData && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Element Properties</CardTitle>
                      <Button
                        onClick={removeElement}
                        size="sm"
                        variant="destructive"
                        data-testid="button-remove-element"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>X Position</Label>
                        <Input
                          type="number"
                          value={selectedElementData.x}
                          onChange={(e) => updateElement(selectedElement!, { x: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <Label>Y Position</Label>
                        <Input
                          type="number"
                          value={selectedElementData.y}
                          onChange={(e) => updateElement(selectedElement!, { y: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <Label>Width</Label>
                        <Input
                          type="number"
                          value={selectedElementData.width}
                          onChange={(e) => updateElement(selectedElement!, { width: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <Label>Height</Label>
                        <Input
                          type="number"
                          value={selectedElementData.height}
                          onChange={(e) => updateElement(selectedElement!, { height: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                    </div>

                    {selectedElementData.type === 'text' && (
                      <>
                        <div>
                          <Label>Content</Label>
                          <Input
                            value={selectedElementData.content || ''}
                            onChange={(e) => updateElement(selectedElement!, { content: e.target.value })}
                            disabled={selectedElementData.isVariable}
                          />
                        </div>
                        <div>
                          <Label>Font Size</Label>
                          <Slider
                            value={[selectedElementData.fontSize || 12]}
                            onValueChange={([value]) => updateElement(selectedElement!, { fontSize: value })}
                            min={6}
                            max={24}
                            step={1}
                          />
                        </div>
                        <div>
                          <Label>Alignment</Label>
                          <Select
                            value={selectedElementData.alignment || 'left'}
                            onValueChange={(value) => updateElement(selectedElement!, { alignment: value as any })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="left">Left</SelectItem>
                              <SelectItem value="center">Center</SelectItem>
                              <SelectItem value="right">Right</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={selectedElementData.fontWeight === 'bold'}
                            onCheckedChange={(checked) => 
                              updateElement(selectedElement!, { fontWeight: checked ? 'bold' : 'normal' })
                            }
                          />
                          <Label>Bold</Label>
                        </div>
                        
                        {/* Database Variables */}
                        <div>
                          <Label className="text-sm font-medium">Make Database Variable</Label>
                          <div className="grid grid-cols-2 gap-1 mt-2">
                            <Button
                              onClick={() => makeElementVariable('name')}
                              size="sm"
                              variant="ghost"
                              className="text-xs"
                              data-testid="button-var-name"
                            >
                              👤 Name
                            </Button>
                            <Button
                              onClick={() => makeElementVariable('company')}
                              size="sm"
                              variant="ghost"
                              className="text-xs"
                              data-testid="button-var-company"
                            >
                              🏢 Company
                            </Button>
                            <Button
                              onClick={() => makeElementVariable('host')}
                              size="sm"
                              variant="ghost"
                              className="text-xs"
                              data-testid="button-var-host"
                            >
                              🤝 Host
                            </Button>
                            <Button
                              onClick={() => makeElementVariable('date')}
                              size="sm"
                              variant="ghost"
                              className="text-xs"
                              data-testid="button-var-date"
                            >
                              📅 Date
                            </Button>
                            <Button
                              onClick={() => makeElementVariable('time')}
                              size="sm"
                              variant="ghost"
                              className="text-xs"
                              data-testid="button-var-time"
                            >
                              🕐 Time
                            </Button>
                            <Button
                              onClick={() => makeElementVariable('id')}
                              size="sm"
                              variant="ghost"
                              className="text-xs"
                              data-testid="button-var-id"
                            >
                              🔖 Pass ID
                            </Button>
                          </div>
                          
                          {selectedElementData.isVariable && (
                            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                              📊 This element shows <strong>{selectedElementData.variableType}</strong> from the database
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ThermalPassDesigner;
