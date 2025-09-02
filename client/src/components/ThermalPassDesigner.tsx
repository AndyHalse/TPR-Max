import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { QrCode, Type, Image, AlignLeft, AlignCenter, AlignRight, RotateCcw, Save, Printer, Download, Zap } from "lucide-react";

// Thermal pass constraints for B-FV4D (85mm x 65mm)
const THERMAL_PASS_WIDTH = 323; // 85mm at 96dpi
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
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticData, setDiagnosticData] = useState(null);
  const [previewData, setPreviewData] = useState({
    name: 'John Smith',
    company: 'Tech Corp Ltd',
    host: 'Sarah Johnson',
    purpose: 'Meeting',
    phone: '+44 1234 567890',
    email: 'john@techcorp.com'
  });

  // Printer settings for B-FV4D
  const [printerSettings, setPrinterSettings] = useState({
    blackMarkSensing: true,
    printSpeed: 'medium', // slow, medium, fast
    printDensity: 'normal', // light, normal, dark
    thermalAdjustment: 0, // -3 to +3
    labelLength: 66, // mm
    labelWidth: 85, // mm
    cutAfterPrint: true,
    backfeedAdjustment: 0 // -9.9 to +9.9mm
  });

  useEffect(() => {
    loadSavedDesign();
  }, [passType]);

  const loadSavedDesign = async () => {
    try {
      const response = await fetch(`/api/thermal-passes/design/${passType}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.design && data.design.elements?.length > 0) {
          setPassElements(data.design.elements);
          console.log(`✅ Loaded saved ${passType} thermal pass design`);
        }
      }
    } catch (error) {
      console.error('Error loading thermal pass design:', error);
    }
  };

  const saveDesign = async () => {
    try {
      const designData = {
        elements: passElements,
        type: passType,
        printerSettings
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

  const printWindows = async () => {
    try {
      const response = await fetch('/api/thermal-passes/print-windows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          elements: passElements,
          data: previewData,
          printerSettings
        })
      });

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "✅ Windows Print Success!",
          description: `Method: ${result.method} - ${result.message}`
        });
      } else {
        toast({
          title: "Print Failed",
          description: result.error || "Windows printing failed",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Print Error",
        description: "Could not connect to Windows print service",
        variant: "destructive"
      });
    }
  };


  const handleNativeTecPrint = async () => {
    setIsPrinting(true);
    
    try {
      const visitorData = {
        name: 'John Smith',
        company: 'Tech Corp Ltd',
        host: 'Sarah Johnson',
        date: new Date().toLocaleDateString('en-GB'),
        time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        passId: `#${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
        qrCode: `VG-${Date.now()}`
      };

      const response = await fetch('/api/thermal-passes/print-tec-native', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: visitorData,
          printerSettings
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: "🚀 TEC Native Print Success",
          description: `${result.message} (${result.method})`,
        });
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Native TEC printing failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to print with native TEC commands";
      toast({
        title: "Native TEC Print Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsPrinting(false);
    }
  };



  const loadTemplate = (templateId: string) => {
    const template = THERMAL_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplate(templateId);
      setPassElements([...template.elements]);
      setPassType(template.type);
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

  const renderPreviewContent = (element: ThermalElement) => {
    if (!element.isVariable) return element.content || '';
    
    switch (element.variableType) {
      case 'name': return previewData.name;
      case 'company': return previewData.company;
      case 'host': return previewData.host;
      case 'purpose': return previewData.purpose;
      case 'phone': return previewData.phone;
      case 'email': return previewData.email;
      case 'date': return new Date().toLocaleDateString('en-GB');
      case 'time': return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      case 'id': return 'VS001234';
      default: return element.content || '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Thermal Pass Designer</h2>
          <p className="text-muted-foreground">Design passes for B-FV4D thermal printer (85mm × 65mm)</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={saveDesign} variant="outline">
            <Save className="h-4 w-4 mr-2" />
            Save Design
          </Button>
          <Button onClick={handleNativeTecPrint} disabled={isPrinting} className="bg-blue-600 hover:bg-blue-700">
            <Zap className="h-4 w-4 mr-2" />
            🚀 Native TEC Print
          </Button>
        </div>
      </div>

      <Tabs value={passType} onValueChange={(value) => setPassType(value as 'visitor' | 'contractor')}>
        <TabsList>
          <TabsTrigger value="visitor">Visitor Passes</TabsTrigger>
          <TabsTrigger value="contractor">Contractor Passes</TabsTrigger>
        </TabsList>

        <TabsContent value={passType} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Pass Preview */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Pass Preview (85mm × 65mm)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div 
                    className="relative border-2 border-dashed border-gray-300 bg-white mx-auto"
                    style={{ width: THERMAL_PASS_WIDTH, height: THERMAL_PASS_HEIGHT }}
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
                        className={`absolute cursor-pointer border ${
                          selectedElement === element.id ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:border-gray-400'
                        }`}
                        style={{
                          left: element.x,
                          top: element.y,
                          width: element.width,
                          height: element.height,
                          transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined
                        }}
                        onClick={() => setSelectedElement(element.id)}
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
                          <div className="w-full h-full bg-white border border-gray-300 flex items-center justify-center text-xs">
                            <QrCode className="h-8 w-8" />
                          </div>
                        )}
                        {element.type === 'logo' && (
                          <div className="w-full h-full bg-gray-100 border border-gray-300 flex items-center justify-center text-xs">
                            <Image className="h-6 w-6" />
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

            {/* Design Controls */}
            <div className="space-y-4">
              {/* Templates */}
              <Card>
                <CardHeader>
                  <CardTitle>Templates</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {THERMAL_TEMPLATES.filter(t => t.type === passType).map((template) => (
                    <Button
                      key={template.id}
                      variant={selectedTemplate === template.id ? "default" : "outline"}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => loadTemplate(template.id)}
                    >
                      {template.name}
                    </Button>
                  ))}
                </CardContent>
              </Card>

              {/* Element Properties */}
              {selectedElementData && (
                <Card>
                  <CardHeader>
                    <CardTitle>Element Properties</CardTitle>
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
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Printer Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>B-FV4D Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={printerSettings.blackMarkSensing}
                      onCheckedChange={(checked) => 
                        setPrinterSettings(prev => ({ ...prev, blackMarkSensing: checked }))
                      }
                    />
                    <Label>Black Mark Sensing</Label>
                  </div>
                  
                  <div>
                    <Label>Print Speed</Label>
                    <Select
                      value={printerSettings.printSpeed}
                      onValueChange={(value) => 
                        setPrinterSettings(prev => ({ ...prev, printSpeed: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="slow">Slow (High Quality)</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="fast">Fast</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Print Density</Label>
                    <Select
                      value={printerSettings.printDensity}
                      onValueChange={(value) => 
                        setPrinterSettings(prev => ({ ...prev, printDensity: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Thermal Adjustment ({printerSettings.thermalAdjustment})</Label>
                    <Slider
                      value={[printerSettings.thermalAdjustment]}
                      onValueChange={([value]) => 
                        setPrinterSettings(prev => ({ ...prev, thermalAdjustment: value }))
                      }
                      min={-3}
                      max={3}
                      step={1}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={printerSettings.cutAfterPrint}
                      onCheckedChange={(checked) => 
                        setPrinterSettings(prev => ({ ...prev, cutAfterPrint: checked }))
                      }
                    />
                    <Label>Auto Cut</Label>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}