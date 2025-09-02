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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { QrCode, Type, Image, AlignLeft, AlignCenter, AlignRight, RotateCcw, Save, Printer, Download, Zap, Activity, Wrench, FileText, Plus, Trash2, ShieldCheck } from "lucide-react";

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
  // Printer selection and print method
  const [selectedPrinter, setSelectedPrinter] = useState<'tec' | 'zebra'>('tec');
  const [printMethod, setPrintMethod] = useState<'direct' | 'browser' | 'windows'>('direct');
  const [printQuality, setPrintQuality] = useState<'reception' | 'security' | 'visitor'>('reception');
  
  // Print status tracking
  const [printJobs, setPrintJobs] = useState<Array<{
    id: string;
    status: 'queued' | 'printing' | 'completed' | 'failed';
    method: string;
    printer: string;
    timestamp: string;
    error?: string;
  }>>([]);
  const [lastPrintStatus, setLastPrintStatus] = useState<string>('');
  
  const [printerSettings, setPrinterSettings] = useState({
    blackMarkSensing: true,
    printSpeed: 'medium', // slow, medium, fast
    printDensity: 'normal', // light, normal, dark
    thermalAdjustment: 0, // -3 to +3
    labelLength: 65, // mm (updated to 95mm x 65mm)
    labelWidth: 95, // mm
    cutAfterPrint: true,
    backfeedAdjustment: 0 // -9.9 to +9.9mm
  });
  
  // Compliance dialog state
  const [complianceDialogOpen, setComplianceDialogOpen] = useState(false);
  const [complianceData, setComplianceData] = useState<any>(null);


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

  const loadSavedPrinterSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        const settings = data.settings;
        if (settings) {
          if (settings.thermalSelectedPrinter) setSelectedPrinter(settings.thermalSelectedPrinter);
          if (settings.thermalPrintMethod) setPrintMethod(settings.thermalPrintMethod);
          if (settings.thermalPrintQuality) setPrintQuality(settings.thermalPrintQuality);
          if (settings.thermalPrinterSettings) {
            const parsedSettings = JSON.parse(settings.thermalPrinterSettings);
            setPrinterSettings(parsedSettings);
          }
          console.log(`🎯 Loaded saved printer settings`);
        }
      }
    } catch (error) {
      console.error('Error loading saved printer settings:', error);
    }
  };

  const savePrinterSettings = async () => {
    try {
      const updates = {
        thermalSelectedPrinter: selectedPrinter,
        thermalPrintMethod: printMethod,
        thermalPrintQuality: printQuality,
        thermalPrinterSettings: JSON.stringify(printerSettings)
      };

      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        console.log(`🎯 Auto-saved printer settings`);
        toast({
          title: "Auto-saved",
          description: "Thermal printer settings updated automatically",
          className: "bg-green-50 border-green-200"
        });
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving printer settings:', error);
      toast({
        title: "Auto-save failed",
        description: "Please try saving manually",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    loadSavedDesign();
    loadSavedPrinterSettings();
  }, [passType]);

  // Auto-save printer settings when they change
  useEffect(() => {
    savePrinterSettings();
  }, [selectedPrinter, printMethod, printQuality, printerSettings]);

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


  // Print quality presets
  const getQualitySettings = (quality: string) => {
    switch (quality) {
      case 'reception':
        return { printSpeed: 'fast', printDensity: 'normal', thermalAdjustment: 0 };
      case 'security':
        return { printSpeed: 'slow', printDensity: 'dark', thermalAdjustment: 1 };
      case 'visitor':
        return { printSpeed: 'medium', printDensity: 'normal', thermalAdjustment: 0 };
      default:
        return printerSettings;
    }
  };

  const handleMultiPrint = async (method: 'direct' | 'browser' | 'windows') => {
    setIsPrinting(true);
    setPrintMethod(method);
    
    // Create print job tracking
    const jobId = `job-${Date.now()}`;
    const newJob = {
      id: jobId,
      status: 'queued' as const,
      method,
      printer: selectedPrinter,
      timestamp: new Date().toLocaleTimeString('en-GB'),
    };
    
    setPrintJobs(prev => [newJob, ...prev.slice(0, 4)]); // Keep last 5 jobs
    setLastPrintStatus(`Preparing ${method} print job...`);
    
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

      // Update job status to printing
      setPrintJobs(prev => prev.map(job => 
        job.id === jobId ? { ...job, status: 'printing' } : job
      ));
      setLastPrintStatus(`Sending to ${selectedPrinter.toUpperCase()} printer...`);

      let response;
      const qualitySettings = getQualitySettings(printQuality);
      
      switch (method) {
        case 'direct':
          if (selectedPrinter === 'tec') {
            response = await fetch('/api/thermal-passes/print-tec-native', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                data: visitorData,
                printerSettings: { ...printerSettings, ...qualitySettings }
              })
            });
          } else {
            response = await fetch('/api/thermal-passes/print-zebra', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                elements: passElements,
                data: {
                  visitor: {
                    id: 'temp-id',
                    firstName: 'John',
                    lastName: 'Smith',
                    company: 'Tech Corp Ltd',
                    email: 'john@techcorp.com',
                    phone: '+44 1234 567890',
                    checkedIn: true,
                    checkedOut: false,
                    checkinTime: new Date().toISOString(),
                    host: 'Sarah Johnson',
                    purpose: 'Meeting'
                  },
                  passType: passType,
                  host: 'Sarah Johnson'
                }
              })
            });
          }
          break;
          
        case 'browser':
          response = await fetch('/api/thermal-passes/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              elements: passElements,
              data: visitorData,
              printerSettings: { ...printerSettings, ...qualitySettings }
            })
          });
          
          if (response.ok) {
            const html = await response.text();
            
            // Open print page in new window
            const printWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
            if (printWindow) {
              printWindow.document.write(html);
              printWindow.document.close();
              printWindow.focus();
              
              // Update job as completed
              setPrintJobs(prev => prev.map(job => 
                job.id === jobId ? { ...job, status: 'completed' } : job
              ));
              setLastPrintStatus('Print page opened - use browser print dialog');
            } else {
              // Fallback: create data URL and navigate
              const dataUrl = 'data:text/html,' + encodeURIComponent(html);
              window.open(dataUrl, '_blank');
              
              setPrintJobs(prev => prev.map(job => 
                job.id === jobId ? { ...job, status: 'completed' } : job
              ));
              setLastPrintStatus('Print page opened (fallback method)');
            }
            
            toast({
              title: "🖨️ Print Page Opened",
              description: "Use the browser's print dialog to print to your thermal printer"
            });
            return;
          }
          break;
          
        case 'windows':
          response = await fetch('/api/thermal-passes/print-windows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              elements: passElements,
              data: visitorData,
              printerSettings: { ...printerSettings, ...qualitySettings }
            })
          });
          break;
      }

      if (response && response.ok) {
        const result = await response.json();
        
        // Update job as completed
        setPrintJobs(prev => prev.map(job => 
          job.id === jobId ? { ...job, status: 'completed' } : job
        ));
        setLastPrintStatus(`Print completed via ${method}`);
        
        toast({
          title: `✅ ${method.charAt(0).toUpperCase() + method.slice(1)} Print Success`,
          description: `${result.message} (${result.method || method})`,
        });
      } else if (response) {
        const error = await response.json();
        
        // Update job as failed
        setPrintJobs(prev => prev.map(job => 
          job.id === jobId ? { ...job, status: 'failed', error: error.error } : job
        ));
        setLastPrintStatus(`Print failed: ${error.error}`);
        
        throw new Error(error.error || `${method} printing failed`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Failed to print with ${method}`;
      
      // Update job as failed
      setPrintJobs(prev => prev.map(job => 
        job.id === jobId ? { ...job, status: 'failed', error: errorMessage } : job
      ));
      setLastPrintStatus(`Print failed: ${errorMessage}`);
      
      toast({
        title: `${method.charAt(0).toUpperCase() + method.slice(1)} Print Error`,
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleCopyPrintData = async () => {
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

      const printData = {
        printer: selectedPrinter,
        method: printMethod,
        quality: printQuality,
        data: visitorData,
        elements: passElements,
        settings: printerSettings
      };

      await navigator.clipboard.writeText(JSON.stringify(printData, null, 2));
      
      toast({
        title: "📋 Print Data Copied",
        description: "Print configuration and data copied to clipboard"
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Could not copy print data to clipboard",
        variant: "destructive"
      });
    }
  };

  const checkPrinterHealth = async () => {
    setLastPrintStatus('Checking printer health...');
    
    try {
      const response = await fetch('/api/printers/detect');
      const result = await response.json();
      
      if (result.success) {
        setLastPrintStatus(`Printer health: ${result.printers?.length || 0} printers detected`);
        toast({
          title: "✅ Printer Health Check",
          description: `Found ${result.printers?.length || 0} available printers`,
        });
      } else {
        throw new Error(result.error || 'Health check failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Health check failed';
      setLastPrintStatus(`Health check failed: ${errorMessage}`);
      toast({
        title: "❌ Health Check Failed",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const runDiagnostics = async () => {
    setLastPrintStatus('Running printer diagnostics...');
    
    try {
      const response = await fetch('/api/printers/diagnostics');
      const result = await response.json();
      
      if (result.success) {
        setLastPrintStatus('Diagnostics completed successfully');
        toast({
          title: "🔧 Diagnostics Complete",
          description: result.message || 'All systems operational',
        });
      } else {
        throw new Error(result.error || 'Diagnostics failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Diagnostics failed';
      setLastPrintStatus(`Diagnostics failed: ${errorMessage}`);
      toast({
        title: "❌ Diagnostics Failed",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const testPrint = async () => {
    setLastPrintStatus('Sending test print...');
    
    try {
      const response = await fetch('/api/printers/test-raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printer: selectedPrinter,
          testType: 'simple'
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setLastPrintStatus('Test print sent successfully');
        toast({
          title: "🧪 Test Print Sent",
          description: result.message || 'Check your printer for test output',
        });
      } else {
        throw new Error(result.error || 'Test print failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Test print failed';
      setLastPrintStatus(`Test print failed: ${errorMessage}`);
      toast({
        title: "❌ Test Print Failed",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const handleThermalPrint = async () => {
    // Use the multi-print method with current settings
    await handleMultiPrint(printMethod);
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

  // Show compliance information in dialog
  const showComplianceDialog = async () => {
    try {
      const endpoint = selectedPrinter === 'tec' 
        ? '/api/printers/tec/compliance'
        : '/api/printers/zebra/compliance';
      
      const response = await fetch(endpoint);
      const result = await response.json();
      
      if (result.success) {
        setComplianceData(result.compliance);
        setComplianceDialogOpen(true);
      } else {
        toast({
          title: "Error",
          description: "Could not load compliance information",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch compliance data",
        variant: "destructive"
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
          <p className="text-muted-foreground">Design passes for TEC/Toshiba or Zebra thermal printers (95mm × 65mm)</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={saveDesign} variant="outline">
            <Save className="h-4 w-4 mr-2" />
            Save Design
          </Button>
          
          {/* Multi-Method Print Options */}
          <div className="flex gap-1 border rounded-lg p-1 bg-background">
            <Button 
              onClick={() => handleMultiPrint('browser')} 
              disabled={isPrinting} 
              size="sm"
              variant="ghost"
              className="flex-1 text-xs"
              data-testid="button-browser-print"
            >
              🖨️ Browser
            </Button>
            <Button 
              onClick={() => handleMultiPrint('direct')} 
              disabled={isPrinting} 
              size="sm"
              variant="ghost"
              className="flex-1 text-xs"
              data-testid="button-direct-print"
            >
              ⚡ Direct
            </Button>
            <Button 
              onClick={() => handleMultiPrint('windows')} 
              disabled={isPrinting} 
              size="sm"
              variant="ghost"
              className="flex-1 text-xs"
              data-testid="button-windows-print"
            >
              🪟 Windows
            </Button>
            <Button 
              onClick={handleCopyPrintData} 
              disabled={isPrinting} 
              size="sm"
              variant="ghost"
              className="flex-1 text-xs"
              data-testid="button-copy-data"
            >
              📋 Copy
            </Button>
          </div>
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

              {/* 2. Print Configuration - Essential for Printing */}
              <Card>
                <CardHeader>
                  <CardTitle>Print Configuration</CardTitle>
                  <p className="text-sm text-muted-foreground">Printer & Quality Settings</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Printer Selection */}
                  <div>
                    <Label className="text-sm font-medium">Printer Type</Label>
                    <Select value={selectedPrinter} onValueChange={(value: 'tec' | 'zebra') => setSelectedPrinter(value)}>
                      <SelectTrigger data-testid="select-printer-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tec">
                          <div className="flex items-center gap-2">
                            <Printer className="h-4 w-4 text-blue-600" />
                            <span>TEC/Toshiba Thermal (B-FV4D)</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="zebra">
                          <div className="flex items-center gap-2">
                            <Zap className="h-4 w-4 text-purple-600" />
                            <span>Zebra ZPL Printers</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Print Method */}
                  <div>
                    <Label className="text-sm font-medium">Print Method</Label>
                    <Select value={printMethod} onValueChange={(value: 'direct' | 'browser' | 'windows') => setPrintMethod(value)}>
                      <SelectTrigger data-testid="select-print-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="direct">⚡ Direct Printer (Fastest)</SelectItem>
                        <SelectItem value="browser">🖨️ Browser Print (Compatible)</SelectItem>
                        <SelectItem value="windows">🪟 Windows Print (Reliable)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Print Quality Presets */}
                  <div>
                    <Label className="text-sm font-medium">Quality Preset</Label>
                    <Select value={printQuality} onValueChange={(value: 'reception' | 'security' | 'visitor') => setPrintQuality(value)}>
                      <SelectTrigger data-testid="select-print-quality">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="reception">🏃 Reception Desk (Fast)</SelectItem>
                        <SelectItem value="visitor">🎫 Visitor Pass (Balanced)</SelectItem>
                        <SelectItem value="security">🛡️ Security Badge (High Quality)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="text-xs text-muted-foreground bg-slate-50 p-3 rounded-lg space-y-1">
                    <p><strong>Selected:</strong> {selectedPrinter.toUpperCase()} via {printMethod}</p>
                    <p><strong>Quality:</strong> {printQuality} preset</p>
                    <p><strong>Commands:</strong> {selectedPrinter === 'tec' ? 'ESC/POS' : 'ZPL'}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Print Status & Job Queue */}
              <Card>
                <CardHeader>
                  <CardTitle>Print Status</CardTitle>
                  <p className="text-sm text-muted-foreground">Real-time print job tracking</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Current Status */}
                  <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                    <div className={`w-2 h-2 rounded-full ${isPrinting ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></div>
                    <span className="text-sm">{lastPrintStatus || 'Ready to print'}</span>
                  </div>

                  {/* Recent Print Jobs */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">Recent Jobs</Label>
                    {printJobs.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No recent print jobs</p>
                    ) : (
                      printJobs.map((job) => (
                        <div key={job.id} className="flex items-center justify-between p-2 bg-slate-50 rounded text-xs">
                          <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              job.status === 'completed' ? 'bg-green-500' :
                              job.status === 'failed' ? 'bg-red-500' :
                              job.status === 'printing' ? 'bg-yellow-500 animate-pulse' :
                              'bg-gray-400'
                            }`}></div>
                            <span>{job.method} → {job.printer.toUpperCase()}</span>
                          </div>
                          <span className="text-muted-foreground">{job.timestamp}</span>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 3. Quick Compliance Status (Essential Info Only) */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-green-600" />
                    Compliance Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-green-600 text-sm">✅</span>
                      <span className="text-sm font-medium text-green-800">
                        {selectedPrinter === 'tec' ? 'TEC/Toshiba B-FV4D' : 'Zebra ZPL II'} Verified
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={showComplianceDialog}
                      data-testid="button-show-compliance"
                    >
                      📋 View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* 4. Printer Health Monitoring */}
              <Card>
                <CardHeader>
                  <CardTitle>Printer Health</CardTitle>
                  <p className="text-sm text-muted-foreground">Diagnostic & monitoring tools</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Health Check Button */}
                  <Button 
                    onClick={checkPrinterHealth} 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    disabled={isPrinting}
                    data-testid="button-health-check"
                  >
                    <Activity className="h-4 w-4 mr-2" />
                    Check Printer Health
                  </Button>

                  {/* Diagnostics Button */}
                  <Button 
                    onClick={runDiagnostics} 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    disabled={isPrinting}
                    data-testid="button-diagnostics"
                  >
                    <Wrench className="h-4 w-4 mr-2" />
                    Run Diagnostics
                  </Button>

                  {/* Test Print Button */}
                  <Button 
                    onClick={testPrint} 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    disabled={isPrinting}
                    data-testid="button-test-print"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Test Print Sample
                  </Button>
                </CardContent>
              </Card>

              {/* Zebra Settings Note */}
              {selectedPrinter === 'zebra' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Zebra Printer Configuration</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                      <Zap className="h-5 w-5 text-purple-600" />
                      <div>
                        <p className="text-sm font-medium text-purple-800">Configure Zebra printer in main settings</p>
                        <p className="text-xs text-purple-600">Go to Printer Settings tab to set up IP address, port, and model</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* TEC Printer Settings */}
              {selectedPrinter === 'tec' && (
                <Card>
                  <CardHeader>
                    <CardTitle>TEC B-FV4D Settings</CardTitle>
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
              )}

              {/* Print Method Guide */}
              <Card>
                <CardHeader>
                  <CardTitle>Print Method Guide</CardTitle>
                  <p className="text-sm text-muted-foreground">Choose the best method for your setup</p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <span className="text-lg">⚡</span>
                      <div>
                        <p className="font-medium text-blue-800">Direct Print</p>
                        <p className="text-xs text-blue-600">Best for: Network printers, USB printers with drivers</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <span className="text-lg">🖨️</span>
                      <div>
                        <p className="font-medium text-green-800">Browser Print</p>
                        <p className="text-xs text-green-600">Best for: Any printer, works everywhere, manual setup</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                      <span className="text-lg">🪟</span>
                      <div>
                        <p className="font-medium text-purple-800">Windows Print</p>
                        <p className="text-xs text-purple-600">Best for: Windows systems, local printers</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <span className="text-lg">📋</span>
                      <div>
                        <p className="font-medium text-gray-800">Copy Data</p>
                        <p className="text-xs text-gray-600">Best for: Troubleshooting, manual processing</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Manufacturer Compliance Dialog */}
      <Dialog open={complianceDialogOpen} onOpenChange={setComplianceDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-green-600" />
              Manufacturer Compliance Report
            </DialogTitle>
          </DialogHeader>
          
          {complianceData && (
            <div className="space-y-6">
              {/* Printer Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{complianceData.manufacturer}</CardTitle>
                  <p className="text-sm text-muted-foreground">{complianceData.model}</p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(complianceData.specifications).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                        <span className="text-muted-foreground">{value as string}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Supported Commands */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Supported Commands</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(complianceData.supportedCommands).map(([command, description]) => (
                      <div key={command} className="p-2 bg-gray-50 rounded">
                        <div className="font-mono text-sm font-medium">{command}</div>
                        <div className="text-xs text-muted-foreground">{description as string}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Compliance Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Compliance Validation</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium mb-2">Standards Compliance</h4>
                      <div className="space-y-1">
                        {Object.entries(complianceData.compliance).map(([key, value]) => (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                            <span className={key === 'status' ? 'font-medium text-green-600' : 'text-muted-foreground'}>
                              {value as string}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-medium mb-2">Validation Results</h4>
                      <div className="space-y-1">
                        {Object.entries(complianceData.validationResults).map(([key, value]) => (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                            <span className="text-green-600 font-medium">{value as string}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <div className="flex justify-end">
                <Button onClick={() => setComplianceDialogOpen(false)}>
                  Close Report
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}