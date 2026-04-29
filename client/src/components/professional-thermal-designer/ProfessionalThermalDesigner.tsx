import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Save, Printer, Download, Grid, Eye, EyeOff, Lock, Unlock, Copy, Trash2, RotateCcw, Zap, Settings, FileText, QrCode, Image, Minus, Square, BarChart3 } from "lucide-react";

import { ThermalElement, ThermalPassTemplate } from "./ThermalElement";
import { ElementPropertyPanel } from "./ElementPropertyPanel";
import { PROFESSIONAL_THERMAL_TEMPLATES, getTemplatesByCategory, getTemplateById } from "./ThermalTemplates";

// Pass dimensions for thermal printers (95mm x 65mm at 203 DPI)
const PASS_WIDTH = 361;
const PASS_HEIGHT = 247;

export function ProfessionalThermalDesigner() {
  const { toast } = useToast();
  
  // Design state
  const [currentTemplate, setCurrentTemplate] = useState<ThermalPassTemplate>(PROFESSIONAL_THERMAL_TEMPLATES[0]);
  const [elements, setElements] = useState<ThermalElement[]>(PROFESSIONAL_THERMAL_TEMPLATES[0].elements);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  
  // UI state
  const [showGrid, setShowGrid] = useState(true);
  const [viewMode, setViewMode] = useState<'design' | 'preview'>('design');
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // Printer state
  const [selectedPrinter, setSelectedPrinter] = useState<'tec' | 'zebra'>('tec');
  const [printerSettings, setPrinterSettings] = useState({
    printSpeed: 'medium' as 'slow' | 'medium' | 'fast',
    printDensity: 'normal' as 'light' | 'normal' | 'dark',
    thermalAdjustment: 0,
    blackMarkSensing: true,
    cutAfterPrint: true
  });
  
  // Company data (would come from API in real app)
  const [companyData] = useState({
    companyName: 'Default Company',
    logoUrl: null,
    primaryColor: '#0066cc',
  });

  // Preview data for testing
  const [previewData] = useState({
    visitor_name: 'John Smith',
    visitor_company: 'Tech Solutions Ltd',
    visitor_phone: '+44 1234 567890',
    visitor_email: 'john@techsolutions.com',
    host_name: 'Sarah Johnson',
    purpose: 'Business Meeting',
    visitor_id: 'VG-DEMO-001234',
    badge_number: 'B001234',
    check_in_time: new Date().toLocaleString('en-GB'),
    expiry_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('en-GB')
  });

  // Print code generation
  const generatePrintCode = async () => {
    try {
      const response = await fetch('/api/thermal/generate-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          printerType: selectedPrinter,
          elements: elements,
          data: previewData,
          settings: printerSettings,
          customerId: 'dev-customer-001'
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        
        // Download the generated code
        const blob = new Blob([result.code], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `thermal-pass-${selectedPrinter}-${Date.now()}.${selectedPrinter === 'tec' ? 'tpl' : 'zpl'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        toast({
          title: "Print Code Generated",
          description: `${selectedPrinter === 'tec' ? 'TPL' : 'ZPL'} code generated and downloaded successfully.`
        });
      } else {
        throw new Error('Failed to generate print code');
      }
    } catch (error) {
      toast({
        title: "Generation Failed",
        description: "Failed to generate printer code. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Queue print function for Windows service
  const queuePrint = async () => {
    try {
      // Generate print data with all required fields for TCPL
      const visitorData = {
        name: previewData.visitorName,
        company: previewData.company,
        host: previewData.hostName,
        purpose: 'Meeting',
        passId: previewData.visitorId || `VS${Date.now().toString().slice(-8)}`
      };
      
      // Queue the print job using the new TCPL system
      const response = await fetch('/api/thermal/queue-print', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: 'dev-customer-001',
          elements: elements,
          visitorData: visitorData,
          printerSettings: {
            printDensity: printerSettings.printDensity === 'light' ? 5 : 
                         printerSettings.printDensity === 'dark' ? 15 : 10,
            printSpeed: printerSettings.printSpeed === 'slow' ? 2 : 
                       printerSettings.printSpeed === 'fast' ? 8 : 5,
            darkness: 15,
            cutterEnabled: true
          },
          priority: 5
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        toast({
          title: "Print Job Queued",
          description: `Job ${result.jobId} queued successfully. Windows service will print it via ${selectedPrinter === 'tec' ? 'TCPL' : 'ZPL'} commands.`
        });
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to queue print job');
      }
    } catch (error) {
      toast({
        title: "Queue Failed",
        description: error instanceof Error ? error.message : "Failed to queue print job.",
        variant: "destructive"
      });
    }
  };

  // Test print function
  const testPrint = async () => {
    try {
      const response = await fetch('/api/thermal/test-print', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          printerType: selectedPrinter,
          elements: elements,
          data: previewData,
          settings: printerSettings,
          customerId: 'dev-customer-001'
        })
      });
      
      if (response.ok) {
        toast({
          title: "Test Print Sent",
          description: `Test print job sent to ${selectedPrinter === 'tec' ? 'TEC/Toshiba' : 'Zebra'} printer.`
        });
      } else {
        throw new Error('Test print failed');
      }
    } catch (error) {
      toast({
        title: "Print Failed",
        description: "Test print failed. Check printer connection.",
        variant: "destructive"
      });
    }
  };

  // Windows service management functions
  const downloadWindowsService = async () => {
    try {
      // Create a direct download link for better browser compatibility
      const downloadLink = document.createElement('a');
      downloadLink.href = '/api/windows-service/download';
      downloadLink.download = 'VisiGatePrintService-Setup.msi';
      downloadLink.style.display = 'none';
      
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      toast({
        title: "Service Download Started",
        description: "VisiGate Print Service installer download started. Install and configure with your API token."
      });
      
      console.log('📦 Windows service download initiated');
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Download Failed",
        description: "Failed to download Windows service. Please try again.",
        variant: "destructive"
      });
    }
  };

  const viewServiceInstructions = () => {
    // Open installation guide in new window
    window.open('/service-installation-guide', '_blank');
  };

  const generateServiceToken = async () => {
    try {
      const response = await fetch('/api/print-service/generate-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: 'dev-customer-001',
          serviceName: 'Reception Desk Printer',
          location: 'Main Reception'
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        
        // Copy token to clipboard
        navigator.clipboard.writeText(result.apiToken);
        
        toast({
          title: "Service Token Generated",
          description: "API token copied to clipboard. Paste this into the Windows service configuration."
        });
      } else {
        throw new Error('Token generation failed');
      }
    } catch (error) {
      toast({
        title: "Token Generation Failed",
        description: "Failed to generate service token. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Load template
  const loadTemplate = (templateId: string) => {
    const template = getTemplateById(templateId);
    if (template) {
      setCurrentTemplate(template);
      setElements([...template.elements]);
      setSelectedElement(null);
      toast({
        title: "Template Loaded",
        description: `Loaded "${template.name}" template successfully.`
      });
    }
  };

  // Element management
  const addElement = (type: ThermalElement['type']) => {
    const newElement: Partial<ThermalElement> = {
      id: `element_${Date.now()}`,
      type,
      x: 50,
      y: 50,
      width: type === 'qr_code' ? 80 : type === 'line' ? 200 : 120,
      height: type === 'qr_code' ? 80 : type === 'line' ? 2 : 30,
      rotation: 0,
      visible: true,
      locked: false,
      layer: Math.max(...elements.map(e => e.layer), 0) + 1
    };

    // Add type-specific defaults
    switch (type) {
      case 'text':
        Object.assign(newElement, {
          contentType: 'fixed',
          fixedContent: 'Sample Text',
          fontFamily: 'thermal_default',
          fontSize: 12,
          fontWeight: 'normal',
          fontStyle: 'normal',
          alignment: 'left',
          lineHeight: 1.2,
          letterSpacing: 0,
          textColor: '#000000',
          wordWrap: false,
          textOverflow: 'clip',
          thermalIntensity: 6,
          printQuality: 'normal'
        });
        break;
      
      case 'qr_code':
        Object.assign(newElement, {
          dataType: 'visitor_data',
          includeFields: {
            visitor_id: true,
            visitor_name: true,
            company: true,
            check_in_time: true,
            expiry_time: false,
            host: false,
            purpose: false,
            phone: false,
            email: false,
            custom_fields: false
          },
          errorCorrection: 'M',
          quietZone: 2,
          moduleSize: 1,
          printMethod: 'native_qr',
          thermalIntensity: 7
        });
        break;
      
      case 'image':
        Object.assign(newElement, {
          imageType: 'company_logo',
          scaling: 'fit',
          alignment: 'center',
          brightness: 0,
          contrast: 0,
          invert: false,
          dithering: 'floyd_steinberg',
          thermalIntensity: 6,
          printQuality: 'high'
        });
        break;
      
      case 'line':
        Object.assign(newElement, {
          thickness: 2,
          style: 'solid',
          color: '#000000',
          lineType: 'horizontal',
          thermalIntensity: 6
        });
        break;
      
      case 'rectangle':
        Object.assign(newElement, {
          borderWidth: 2,
          borderStyle: 'solid',
          borderColor: '#000000',
          cornerRadius: 0,
          thermalIntensity: 6,
          filled: false
        });
        break;
      
      case 'barcode':
        Object.assign(newElement, {
          dataType: 'visitor_id',
          barcodeType: 'code128',
          showText: true,
          textPosition: 'below',
          barHeight: 20,
          narrowBarWidth: 1,
          wideBarWidth: 2,
          thermalIntensity: 7,
          printQuality: 'high'
        });
        break;
    }

    const updatedElements = [...elements, newElement as ThermalElement];
    setElements(updatedElements);
    setSelectedElement(newElement.id!);
  };

  const updateElement = (updatedElement: ThermalElement) => {
    const updatedElements = elements.map(el => 
      el.id === updatedElement.id ? updatedElement : el
    );
    setElements(updatedElements);
  };

  const deleteElement = (elementId: string) => {
    const updatedElements = elements.filter(el => el.id !== elementId);
    setElements(updatedElements);
    if (selectedElement === elementId) {
      setSelectedElement(null);
    }
  };

  // Drag and drop
  const handleElementMouseDown = (e: React.MouseEvent, elementId: string) => {
    if (elements.find(el => el.id === elementId)?.locked) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    setSelectedElement(elementId);
    setIsDragging(true);
    
    const element = elements.find(el => el.id === elementId);
    if (element) {
      const rect = e.currentTarget.getBoundingClientRect();
      const parentRect = e.currentTarget.parentElement!.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - parentRect.left - element.x,
        y: e.clientY - parentRect.top - element.y
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selectedElement) return;
    
    const element = elements.find(el => el.id === selectedElement);
    if (!element || element.locked) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(PASS_WIDTH - element.width, e.clientX - rect.left - dragOffset.x));
    const y = Math.max(0, Math.min(PASS_HEIGHT - element.height, e.clientY - rect.top - dragOffset.y));
    
    updateElement({ ...element, x, y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Save design to database
  const saveDesign = async () => {
    try {
      const response = await fetch('/api/thermal/designs/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: 'dev-customer-001',
          templateId: currentTemplate.id,
          templateName: currentTemplate.name,
          elements: elements,
          printerSettings: printerSettings,
          metadata: {
            width: PASS_WIDTH,
            height: PASS_HEIGHT,
            printerType: selectedPrinter,
            backgroundColor: currentTemplate.backgroundColor,
            borderEnabled: currentTemplate.borderEnabled,
            borderWidth: currentTemplate.borderWidth,
            borderColor: currentTemplate.borderColor
          }
        })
      });
      
      if (response.ok) {
        toast({
          title: "Design Saved",
          description: "Your pass design has been saved successfully."
        });
      } else {
        throw new Error('Failed to save design');
      }
    } catch (error) {
      toast({
        title: "Save Failed",
        description: "Failed to save the design. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Render element content based on type and data
  const renderElementContent = (element: ThermalElement) => {
    switch (element.type) {
      case 'text':
        const textEl = element as any;
        let content = '';
        if (textEl.contentType === 'variable' && textEl.variableSource) {
          const value = previewData[textEl.variableSource as keyof typeof previewData] || textEl.variableSource;
          content = String(value);
        } else {
          content = textEl.fixedContent || 'Text';
        }
        return (
          <div 
            className="w-full h-full flex items-center"
            style={{
              fontSize: `${textEl.fontSize || 12}px`,
              fontWeight: textEl.fontWeight || 'normal',
              fontStyle: textEl.fontStyle || 'normal',
              fontFamily: textEl.fontFamily === 'thermal_default' ? 'monospace' : textEl.fontFamily || 'sans-serif',
              textAlign: textEl.alignment || 'left',
              justifyContent: textEl.alignment === 'center' ? 'center' : textEl.alignment === 'right' ? 'flex-end' : 'flex-start',
              lineHeight: textEl.lineHeight || 1.2,
              letterSpacing: `${textEl.letterSpacing || 0}px`,
              color: textEl.textColor || '#000000',
              backgroundColor: textEl.backgroundColor || 'transparent',
              padding: '2px',
              overflow: textEl.wordWrap ? 'visible' : 'hidden',
              wordBreak: textEl.wordWrap ? 'break-word' : 'normal',
              whiteSpace: textEl.wordWrap ? 'normal' : 'nowrap',
              textOverflow: textEl.textOverflow || 'clip'
            }}
          >
            {content}
          </div>
        );
      
      case 'qr_code':
        return (
          <div className="w-full h-full bg-white border border-gray-300 flex items-center justify-center">
            <QrCode className="h-6 w-6" />
          </div>
        );
      
      case 'image':
        const imgEl = element as any;
        if (imgEl.imageType === 'company_logo' && companyData.logoUrl) {
          return (
            <img 
              src={companyData.logoUrl} 
              alt="Logo" 
              className="w-full h-full object-contain"
            />
          );
        }
        return (
          <div className="w-full h-full bg-gray-100 border border-gray-300 flex items-center justify-center">
            <Image className="h-4 w-4" />
          </div>
        );
      
      case 'line':
        const lineEl = element as any;
        return (
          <div 
            className={`bg-black ${lineEl.lineType === 'horizontal' ? 'w-full' : 'h-full'}`}
            style={{ 
              height: lineEl.lineType === 'horizontal' ? `${lineEl.thickness}px` : '100%',
              width: lineEl.lineType === 'vertical' ? `${lineEl.thickness}px` : '100%'
            }}
          />
        );
      
      case 'rectangle':
        const rectEl = element as any;
        return (
          <div 
            className="w-full h-full border"
            style={{
              borderWidth: `${rectEl.borderWidth}px`,
              borderColor: rectEl.borderColor,
              borderRadius: `${rectEl.cornerRadius}px`,
              backgroundColor: rectEl.filled ? rectEl.fillColor : 'transparent'
            }}
          />
        );
      
      case 'barcode':
        return (
          <div className="w-full h-full bg-white border border-gray-300 flex items-center justify-center">
            <BarChart3 className="h-4 w-4" />
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Professional Thermal Pass Designer</h2>
          <p className="text-muted-foreground">
            Design thermal passes for TEC/Toshiba and Zebra printers (95mm × 65mm)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={saveDesign}>
            <Save className="h-4 w-4 mr-2" />
            Save Design
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button size="sm" onClick={testPrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print Test
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Templates and Tools */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Templates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Load Template</Label>
                <Select value={currentTemplate.id} onValueChange={loadTemplate}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROFESSIONAL_THERMAL_TEMPLATES.map(template => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Badge variant="outline" className="w-full justify-center text-xs">
                {currentTemplate.category.toUpperCase()}
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Add Elements</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start text-xs"
                onClick={() => addElement('text')}
              >
                <FileText className="h-3 w-3 mr-2" />
                Text Element
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start text-xs"
                onClick={() => addElement('qr_code')}
              >
                <QrCode className="h-3 w-3 mr-2" />
                QR Code
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start text-xs"
                onClick={() => addElement('image')}
              >
                <Image className="h-3 w-3 mr-2" />
                Image/Logo
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start text-xs"
                onClick={() => addElement('line')}
              >
                <Minus className="h-3 w-3 mr-2" />
                Line
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start text-xs"
                onClick={() => addElement('rectangle')}
              >
                <Square className="h-3 w-3 mr-2" />
                Rectangle
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start text-xs"
                onClick={() => addElement('barcode')}
              >
                <BarChart3 className="h-3 w-3 mr-2" />
                Barcode
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">View Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Show Grid</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowGrid(!showGrid)}
                  className="h-6 w-6 p-0"
                >
                  <Grid className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Mode</Label>
                <Select value={viewMode} onValueChange={(value: any) => setViewMode(value)}>
                  <SelectTrigger className="h-6 w-20 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="design">Design</SelectItem>
                    <SelectItem value="preview">Preview</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Printer className="h-4 w-4" />
                Printer Setup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">Printer Type</Label>
                <Select value={selectedPrinter} onValueChange={(value: any) => setSelectedPrinter(value)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tec">TEC/Toshiba B-FV4D</SelectItem>
                    <SelectItem value="zebra">Zebra Thermal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs">Print Quality</Label>
                <Select 
                  value={printerSettings.printDensity} 
                  onValueChange={(value: any) => setPrinterSettings({...printerSettings, printDensity: value})}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs">Print Speed</Label>
                <Select 
                  value={printerSettings.printSpeed} 
                  onValueChange={(value: any) => setPrinterSettings({...printerSettings, printSpeed: value})}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slow">Slow</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="fast">Fast</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="pt-3 space-y-2">
                <Button 
                  onClick={generatePrintCode}
                  className="w-full h-8 text-xs"
                  size="sm"
                >
                  <Download className="h-3 w-3 mr-2" />
                  Generate {selectedPrinter === 'tec' ? 'TPL' : 'ZPL'} Code
                </Button>
                <Button 
                  onClick={queuePrint}
                  className="w-full h-8 text-xs"
                  size="sm"
                  variant="default"
                >
                  <Plus className="h-3 w-3 mr-2" />
                  Queue Print Job
                </Button>
                <Button 
                  onClick={testPrint}
                  variant="outline"
                  className="w-full h-8 text-xs"
                  size="sm"
                >
                  <Printer className="h-3 w-3 mr-2" />
                  Test Print
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Download className="h-4 w-4" />
                Windows Service
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-gray-600 mb-3">
                For reliable local printing, install our Windows service on your reception PC.
              </div>
              
              <div className="space-y-2">
                <Button 
                  onClick={downloadWindowsService}
                  className="w-full h-8 text-xs"
                  size="sm"
                  variant="outline"
                >
                  <Download className="h-3 w-3 mr-2" />
                  Download VisiGate Print Service
                </Button>
                
                <Button 
                  onClick={viewServiceInstructions}
                  className="w-full h-8 text-xs"
                  size="sm"
                  variant="ghost"
                >
                  <FileText className="h-3 w-3 mr-2" />
                  Installation Guide
                </Button>
                
                <Button 
                  onClick={generateServiceToken}
                  className="w-full h-8 text-xs"
                  size="sm"
                  variant="ghost"
                >
                  <Settings className="h-3 w-3 mr-2" />
                  Generate Service Token
                </Button>
              </div>
              
              {/* Service Status */}
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Service Status:</span>
                  <Badge variant="outline" className="text-xs">
                    <div className="h-2 w-2 bg-gray-400 rounded-full mr-1"></div>
                    Not Connected
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pass Design Area */}
        <div className="xl:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                Pass Design
                <Badge variant="outline" className="text-xs">
                  {PASS_WIDTH} × {PASS_HEIGHT}px
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div 
                className="relative border-2 border-dashed border-gray-300 bg-white mx-auto select-none"
                style={{ 
                  width: PASS_WIDTH, 
                  height: PASS_HEIGHT,
                  backgroundColor: currentTemplate.backgroundColor 
                }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    setSelectedElement(null);
                  }
                }}
              >
                {/* Grid overlay */}
                {showGrid && (
                  <div className="absolute inset-0 opacity-20 pointer-events-none">
                    <svg width="100%" height="100%">
                      <defs>
                        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="gray" strokeWidth="0.5"/>
                        </pattern>
                      </defs>
                      <rect width="100%" height="100%" fill="url(#grid)" />
                    </svg>
                  </div>
                )}

                {/* Template border */}
                {currentTemplate.borderEnabled && (
                  <div 
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      border: `${currentTemplate.borderWidth}px solid ${currentTemplate.borderColor}`
                    }}
                  />
                )}

                {/* Elements */}
                {elements
                  .filter(el => el.visible)
                  .sort((a, b) => a.layer - b.layer)
                  .map((element) => (
                    <div
                      key={element.id}
                      className={`absolute transition-all duration-200 ${
                        !element.locked ? 'cursor-move' : 'cursor-not-allowed'
                      } ${
                        selectedElement === element.id 
                          ? 'ring-2 ring-blue-500 ring-opacity-75 bg-blue-50 bg-opacity-20' 
                          : 'hover:ring-1 hover:ring-gray-300'
                      }`}
                      style={{
                        left: element.x,
                        top: element.y,
                        width: element.width,
                        height: element.height,
                        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
                        zIndex: selectedElement === element.id ? 1000 : element.layer
                      }}
                      onMouseDown={(e) => handleElementMouseDown(e, element.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedElement(element.id);
                      }}
                    >
                      {/* Lock indicator */}
                      {element.locked && (
                        <div className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 z-10">
                          <Lock className="h-2 w-2" />
                        </div>
                      )}
                      
                      {/* Element content */}
                      <div className="w-full h-full overflow-hidden">
                        {renderElementContent(element)}
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Element Properties */}
        <div>
          <ElementPropertyPanel 
            element={selectedElement ? elements.find(el => el.id === selectedElement) || null : null}
            onUpdateElement={updateElement}
            onDeleteElement={deleteElement}
            companyData={companyData}
          />
        </div>
      </div>
    </div>
  );
}