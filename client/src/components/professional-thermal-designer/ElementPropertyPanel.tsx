import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ThermalElement, TextElement, QRCodeElement, ImageElement, LineElement, RectangleElement, BarcodeElement } from "./ThermalElement";
import { Type, QrCode, Image, Minus, Square, BarChart3, Lock, Eye, EyeOff, Move, RotateCcw, Palette, Settings, Zap } from "lucide-react";

interface ElementPropertyPanelProps {
  element: ThermalElement | null;
  onUpdateElement: (element: ThermalElement) => void;
  onDeleteElement: (elementId: string) => void;
  companyData: any;
}

export function ElementPropertyPanel({ element, onUpdateElement, onDeleteElement, companyData }: ElementPropertyPanelProps) {
  if (!element) {
    return (
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-sm">Element Properties</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground text-center py-8">
          Select an element to edit its properties
        </CardContent>
      </Card>
    );
  }

  const getElementIcon = (type: string) => {
    switch (type) {
      case 'text': return <Type className="h-4 w-4" />;
      case 'qr_code': return <QrCode className="h-4 w-4" />;
      case 'image': return <Image className="h-4 w-4" />;
      case 'line': return <Minus className="h-4 w-4" />;
      case 'rectangle': return <Square className="h-4 w-4" />;
      case 'barcode': return <BarChart3 className="h-4 w-4" />;
      default: return <Settings className="h-4 w-4" />;
    }
  };

  const updateElement = (updates: Partial<ThermalElement>) => {
    onUpdateElement({ ...element, ...updates } as ThermalElement);
  };

  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {getElementIcon(element.type)}
          {element.type.replace('_', ' ').toUpperCase()} Properties
          <Badge variant="outline" className="ml-auto text-xs">
            ID: {element.id.substring(0, 6)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Basic Properties */}
        <div className="space-y-3">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Position & Size</Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="x" className="text-xs">X Position</Label>
              <Input
                id="x"
                type="number"
                value={element.x}
                onChange={(e) => updateElement({ x: parseInt(e.target.value) || 0 })}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label htmlFor="y" className="text-xs">Y Position</Label>
              <Input
                id="y"
                type="number"
                value={element.y}
                onChange={(e) => updateElement({ y: parseInt(e.target.value) || 0 })}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label htmlFor="width" className="text-xs">Width</Label>
              <Input
                id="width"
                type="number"
                value={element.width}
                onChange={(e) => updateElement({ width: parseInt(e.target.value) || 1 })}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label htmlFor="height" className="text-xs">Height</Label>
              <Input
                id="height"
                type="number"
                value={element.height}
                onChange={(e) => updateElement({ height: parseInt(e.target.value) || 1 })}
                className="h-8 text-xs"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="rotation" className="text-xs">Rotation</Label>
              <Input
                id="rotation"
                type="number"
                value={element.rotation || 0}
                onChange={(e) => updateElement({ rotation: parseInt(e.target.value) || 0 })}
                className="h-8 text-xs"
                placeholder="0-360°"
              />
            </div>
            <div>
              <Label htmlFor="layer" className="text-xs">Layer</Label>
              <Input
                id="layer"
                type="number"
                value={element.layer}
                onChange={(e) => updateElement({ layer: parseInt(e.target.value) || 1 })}
                className="h-8 text-xs"
              />
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Switch
                id="visible"
                checked={element.visible}
                onCheckedChange={(checked) => updateElement({ visible: checked })}
              />
              <Label htmlFor="visible" className="text-xs flex items-center gap-1">
                {element.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                Visible
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="locked"
                checked={element.locked}
                onCheckedChange={(checked) => updateElement({ locked: checked })}
              />
              <Label htmlFor="locked" className="text-xs flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Locked
              </Label>
            </div>
          </div>
        </div>

        <Separator />

        {/* Element-specific Properties */}
        <Tabs defaultValue="content" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="content" className="text-xs">Content</TabsTrigger>
            <TabsTrigger value="style" className="text-xs">Style</TabsTrigger>
            <TabsTrigger value="thermal" className="text-xs">Thermal</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="space-y-3 mt-3">
            {element.type === 'text' && (
              <TextElementContent element={element as TextElement} updateElement={updateElement} />
            )}
            {element.type === 'qr_code' && (
              <QRCodeElementContent element={element as QRCodeElement} updateElement={updateElement} />
            )}
            {element.type === 'image' && (
              <ImageElementContent element={element as ImageElement} updateElement={updateElement} companyData={companyData} />
            )}
            {element.type === 'line' && (
              <LineElementContent element={element as LineElement} updateElement={updateElement} />
            )}
            {element.type === 'rectangle' && (
              <RectangleElementContent element={element as RectangleElement} updateElement={updateElement} />
            )}
            {element.type === 'barcode' && (
              <BarcodeElementContent element={element as BarcodeElement} updateElement={updateElement} />
            )}
          </TabsContent>

          <TabsContent value="style" className="space-y-3 mt-3">
            {element.type === 'text' && (
              <TextStyleContent element={element as TextElement} updateElement={updateElement} />
            )}
            {(element.type === 'image' || element.type === 'rectangle' || element.type === 'line') && (
              <VisualStyleContent element={element} updateElement={updateElement} />
            )}
          </TabsContent>

          <TabsContent value="thermal" className="space-y-3 mt-3">
            <ThermalSettings element={element} updateElement={updateElement} />
          </TabsContent>
        </Tabs>

        <Separator />

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => updateElement({ x: 10, y: 10 })}
            className="flex-1 text-xs"
          >
            <Move className="h-3 w-3 mr-1" />
            Reset Position
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onDeleteElement(element.id)}
            className="text-xs"
          >
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Text Element Content Panel
function TextElementContent({ element, updateElement }: { element: TextElement; updateElement: (updates: any) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-medium">Content Type</Label>
        <Select
          value={element.contentType}
          onValueChange={(value) => updateElement({ contentType: value as 'fixed' | 'variable' })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed">Fixed Text</SelectItem>
            <SelectItem value="variable">Variable Data</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {element.contentType === 'fixed' ? (
        <div>
          <Label className="text-xs font-medium">Text Content</Label>
          <Input
            value={element.fixedContent || ''}
            onChange={(e) => updateElement({ fixedContent: e.target.value })}
            placeholder="Enter text content..."
            className="h-8 text-xs"
          />
        </div>
      ) : (
        <div>
          <Label className="text-xs font-medium">Variable Source</Label>
          <Select
            value={element.variableSource}
            onValueChange={(value) => updateElement({ variableSource: value })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select data source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="visitor_name">Visitor Name</SelectItem>
              <SelectItem value="visitor_company">Visitor Company</SelectItem>
              <SelectItem value="visitor_phone">Visitor Phone</SelectItem>
              <SelectItem value="visitor_email">Visitor Email</SelectItem>
              <SelectItem value="host_name">Host Name</SelectItem>
              <SelectItem value="purpose">Visit Purpose</SelectItem>
              <SelectItem value="date">Current Date</SelectItem>
              <SelectItem value="time">Current Time</SelectItem>
              <SelectItem value="check_in_time">Check-in Time</SelectItem>
              <SelectItem value="visitor_id">Visitor ID</SelectItem>
              <SelectItem value="badge_number">Badge Number</SelectItem>
              <SelectItem value="expiry_date">Expiry Date</SelectItem>
              <SelectItem value="custom_field">Custom Field</SelectItem>
            </SelectContent>
          </Select>
          
          {element.variableSource === 'custom_field' && (
            <div className="mt-2">
              <Label className="text-xs font-medium">Custom Field Name</Label>
              <Input
                value={element.customFieldName || ''}
                onChange={(e) => updateElement({ customFieldName: e.target.value })}
                placeholder="Enter field name..."
                className="h-8 text-xs"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// QR Code Element Content Panel
function QRCodeElementContent({ element, updateElement }: { element: QRCodeElement; updateElement: (updates: any) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-medium">QR Data Type</Label>
        <Select
          value={element.dataType}
          onValueChange={(value) => updateElement({ dataType: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="visitor_data">Visitor Data (JSON)</SelectItem>
            <SelectItem value="check_in_url">Check-in URL</SelectItem>
            <SelectItem value="custom_json">Custom JSON</SelectItem>
            <SelectItem value="fixed_text">Fixed Text</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {element.dataType === 'visitor_data' && (
        <div>
          <Label className="text-xs font-medium mb-2 block">Include Fields</Label>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {Object.entries(element.includeFields).map(([key, value]) => (
              <div key={key} className="flex items-center space-x-2">
                <Switch
                  checked={value}
                  onCheckedChange={(checked) => 
                    updateElement({
                      includeFields: { ...element.includeFields, [key]: checked }
                    })
                  }
                />
                <Label className="text-xs">{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</Label>
              </div>
            ))}
          </div>
        </div>
      )}

      {element.dataType === 'fixed_text' && (
        <div>
          <Label className="text-xs font-medium">Fixed Text</Label>
          <Input
            value={element.fixedText || ''}
            onChange={(e) => updateElement({ fixedText: e.target.value })}
            placeholder="Enter QR code text..."
            className="h-8 text-xs"
          />
        </div>
      )}

      {element.dataType === 'custom_json' && (
        <div>
          <Label className="text-xs font-medium">Custom JSON Data</Label>
          <textarea
            value={element.customData || ''}
            onChange={(e) => updateElement({ customData: e.target.value })}
            placeholder='{"key": "value"}'
            className="w-full h-20 text-xs border rounded p-2 resize-none"
          />
        </div>
      )}

      <div>
        <Label className="text-xs font-medium">Error Correction</Label>
        <Select
          value={element.errorCorrection}
          onValueChange={(value) => updateElement({ errorCorrection: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="L">Low (7%)</SelectItem>
            <SelectItem value="M">Medium (15%)</SelectItem>
            <SelectItem value="Q">Quartile (25%)</SelectItem>
            <SelectItem value="H">High (30%)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// Image Element Content Panel
function ImageElementContent({ element, updateElement, companyData }: { element: ImageElement; updateElement: (updates: any) => void; companyData: any }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-medium">Image Source</Label>
        <Select
          value={element.imageType}
          onValueChange={(value) => updateElement({ imageType: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="company_logo">Company Logo</SelectItem>
            <SelectItem value="uploaded_image">Uploaded Image</SelectItem>
            <SelectItem value="url">Image URL</SelectItem>
            <SelectItem value="placeholder">Placeholder</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {element.imageType === 'url' && (
        <div>
          <Label className="text-xs font-medium">Image URL</Label>
          <Input
            value={element.imageUrl || ''}
            onChange={(e) => updateElement({ imageUrl: e.target.value })}
            placeholder="https://example.com/image.png"
            className="h-8 text-xs"
          />
        </div>
      )}

      <div>
        <Label className="text-xs font-medium">Scaling</Label>
        <Select
          value={element.scaling}
          onValueChange={(value) => updateElement({ scaling: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fit">Fit (Maintain Aspect)</SelectItem>
            <SelectItem value="fill">Fill (Crop if needed)</SelectItem>
            <SelectItem value="stretch">Stretch (Ignore Aspect)</SelectItem>
            <SelectItem value="original">Original Size</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs font-medium">Alignment</Label>
        <Select
          value={element.alignment}
          onValueChange={(value) => updateElement({ alignment: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="top-left">Top Left</SelectItem>
            <SelectItem value="top-center">Top Center</SelectItem>
            <SelectItem value="top-right">Top Right</SelectItem>
            <SelectItem value="center-left">Center Left</SelectItem>
            <SelectItem value="center">Center</SelectItem>
            <SelectItem value="center-right">Center Right</SelectItem>
            <SelectItem value="bottom-left">Bottom Left</SelectItem>
            <SelectItem value="bottom-center">Bottom Center</SelectItem>
            <SelectItem value="bottom-right">Bottom Right</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// Line Element Content Panel
function LineElementContent({ element, updateElement }: { element: LineElement; updateElement: (updates: any) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-medium">Line Type</Label>
        <Select
          value={element.lineType}
          onValueChange={(value) => updateElement({ lineType: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="horizontal">Horizontal</SelectItem>
            <SelectItem value="vertical">Vertical</SelectItem>
            <SelectItem value="diagonal">Diagonal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs font-medium">Thickness: {element.thickness}px</Label>
        <Slider
          value={[element.thickness]}
          onValueChange={(value) => updateElement({ thickness: value[0] })}
          max={10}
          min={1}
          step={1}
          className="mt-2"
        />
      </div>

      <div>
        <Label className="text-xs font-medium">Style</Label>
        <Select
          value={element.style}
          onValueChange={(value) => updateElement({ style: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Solid</SelectItem>
            <SelectItem value="dashed">Dashed</SelectItem>
            <SelectItem value="dotted">Dotted</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// Rectangle Element Content Panel
function RectangleElementContent({ element, updateElement }: { element: RectangleElement; updateElement: (updates: any) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <Switch
          checked={element.filled}
          onCheckedChange={(checked) => updateElement({ filled: checked })}
        />
        <Label className="text-xs">Filled Rectangle</Label>
      </div>

      <div>
        <Label className="text-xs font-medium">Border Width: {element.borderWidth}px</Label>
        <Slider
          value={[element.borderWidth]}
          onValueChange={(value) => updateElement({ borderWidth: value[0] })}
          max={10}
          min={0}
          step={1}
          className="mt-2"
        />
      </div>

      <div>
        <Label className="text-xs font-medium">Corner Radius: {element.cornerRadius}px</Label>
        <Slider
          value={[element.cornerRadius]}
          onValueChange={(value) => updateElement({ cornerRadius: value[0] })}
          max={20}
          min={0}
          step={1}
          className="mt-2"
        />
      </div>
    </div>
  );
}

// Barcode Element Content Panel
function BarcodeElementContent({ element, updateElement }: { element: BarcodeElement; updateElement: (updates: any) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-medium">Barcode Type</Label>
        <Select
          value={element.barcodeType}
          onValueChange={(value) => updateElement({ barcodeType: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="code128">Code 128</SelectItem>
            <SelectItem value="code39">Code 39</SelectItem>
            <SelectItem value="ean13">EAN-13</SelectItem>
            <SelectItem value="ean8">EAN-8</SelectItem>
            <SelectItem value="upc">UPC</SelectItem>
            <SelectItem value="interleaved2of5">Interleaved 2 of 5</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs font-medium">Data Source</Label>
        <Select
          value={element.dataType}
          onValueChange={(value) => updateElement({ dataType: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="visitor_id">Visitor ID</SelectItem>
            <SelectItem value="badge_number">Badge Number</SelectItem>
            <SelectItem value="custom_field">Custom Field</SelectItem>
            <SelectItem value="fixed_text">Fixed Text</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {element.dataType === 'fixed_text' && (
        <div>
          <Label className="text-xs font-medium">Barcode Text</Label>
          <Input
            value={element.fixedText || ''}
            onChange={(e) => updateElement({ fixedText: e.target.value })}
            placeholder="Enter barcode data..."
            className="h-8 text-xs"
          />
        </div>
      )}

      <div className="flex items-center space-x-2">
        <Switch
          checked={element.showText}
          onCheckedChange={(checked) => updateElement({ showText: checked })}
        />
        <Label className="text-xs">Show Text</Label>
      </div>
    </div>
  );
}

// Text Style Content Panel
function TextStyleContent({ element, updateElement }: { element: TextElement; updateElement: (updates: any) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-medium">Font Family</Label>
        <Select
          value={element.fontFamily}
          onValueChange={(value) => updateElement({ fontFamily: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="thermal_default">Thermal Default</SelectItem>
            <SelectItem value="arial">Arial</SelectItem>
            <SelectItem value="helvetica">Helvetica</SelectItem>
            <SelectItem value="courier">Courier</SelectItem>
            <SelectItem value="times">Times</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs font-medium">Font Size: {element.fontSize}px</Label>
        <div className="flex gap-2 items-center mt-2">
          <Slider
            value={[element.fontSize]}
            onValueChange={(value) => updateElement({ fontSize: value[0] })}
            max={72}
            min={6}
            step={1}
            className="flex-1"
          />
          <Input
            type="number"
            value={element.fontSize}
            onChange={(e) => {
              const value = parseInt(e.target.value);
              if (!isNaN(value) && value >= 6 && value <= 72) {
                updateElement({ fontSize: value });
              }
            }}
            min={6}
            max={72}
            className="w-16 h-8 text-xs"
          />
        </div>
        <div className="flex gap-1 mt-2">
          <Button
            type="button"
            size="sm"
            variant={element.fontSize === 10 ? "default" : "outline"}
            className="h-6 text-xs px-2"
            onClick={() => updateElement({ fontSize: 10 })}
          >
            10px
          </Button>
          <Button
            type="button"
            size="sm"
            variant={element.fontSize === 12 ? "default" : "outline"}
            className="h-6 text-xs px-2"
            onClick={() => updateElement({ fontSize: 12 })}
          >
            12px
          </Button>
          <Button
            type="button"
            size="sm"
            variant={element.fontSize === 14 ? "default" : "outline"}
            className="h-6 text-xs px-2"
            onClick={() => updateElement({ fontSize: 14 })}
          >
            14px
          </Button>
          <Button
            type="button"
            size="sm"
            variant={element.fontSize === 18 ? "default" : "outline"}
            className="h-6 text-xs px-2"
            onClick={() => updateElement({ fontSize: 18 })}
          >
            18px
          </Button>
          <Button
            type="button"
            size="sm"
            variant={element.fontSize === 24 ? "default" : "outline"}
            className="h-6 text-xs px-2"
            onClick={() => updateElement({ fontSize: 24 })}
          >
            24px
          </Button>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Adjust text size for both fixed and variable content (6-72px)
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs font-medium">Weight</Label>
          <Select
            value={element.fontWeight}
            onValueChange={(value) => updateElement({ fontWeight: value })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="bold">Bold</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs font-medium">Style</Label>
          <Select
            value={element.fontStyle}
            onValueChange={(value) => updateElement({ fontStyle: value })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="italic">Italic</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs font-medium">Alignment</Label>
        <Select
          value={element.alignment}
          onValueChange={(value) => updateElement({ alignment: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left">Left</SelectItem>
            <SelectItem value="center">Center</SelectItem>
            <SelectItem value="right">Right</SelectItem>
            <SelectItem value="justify">Justify</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs font-medium">Line Height: {element.lineHeight || 1.2}</Label>
        <div className="flex gap-2 items-center mt-2">
          <Slider
            value={[element.lineHeight || 1.2]}
            onValueChange={(value) => updateElement({ lineHeight: value[0] })}
            max={3}
            min={0.8}
            step={0.1}
            className="flex-1"
          />
          <Input
            type="number"
            value={element.lineHeight || 1.2}
            onChange={(e) => {
              const value = parseFloat(e.target.value);
              if (!isNaN(value) && value >= 0.8 && value <= 3) {
                updateElement({ lineHeight: value });
              }
            }}
            min={0.8}
            max={3}
            step={0.1}
            className="w-16 h-8 text-xs"
          />
        </div>
      </div>

      <div>
        <Label className="text-xs font-medium">Letter Spacing: {element.letterSpacing || 0}px</Label>
        <div className="flex gap-2 items-center mt-2">
          <Slider
            value={[element.letterSpacing || 0]}
            onValueChange={(value) => updateElement({ letterSpacing: value[0] })}
            max={10}
            min={-2}
            step={0.5}
            className="flex-1"
          />
          <Input
            type="number"
            value={element.letterSpacing || 0}
            onChange={(e) => {
              const value = parseFloat(e.target.value);
              if (!isNaN(value) && value >= -2 && value <= 10) {
                updateElement({ letterSpacing: value });
              }
            }}
            min={-2}
            max={10}
            step={0.5}
            className="w-16 h-8 text-xs"
          />
        </div>
      </div>
    </div>
  );
}

// Visual Style Content Panel
function VisualStyleContent({ element, updateElement }: { element: any; updateElement: (updates: any) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-medium">Color</Label>
        <Input
          type="color"
          value={element.color || element.textColor || element.borderColor || '#000000'}
          onChange={(e) => updateElement({ 
            color: e.target.value,
            textColor: e.target.value,
            borderColor: e.target.value
          })}
          className="h-8 w-full"
        />
      </div>
    </div>
  );
}

// Thermal Settings Panel
function ThermalSettings({ element, updateElement }: { element: any; updateElement: (updates: any) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-medium">Thermal Intensity: {element.thermalIntensity || 5}</Label>
        <Slider
          value={[element.thermalIntensity || 5]}
          onValueChange={(value) => updateElement({ thermalIntensity: value[0] })}
          max={10}
          min={1}
          step={1}
          className="mt-2"
        />
        <div className="text-xs text-muted-foreground mt-1">
          Controls print darkness (1=Light, 10=Dark)
        </div>
      </div>

      {(element.type === 'text' || element.type === 'image' || element.type === 'barcode') && (
        <div>
          <Label className="text-xs font-medium">Print Quality</Label>
          <Select
            value={element.printQuality || 'normal'}
            onValueChange={(value) => updateElement({ printQuality: value })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft (Fastest)</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High (Slowest)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {element.type === 'qr_code' && (
        <div>
          <Label className="text-xs font-medium">Print Method</Label>
          <Select
            value={element.printMethod || 'native_qr'}
            onValueChange={(value) => updateElement({ printMethod: value })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="native_qr">Native QR (Recommended)</SelectItem>
              <SelectItem value="bitmap">Bitmap Image</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}