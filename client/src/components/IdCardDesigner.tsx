import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Printer, Move, Save, Settings, User, Building2, Hash, Shield } from "lucide-react";
import type { Staff } from "@shared/schema";

interface IdCardDesignerProps {
  isOpen: boolean;
  onClose: () => void;
  staff: Staff;
}

interface CardElement {
  id: string;
  type: 'photo' | 'name' | 'department' | 'employeeId' | 'company' | 'accessLevel';
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
}

const defaultElements: CardElement[] = [
  { id: 'photo', type: 'photo', x: 20, y: 20, width: 80, height: 80 },
  { id: 'name', type: 'name', x: 120, y: 30, width: 180, height: 20, fontSize: 16, fontWeight: 'bold', color: '#1e293b' },
  { id: 'department', type: 'department', x: 120, y: 55, width: 180, height: 15, fontSize: 12, color: '#64748b' },
  { id: 'employeeId', type: 'employeeId', x: 120, y: 75, width: 180, height: 15, fontSize: 12, color: '#64748b' },
  { id: 'company', type: 'company', x: 20, y: 110, width: 280, height: 15, fontSize: 11, color: '#64748b' },
  { id: 'accessLevel', type: 'accessLevel', x: 20, y: 130, width: 280, height: 15, fontSize: 10, fontWeight: 'bold', color: '#3b82f6' }
];

export default function IdCardDesigner({ isOpen, onClose, staff }: IdCardDesignerProps) {
  const { toast } = useToast();
  const [elements, setElements] = useState<CardElement[]>(defaultElements);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const getElementContent = (element: CardElement): string => {
    switch (element.type) {
      case 'name':
        return `${staff.firstName} ${staff.lastName}`;
      case 'department':
        return staff.department;
      case 'employeeId':
        return `ID: ${staff.employeeId}`;
      case 'company':
        return 'TechCorp Ltd'; // This could come from settings
      case 'accessLevel':
        return staff.accessLevel === 'admin' ? 'ADMINISTRATOR' : 
               staff.accessLevel === 'supervisor' ? 'SUPERVISOR' : 'STAFF';
      default:
        return '';
    }
  };

  const getElementIcon = (type: string) => {
    switch (type) {
      case 'photo': return <User size={16} />;
      case 'name': return <User size={16} />;
      case 'department': return <Building2 size={16} />;
      case 'employeeId': return <Hash size={16} />;
      case 'company': return <Building2 size={16} />;
      case 'accessLevel': return <Shield size={16} />;
      default: return null;
    }
  };

  const handleMouseDown = (e: React.MouseEvent, elementId: string) => {
    const element = elements.find(el => el.id === elementId);
    if (!element) return;

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

    setElements(prev => prev.map(el => 
      el.id === selectedElement 
        ? { ...el, x: Math.max(0, Math.min(newX, 300 - el.width)), y: Math.max(0, Math.min(newY, 180 - el.height)) }
        : el
    ));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setSelectedElement(null);
  };

  const handleSaveTemplate = async () => {
    try {
      const response = await fetch('/api/idcard/design', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          elements: elements,
          background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
          cardSize: 'CR80'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save design');
      }

      toast({
        title: "Design Saved Successfully",
        description: "ID card template has been saved",
      });
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: "Save Failed", 
        description: "Failed to save ID card design. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handlePrint = async () => {
    try {
      const response = await fetch(`/api/staff/${staff.id}/print-id-card`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ design: elements }),
      });

      if (!response.ok) {
        throw new Error('Failed to print ID card');
      }

      const result = await response.json();
      
      toast({
        title: "ID Card Printed Successfully",
        description: `ID card for ${staff.firstName} ${staff.lastName} sent to printer`,
      });
      onClose();
    } catch (error) {
      toast({
        title: "Print Error",
        description: "Failed to print ID card",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="text-blue-600" size={24} />
            ID Card Designer - {staff.firstName} {staff.lastName}
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Card Preview */}
          <div className="lg:col-span-2">
            <h3 className="text-lg font-semibold mb-4">Card Preview (95mm x 66mm)</h3>
            <div className="flex justify-center">
              <div 
                className="relative bg-white border-2 border-slate-300 shadow-lg"
                style={{ 
                  width: '320px', 
                  height: '188px', // Scaled version of 95mm x 66mm
                  background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)'
                }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                {/* Company Logo Background */}
                <div className="absolute inset-0 opacity-5">
                  <Building2 size={120} className="absolute right-4 bottom-4 text-slate-400" />
                </div>
                
                {elements.map((element) => (
                  <div
                    key={element.id}
                    className={`absolute cursor-move select-none ${
                      selectedElement === element.id ? 'ring-2 ring-blue-400 ring-opacity-50' : ''
                    }`}
                    style={{
                      left: element.x,
                      top: element.y,
                      width: element.width,
                      height: element.height,
                      fontSize: element.fontSize,
                      fontWeight: element.fontWeight,
                      color: element.color,
                    }}
                    onMouseDown={(e) => handleMouseDown(e, element.id)}
                  >
                    {element.type === 'photo' ? (
                      <div className="w-full h-full bg-slate-200 rounded border flex items-center justify-center">
                        {staff.photoUrl ? (
                          <img 
                            src={staff.photoUrl} 
                            alt="Staff Photo" 
                            className="w-full h-full object-cover rounded"
                          />
                        ) : (
                          <User className="text-slate-400" size={40} />
                        )}
                      </div>
                    ) : (
                      <div className="text-left leading-tight">
                        {getElementContent(element)}
                      </div>
                    )}
                  </div>
                ))}
                
                {/* Card Border */}
                <div className="absolute inset-0 border border-slate-300 rounded pointer-events-none"></div>
              </div>
            </div>
          </div>
          
          {/* Element Controls */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Card Elements</h3>
            <div className="space-y-2">
              {elements.map((element) => (
                <Card 
                  key={element.id}
                  className={`p-3 cursor-pointer transition-colors ${
                    selectedElement === element.id ? 'bg-blue-50 border-blue-300' : 'hover:bg-slate-50'
                  }`}
                  onClick={() => setSelectedElement(element.id)}
                >
                  <div className="flex items-center gap-2">
                    {getElementIcon(element.type)}
                    <span className="text-sm font-medium capitalize">
                      {element.type === 'employeeId' ? 'Employee ID' : element.type}
                    </span>
                    <Move className="ml-auto text-slate-400" size={14} />
                  </div>
                  {element.type !== 'photo' && (
                    <div className="text-xs text-slate-500 mt-1 truncate">
                      {getElementContent(element)}
                    </div>
                  )}
                </Card>
              ))}
            </div>
            
            <div className="mt-6 text-xs text-slate-500">
              <p className="flex items-center gap-1 mb-1">
                <Move size={12} />
                Click and drag elements to reposition
              </p>
              <p>Card size: 95mm × 66mm (3.74" × 2.60")</p>
            </div>
          </div>
        </div>
        
        <div className="flex gap-3 pt-4 border-t">
          <Button 
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button 
            variant="outline"
            onClick={handleSaveTemplate}
            className="flex items-center gap-2"
          >
            <Save size={16} />
            Save Template
          </Button>
          <Button 
            onClick={handlePrint}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <Printer size={16} />
            Print ID Card
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}