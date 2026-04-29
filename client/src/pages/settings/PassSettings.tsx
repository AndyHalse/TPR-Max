import { useState } from "react";
import { useSettingsAutoSave } from "@/hooks/useSettingsAutoSave";
import GlassCard from "@/components/GlassCard";
import { ObjectUploader } from "@/components/ObjectUploader";
import ThermalPassDesigner from "@/components/ThermalPassDesigner";
import { IdCardDesignSystem } from "@/components/IdCardDesignSystem";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Printer, QrCode, Barcode, FileText, CreditCard, Move, User, Hash, Building, Scan, Settings2, Eye, Download, Copy, CalendarPlus, Dock, BadgeCheck, Ticket, Mail } from "lucide-react";

export default function PassSettings() {
  const { currentSettings, handleInputChange } = useSettingsAutoSave();
  const [printingSubTab, setPrintingSubTab] = useState("printer");

  return (
    <div className="space-y-6">
<Tabs value={printingSubTab} onValueChange={setPrintingSubTab} className="w-full">
  <TabsList className="grid w-full grid-cols-4 mb-6">
    <TabsTrigger value="printer" className="flex items-center gap-2">
      <Printer size={16} />
      Printer Settings
    </TabsTrigger>
    <TabsTrigger value="idcards" className="flex items-center gap-2">
      <CreditCard size={16} />
      ID Cards
    </TabsTrigger>
    <TabsTrigger value="thermal-passes" className="flex items-center gap-2">
      <FileText size={16} />
      Passes
    </TabsTrigger>
    <TabsTrigger value="qr-readers" className="flex items-center gap-2">
      <Scan size={16} />
      QR Readers
    </TabsTrigger>
  </TabsList>
  <TabsContent value="printer" className="space-y-6">
    <div className="space-y-6">
      <div className="p-6 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Printer className="text-white" size={20} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-blue-900 dark:text-blue-100 mb-1">Browser Print — Recommended</h3>
            <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
              TPR Max uses your browser's built-in print dialog. When a visitor or contractor
              checks in, a pass opens automatically in a new tab. Press <strong>Ctrl+P</strong>
              (or <strong>Cmd+P</strong> on Mac) to print to any printer your computer can see.
            </p>
            <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
              <li>&#10003; Works with any printer — USB, Wi-Fi, or network</li>
              <li>&#10003; No IP addresses, no TCP/IP configuration needed</li>
              <li>&#10003; Set paper size to 95 &times; 65 mm in the print dialog</li>
              <li>&#10003; Works in all modern browsers — Chrome, Edge, Firefox, Safari</li>
            </ul>
          </div>
        </div>
      </div>
    
      <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Print a Demo Pass</h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Preview how your visitor passes will look before going live.</p>
        <button
          type="button"
          onClick={() => window.open('/api/passes/print/visitor/demo', '_blank')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Open Demo Pass
        </button>
      </div>
    </div>
  </TabsContent>
  <TabsContent value="idcards" className="space-y-6">
    <IdCardDesignSystem />
  </TabsContent>
  <TabsContent value="thermal-passes" className="space-y-6">
    {/* E-Pass Configuration Section */}
    <GlassCard>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Mail className="mr-3 text-green-600" size={24} />
          <div>
            <h3 className="text-lg font-semibold text-fixed">Digital E-Pass Configuration</h3>
            <p className="text-sm text-variable">Send digital passes via email or SMS instead of printing</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge 
            variant="outline" 
            className={currentSettings?.ePassEnabled ? "bg-green-100 text-green-800 dark:text-green-300 border-green-300" : "bg-gray-100 text-gray-600 dark:text-gray-400"}
          >
            {currentSettings?.ePassEnabled ? "E-Pass Active" : "Physical Pass Active"}
          </Badge>
        </div>
      </div>
      
      <div className="space-y-6">
        {/* Main E-Pass Toggle */}
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Enable Digital E-Pass System
              </Label>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                Switch from physical pass printing to digital delivery via email/SMS
              </p>
            </div>
            <Switch
              checked={currentSettings?.ePassEnabled || false}
              onCheckedChange={(checked) => handleInputChange("ePassEnabled", checked)}
              className="data-[state=checked]:bg-green-600"
              data-testid="switch-e-pass-enabled"
            />
          </div>
        </div>
        {currentSettings?.ePassEnabled && (
          <>
            {/* Delivery Method */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-fixed">
                  E-Pass Delivery Method
                </Label>
                <Select
                  value={currentSettings?.ePassDeliveryMethod || "both"}
                  onValueChange={(value) => handleInputChange("ePassDeliveryMethod", value)}
                >
                  <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50" data-testid="select-epass-delivery">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email Only</SelectItem>
                    <SelectItem value="sms">SMS Only</SelectItem>
                    <SelectItem value="both">Email & SMS</SelectItem>
                    <SelectItem value="choice">Let Visitor Choose</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-variable">How e-Passes are delivered to visitors</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-fixed">
                  Check-out Reminder (minutes)
                </Label>
                <Input
                  type="number"
                  min="5"
                  max="120"
                  value={currentSettings?.ePassCheckoutReminderMinutes || "30"}
                  onChange={(e) => handleInputChange("ePassCheckoutReminderMinutes", e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
                  data-testid="input-checkout-reminder"
                />
                <p className="text-xs text-variable">Minutes before expected departure to send reminder</p>
              </div>
            </div>
            {/* Auto Check-out & Host Notifications */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border border-white/30 dark:border-slate-700/30">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <Label className="text-sm font-medium text-fixed">
                      Auto Check-out
                    </Label>
                    <p className="text-xs text-variable mt-1">
                      Automatically check out visitors after expected time
                    </p>
                  </div>
                  <Switch
                    checked={currentSettings?.ePassAutoCheckout !== false}
                    onCheckedChange={(checked) => handleInputChange("ePassAutoCheckout", checked)}
                    data-testid="switch-auto-checkout"
                  />
                </div>
              </div>
              <div className="p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border border-white/30 dark:border-slate-700/30">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <Label className="text-sm font-medium text-fixed">
                      Host Notifications
                    </Label>
                    <p className="text-xs text-variable mt-1">
                      Notify host if visitor hasn't checked out
                    </p>
                  </div>
                  <Switch
                    checked={currentSettings?.ePassHostNotificationEnabled !== false}
                    onCheckedChange={(checked) => handleInputChange("ePassHostNotificationEnabled", checked)}
                    data-testid="switch-host-notification"
                  />
                </div>
                {currentSettings?.ePassHostNotificationEnabled && (
                  <div className="mt-3">
                    <Label className="text-xs text-variable">Notification Delay (min)</Label>
                    <Input
                      type="number"
                      min="15"
                      max="180"
                      value={currentSettings?.ePassHostNotificationDelay || "60"}
                      onChange={(e) => handleInputChange("ePassHostNotificationDelay", e.target.value)}
                      className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
                      data-testid="input-host-delay"
                    />
                  </div>
                )}
              </div>
            </div>
            {/* SMS Configuration with Twilio */}
            {(currentSettings?.ePassDeliveryMethod === "sms" || currentSettings?.ePassDeliveryMethod === "both" || currentSettings?.ePassDeliveryMethod === "choice") && (
              <div className="space-y-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-purple-800 dark:text-purple-200 flex items-center gap-2">
                    <Phone size={18} />
                    Twilio SMS Configuration
                  </h4>
                  <Switch
                    checked={currentSettings?.twilioEnabled || false}
                    onCheckedChange={(checked) => handleInputChange("twilioEnabled", checked)}
                    data-testid="switch-twilio-enabled"
                  />
                </div>
                
                {currentSettings?.twilioEnabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-purple-700">Account SID</Label>
                      <Input
                        type="text"
                        value={currentSettings?.twilioAccountSid || ""}
                        onChange={(e) => handleInputChange("twilioAccountSid", e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-purple-200 bg-white"
                        placeholder=""
                        data-testid="input-twilio-sid"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-purple-700">Auth Token</Label>
                      <Input
                        type="password"
                        value={currentSettings?.twilioAuthToken || ""}
                        onChange={(e) => handleInputChange("twilioAuthToken", e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-purple-200 bg-white"
                        placeholder=""
                        data-testid="input-twilio-token"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-purple-700">Phone Number</Label>
                      <Input
                        type="tel"
                        value={currentSettings?.twilioPhoneNumber || ""}
                        onChange={(e) => handleInputChange("twilioPhoneNumber", e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-purple-200 bg-white"
                        placeholder=""
                        data-testid="input-twilio-phone"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-purple-700">Messaging Service SID (Optional)</Label>
                      <Input
                        type="text"
                        value={currentSettings?.twilioMessagingServiceSid || ""}
                        onChange={(e) => handleInputChange("twilioMessagingServiceSid", e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-purple-200 bg-white"
                        placeholder=""
                        data-testid="input-twilio-messaging-sid"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Geofencing Configuration */}
            <div className="space-y-4 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-orange-800 dark:text-orange-200 flex items-center gap-2">
                  <Globe size={18} />
                  Geofencing Auto Check-out
                </h4>
                <Switch
                  checked={currentSettings?.geofencingEnabled || false}
                  onCheckedChange={(checked) => handleInputChange("geofencingEnabled", checked)}
                  data-testid="switch-geofencing"
                />
              </div>
              
              {currentSettings?.geofencingEnabled && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-orange-700">Radius (meters)</Label>
                    <Input
                      type="number"
                      min="50"
                      max="500"
                      value={currentSettings?.geofenceRadius || "100"}
                      onChange={(e) => handleInputChange("geofenceRadius", e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-orange-200 bg-white"
                      data-testid="input-geofence-radius"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-orange-700">Latitude</Label>
                    <Input
                      type="text"
                      value={currentSettings?.geofenceLat || ""}
                      onChange={(e) => handleInputChange("geofenceLat", e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-orange-200 bg-white"
                      placeholder=""
                      data-testid="input-geofence-lat"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-orange-700">Longitude</Label>
                    <Input
                      type="text"
                      value={currentSettings?.geofenceLng || ""}
                      onChange={(e) => handleInputChange("geofenceLng", e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-orange-200 bg-white"
                      placeholder=""
                      data-testid="input-geofence-lng"
                    />
                  </div>
                </div>
              )}
            </div>
            {/* X-Station 2 Integration */}
            <div className="space-y-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-indigo-800 dark:text-indigo-200 flex items-center gap-2">
                  <Scan size={18} />
                  BioStar X-Station 2 QR Check-out
                </h4>
                <Switch
                  checked={currentSettings?.xStationEnabled || false}
                  onCheckedChange={(checked) => handleInputChange("xStationEnabled", checked)}
                  data-testid="switch-xstation"
                />
              </div>
              
              {currentSettings?.xStationEnabled && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-indigo-700">X-Station API Endpoint</Label>
                      <Input
                        type="url"
                        value={currentSettings?.xStationApiEndpoint || ""}
                        onChange={(e) => handleInputChange("xStationApiEndpoint", e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-indigo-200 bg-white"
                        placeholder=""
                        data-testid="input-xstation-api"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-indigo-700">Check-out Mode</Label>
                      <Select
                        value={currentSettings?.xStationCheckoutMode || "qr"}
                        onValueChange={(value) => handleInputChange("xStationCheckoutMode", value)}
                      >
                        <SelectTrigger className="w-full px-3 py-2 text-sm rounded-lg border border-indigo-200 bg-white" data-testid="select-xstation-mode">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="qr">QR Code Only</SelectItem>
                          <SelectItem value="face">Face Recognition Only</SelectItem>
                          <SelectItem value="both">QR + Face Recognition</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-indigo-700">X-Station Device IPs/IDs</Label>
                    <p className="text-xs text-indigo-600 mb-2">Add IP addresses or device IDs, one per line</p>
                    <textarea
                      value={(currentSettings?.xStationDevices || []).join('\n')}
                      onChange={(e) => handleInputChange("xStationDevices", e.target.value.split('\n').filter(d => d.trim()))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-indigo-200 bg-white h-20 font-mono"
                      placeholder=""
                      data-testid="textarea-xstation-devices"
                    />
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </GlassCard>
    {/* Show Physical Pass Designer only when e-Pass is disabled */}
    {!currentSettings?.ePassEnabled && (
      <ThermalPassDesigner />
    )}
    
    {/* Show e-Pass preview when enabled */}
    {currentSettings?.ePassEnabled && (
      <GlassCard>
        <div className="flex items-center mb-6">
          <Eye className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
          <h3 className="text-lg font-semibold text-fixed">E-Pass Preview</h3>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-6 rounded-lg">
          <div className="max-w-md mx-auto">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl overflow-hidden border border-slate-200 dark:border-slate-700">
              {/* Header with Company Branding */}
              <div 
                className="p-5 text-white text-center relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${currentSettings?.accentColor || '#3b82f6'} 0%, ${currentSettings?.accentColor || '#3b82f6'}ee 100%)`
                }}
              >
                {currentSettings?.logoUrl && (
                  <img 
                    src={`/objects${currentSettings.logoUrl}`}
                    alt="Company Logo" 
                    className="h-10 mx-auto mb-2 filter brightness-0 invert"
                    onError={(e) => e.currentTarget.style.display = 'none'}
                  />
                )}
                <h4 className="text-lg font-bold">Digital Visitor Pass</h4>
                {!currentSettings?.logoUrl && (
                  <p className="text-sm opacity-95 mt-1">{currentSettings?.companyName || "VisiGate Pro"}</p>
                )}
              </div>
              
              {/* Pass Content */}
              <div className="p-6 space-y-5" style={{ backgroundColor: currentSettings?.backgroundColor || '#ffffff' }}>
                {/* QR Code */}
                <div className="bg-gradient-to-b from-white to-gray-50 dark:from-slate-700 dark:to-slate-800 p-5 rounded-xl border-2 border-gray-100 dark:border-slate-600 text-center">
                  <div className="inline-block p-3 bg-white dark:bg-slate-900 rounded-lg shadow-lg">
                    <QrCode size={100} style={{ color: currentSettings?.foregroundColor || '#1e293b' }} />
                  </div>
                  <p className="font-bold text-base mt-3" style={{ color: currentSettings?.foregroundColor || '#1e293b' }}>
                    PASS ID: VIS-2025-001
                  </p>
                  <p className="text-xs opacity-75 mt-1" style={{ color: currentSettings?.variableTextColor || '#374151' }}>
                    Show this at exit scanners
                  </p>
                </div>
                
                {/* Visitor Details */}
                <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-600 p-4">
                  <h5 className="font-semibold text-sm mb-3 pb-2 border-b flex items-center gap-2" 
                      style={{ 
                        color: currentSettings?.foregroundColor || '#1e293b',
                        borderColor: `${currentSettings?.accentColor || '#3b82f6'}30`
                      }}>
                    📋 Visit Details
                  </h5>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span style={{ color: currentSettings?.variableTextColor || '#374151' }}>Visitor:</span>
                      <span className="font-semibold" style={{ color: currentSettings?.foregroundColor || '#1e293b' }}>John Doe</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: currentSettings?.variableTextColor || '#374151' }}>Company:</span>
                      <span className="font-semibold" style={{ color: currentSettings?.foregroundColor || '#1e293b' }}>Acme Corp</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: currentSettings?.variableTextColor || '#374151' }}>Host:</span>
                      <span className="font-semibold" style={{ color: currentSettings?.foregroundColor || '#1e293b' }}>Jane Smith</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: currentSettings?.variableTextColor || '#374151' }}>Check-in:</span>
                      <span className="font-semibold" style={{ color: currentSettings?.foregroundColor || '#1e293b' }}>10:00 AM</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: currentSettings?.variableTextColor || '#374151' }}>Valid Until:</span>
                      <span className="font-semibold" style={{ color: currentSettings?.foregroundColor || '#1e293b' }}>5:00 PM</span>
                    </div>
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg">
                    📱 View Digital Pass
                  </Button>
                </div>
                
                {/* Important Notes */}
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg p-3 border-l-4 border-amber-500">
                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 mb-1">⚠️ Important Reminders</p>
                  <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-0.5 ml-4 list-disc">
                    <li>Check out when leaving</li>
                    <li>Keep pass on your phone</li>
                    {currentSettings?.geofencingEnabled && <li>✅ Auto check-out enabled</li>}
                  </ul>
                </div>
              </div>
              
              {/* Footer */}
              <div className="px-5 py-3 text-center border-t" style={{ backgroundColor: currentSettings?.backgroundColor || '#f9fafb' }}>
                <p className="text-xs opacity-60" style={{ color: currentSettings?.variableTextColor || '#374151' }}>
                  {currentSettings?.companyName || "Your Company"} • {currentSettings?.address || "Your Address"}
                </p>
                <p className="text-xs opacity-40 mt-1">Powered by VisiGate Pro</p>
              </div>
            </div>
            
            <div className="mt-4 text-center">
              <Badge variant="secondary" className="text-xs">
                Delivery Method: {currentSettings?.ePassDeliveryMethod === "both" ? "Email & SMS" : 
                                currentSettings?.ePassDeliveryMethod === "email" ? "Email Only" : 
                                currentSettings?.ePassDeliveryMethod === "sms" ? "SMS Only" : "Visitor Choice"}
              </Badge>
              <p className="text-xs text-variable mt-2">
                This preview shows how the e-Pass will appear on mobile devices
              </p>
            </div>
          </div>
        </div>
      </GlassCard>
    )}
  </TabsContent>
  <TabsContent value="qr-readers" className="space-y-6">
    {/* CLUe Cloud Platform Integration Section */}
    <GlassCard>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Shield className="mr-3 text-green-600" size={24} />
          <div>
            <h3 className="text-lg font-semibold text-fixed">Suprema CLUe Cloud Platform</h3>
            <p className="text-xs text-variable">Enterprise-grade cloud integration for X-Station 2 devices</p>
          </div>
        </div>
        <Switch
          checked={currentSettings?.clueEnabled === true}
          onCheckedChange={(checked) => handleInputChange("clueEnabled", checked)}
          data-testid="switch-clue-enabled"
        />
      </div>
      
      {currentSettings?.clueEnabled && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-fixed">API Key</Label>
              <Input
                type="password"
                value={currentSettings?.clueApiKey || ""}
                onChange={(e) => handleInputChange("clueApiKey", e.target.value)}
                placeholder=""
                className="font-mono"
                data-testid="input-clue-api-key"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium text-fixed">API Secret</Label>
              <Input
                type="password"
                value={currentSettings?.clueApiSecret || ""}
                onChange={(e) => handleInputChange("clueApiSecret", e.target.value)}
                placeholder=""
                className="font-mono"
                data-testid="input-clue-api-secret"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-fixed">Organization ID</Label>
              <Input
                value={currentSettings?.clueOrganizationId || ""}
                onChange={(e) => handleInputChange("clueOrganizationId", e.target.value)}
                placeholder=""
                data-testid="input-clue-org-id"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium text-fixed">Webhook Secret</Label>
              <Input
                type="password"
                value={currentSettings?.clueWebhookSecret || ""}
                onChange={(e) => handleInputChange("clueWebhookSecret", e.target.value)}
                placeholder=""
                className="font-mono"
                data-testid="input-clue-webhook-secret"
              />
            </div>
          </div>
          
          <Separator className="my-4" />
          
          <div className="space-y-4">
            <h4 className="font-medium text-fixed">QR Code Settings</h4>
            
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-fixed">Dynamic QR Codes</Label>
                <p className="text-xs text-variable">Generate single-use QR codes for enhanced security</p>
              </div>
              <Switch
                checked={currentSettings?.clueDynamicQrEnabled === true}
                onCheckedChange={(checked) => handleInputChange("clueDynamicQrEnabled", checked)}
                data-testid="switch-clue-dynamic-qr"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium text-fixed">QR Validity Period (minutes)</Label>
              <Input
                type="number"
                value={currentSettings?.clueQrValidityMinutes || "60"}
                onChange={(e) => handleInputChange("clueQrValidityMinutes", e.target.value)}
                min="1"
                max="1440"
                data-testid="input-clue-qr-validity"
              />
              <p className="text-xs text-variable">How long QR codes remain valid after generation</p>
            </div>
          </div>
          
          <Separator className="my-4" />
          
          <div className="space-y-4">
            <h4 className="font-medium text-fixed">Automation Settings</h4>
            
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-fixed">Auto-Register Visitors</Label>
                <p className="text-xs text-variable">Automatically sync visitors to CLUe platform</p>
              </div>
              <Switch
                checked={currentSettings?.clueAutoRegisterVisitors === true}
                onCheckedChange={(checked) => handleInputChange("clueAutoRegisterVisitors", checked)}
                data-testid="switch-clue-auto-register"
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-fixed">Auto-Delete Expired</Label>
                <p className="text-xs text-variable">Remove expired QR codes from CLUe automatically</p>
              </div>
              <Switch
                checked={currentSettings?.clueAutoDeleteExpired === true}
                onCheckedChange={(checked) => handleInputChange("clueAutoDeleteExpired", checked)}
                data-testid="switch-clue-auto-delete"
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-fixed">Test Mode</Label>
                <p className="text-xs text-variable">Enable for development and testing</p>
              </div>
              <Switch
                checked={currentSettings?.clueTestMode === true}
                onCheckedChange={(checked) => handleInputChange("clueTestMode", checked)}
                data-testid="switch-clue-test-mode"
              />
            </div>
          </div>
          
          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={async () => {
                toast({
                  title: "Testing CLUe Connection",
                  description: "Verifying API credentials and connectivity...",
                });
                
                try {
                  const response = await apiRequest("POST", "/api/clue/test-connection");
                  const data = await response.json();
                  
                  if (data.success) {
                    toast({
                      title: "Connection Successful",
                      description: data.message,
                    });
                  } else {
                    toast({
                      title: "Connection Failed",
                      description: data.message,
                      variant: "destructive"
                    });
                  }
                } catch (error) {
                  toast({
                    title: "Connection Error",
                    description: "Failed to test CLUe connection",
                    variant: "destructive"
                  });
                }
              }}
              data-testid="button-test-clue"
            >
              <TestTube className="mr-2" size={16} />
              Test Connection
            </Button>
            
            <Button
              variant="outline"
              className="flex-1"
              onClick={async () => {
                toast({
                  title: "Syncing with CLUe",
                  description: "Synchronizing devices and users...",
                });
                
                try {
                  const response = await apiRequest("POST", "/api/clue/sync");
                  const data = await response.json();
                  
                  if (data.success) {
                    toast({
                      title: "Sync Complete",
                      description: `Synced ${data.synced} items. ${data.failed} failed.`,
                    });
                    
                    // Update the last sync timestamp
                    queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
                  } else {
                    toast({
                      title: "Sync Failed",
                      description: "Failed to sync with CLUe platform",
                      variant: "destructive"
                    });
                  }
                } catch (error) {
                  toast({
                    title: "Sync Error",
                    description: "Failed to sync with CLUe",
                    variant: "destructive"
                  });
                }
              }}
              data-testid="button-sync-clue"
            >
              <RefreshCw className="mr-2" size={16} />
              Sync Now
            </Button>
          </div>
          
          {currentSettings?.clueLastSync && (
            <div className="text-xs text-variable text-center">
              Last synchronized: {new Date(currentSettings.clueLastSync).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </GlassCard>
    
    {/* CLUe X-Station 2 Devices */}
    {currentSettings?.clueEnabled && (
      <GlassCard>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Server className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
            <h3 className="text-lg font-semibold text-fixed">X-Station 2 Devices</h3>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const response = await apiRequest("GET", "/api/clue/devices");
                const data = await response.json();
                
                if (data.success && data.devices) {
                  toast({
                    title: `Found ${data.count} device(s)`,
                    description: "Device list refreshed successfully",
                  });
                }
              } catch (error) {
                toast({
                  title: "Failed to fetch devices",
                  description: "Could not retrieve device list",
                  variant: "destructive"
                });
              }
            }}
            data-testid="button-refresh-devices"
          >
            <RefreshCw className="mr-2" size={16} />
            Refresh
          </Button>
        </div>
        
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <Monitor className="mr-2 text-green-600" size={20} />
                <div>
                  <p className="font-medium text-fixed">X-Station 2 - Main Entrance</p>
                  <p className="text-xs text-variable">Device ID: XS2-001 • IP: 192.168.1.100</p>
                </div>
              </div>
              <Badge className="bg-green-100 text-green-800 dark:text-green-300">Online</Badge>
            </div>
            <div className="text-xs text-variable mt-2">
              Location: Building A, Main Lobby • Last seen: Just now
            </div>
          </div>
          
          <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <Monitor className="mr-2 text-green-600" size={20} />
                <div>
                  <p className="font-medium text-fixed">X-Station 2 - Side Entrance</p>
                  <p className="text-xs text-variable">Device ID: XS2-002 • IP: 192.168.1.101</p>
                </div>
              </div>
              <Badge className="bg-green-100 text-green-800 dark:text-green-300">Online</Badge>
            </div>
            <div className="text-xs text-variable mt-2">
              Location: Building A, Side Door • Last seen: 2 minutes ago
            </div>
          </div>
          
          <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <Monitor className="mr-2 text-gray-400" size={20} />
                <div>
                  <p className="font-medium text-fixed">X-Station 2 - Reception</p>
                  <p className="text-xs text-variable">Device ID: XS2-003 • IP: 192.168.1.102</p>
                </div>
              </div>
              <Badge className="bg-gray-100 text-gray-800 dark:text-gray-200">Offline</Badge>
            </div>
            <div className="text-xs text-variable mt-2">
              Location: Reception Desk • Last seen: 1 hour ago
            </div>
          </div>
          
          <div className="text-center text-xs text-variable pt-2">
            Configure devices in CLUe Cloud Platform dashboard
          </div>
        </div>
      </GlassCard>
    )}
    
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <GlassCard>
        <div className="flex items-center mb-6">
          <QrCode className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
          <h3 className="text-lg font-semibold text-fixed">QR Reader Detection</h3>
        </div>
        
        <div className="space-y-4">
          <Button
            className="gradient-blue text-white w-full"
            data-testid="button-scan-qr-readers"
          >
            <Scan className="mr-2" size={16} />
            Scan for QR Readers
          </Button>
          
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Supported Devices:</h4>
            <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
              <li>• USB QR/Barcode scanners (HID mode)</li>
              <li>• Serial port QR readers (COM/TTY)</li>
              <li>• Ethernet-enabled QR scanners</li>
              <li>• Keyboard wedge scanners</li>
              <li className="font-semibold">• Suprema X-Station 2 (via CLUe/BioStar)</li>
              <li className="ml-4">- Cloud-based integration</li>
              <li className="ml-4">- Dynamic QR codes</li>
              <li className="ml-4">- Real-time webhook events</li>
            </ul>
          </div>
        </div>
      </GlassCard>
      <GlassCard>
        <div className="flex items-center mb-6">
          <Settings2 className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
          <h3 className="text-lg font-semibold text-fixed">Reader Configuration</h3>
        </div>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-fixed">
              Default Reader Mode
            </Label>
            <Select 
              value={currentSettings?.qrReaderDevice || "auto"} 
              onValueChange={(value) => handleInputChange("qrReaderDevice", value)}
            >
              <SelectTrigger data-testid="select-qr-reader-mode">
                <SelectValue placeholder="Select reader mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-detect</SelectItem>
                <SelectItem value="usb">USB Only</SelectItem>
                <SelectItem value="serial">Serial Port Only</SelectItem>
                <SelectItem value="ethernet">Ethernet Only</SelectItem>
                <SelectItem value="keyboard">Keyboard Wedge</SelectItem>
                <SelectItem value="xstation">X-Station 2 (BioStar)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-fixed">
              Scan Timeout (seconds)
            </Label>
            <Input
              type="number"
              min="1"
              max="30"
              value={currentSettings?.clueQrValidityMinutes || "60"}
              onChange={(e) => handleInputChange("clueQrValidityMinutes", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
              data-testid="input-qr-scan-timeout"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-fixed">
                Audio Feedback
              </Label>
              <p className="text-xs text-variable">Play sound on successful scan</p>
            </div>
            <Switch
              checked={currentSettings?.qrReaderEnabled || false}
              onCheckedChange={(checked) => handleInputChange("qrReaderEnabled", checked)}
              data-testid="switch-qr-audio-feedback"
            />
          </div>
        </div>
      </GlassCard>
    </div>
    {/* X-Station 2 Configuration */}
    {currentSettings?.qrReaderDevice === 'xstation' && (
      <GlassCard>
        <div className="flex items-center mb-6">
          <Shield className="mr-3 text-indigo-600" size={24} />
          <h3 className="text-lg font-semibold text-fixed">X-Station 2 Configuration</h3>
        </div>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-fixed">
              X-Station IP Addresses
            </Label>
            <textarea
              value={(currentSettings?.xStationDevices || []).join('\n')}
              onChange={(e) => handleInputChange("xStationDevices", e.target.value.split('\n').filter(d => d.trim()))}
              className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 h-32 font-mono text-sm"
              placeholder=""
              data-testid="textarea-xstation-ips"
            />
            <p className="text-xs text-variable">Enter one IP address per line</p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-fixed">
              Pre-booking QR Support
            </Label>
            <Switch
              checked={currentSettings?.xStationEnabled || false}
              onCheckedChange={(checked) => handleInputChange("xStationEnabled", checked)}
              data-testid="switch-xstation-prebooking"
            />
            <p className="text-xs text-variable">
              Allow pre-booked visitors and contractors to check in using X-Station QR readers
            </p>
          </div>
          <div className="mt-4 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
            <h4 className="font-medium text-indigo-800 mb-2">X-Station Features:</h4>
            <ul className="text-sm text-indigo-700 space-y-1">
              <li>✓ Visitor QR code checkout</li>
              <li>✓ Pre-booking QR code check-in</li>
              <li>✓ Contractor QR validation</li>
              <li>✓ Network-based communication</li>
              <li>✓ BioStar 2 integration</li>
            </ul>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              toast({
                title: "Testing X-Station Connection",
                description: "Attempting to connect to configured X-Station devices...",
              });
            }}
            data-testid="button-test-xstation"
          >
            <Scan className="mr-2" size={16} />
            Test X-Station Connection
          </Button>
        </div>
      </GlassCard>
    )}
    <GlassCard>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <QrCode className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
          <h3 className="text-lg font-semibold text-fixed">Connected QR Readers</h3>
        </div>
        <Button
          variant="outline"
          className="text-blue-600 dark:text-blue-400 border-blue-300"
          data-testid="button-refresh-readers"
        >
          <RefreshCw className="mr-2" size={16} />
          Refresh
        </Button>
      </div>
      <div className="space-y-4">
        {/* Mock connected readers - will be populated from API */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-green-50 dark:bg-green-950/300 rounded-full"></div>
                <h4 className="font-semibold text-green-800 dark:text-green-200">USB QR Scanner</h4>
              </div>
              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:text-green-300">USB</Badge>
            </div>
            <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
              <p><strong>Port:</strong> COM3</p>
              <p><strong>Status:</strong> Connected</p>
              <p><strong>Last Scan:</strong> 2 minutes ago</p>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" className="text-blue-600 dark:text-blue-400 border-blue-300">
                <Settings2 size={14} className="mr-1" />
                Configure
              </Button>
              <Button size="sm" variant="outline" className="text-variable border-slate-300">
                <TestTube size={14} className="mr-1" />
                Test
              </Button>
            </div>
          </div>
          <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-blue-50 dark:bg-blue-950/300 rounded-full"></div>
                <h4 className="font-semibold text-blue-800 dark:text-blue-200">Ethernet Scanner</h4>
              </div>
              <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:text-blue-300">Ethernet</Badge>
            </div>
            <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
              <p><strong>IP:</strong> 192.168.1.100</p>
              <p><strong>Status:</strong> Connected</p>
              <p><strong>Last Scan:</strong> 5 minutes ago</p>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" className="text-blue-600 dark:text-blue-400 border-blue-300">
                <Settings2 size={14} className="mr-1" />
                Configure
              </Button>
              <Button size="sm" variant="outline" className="text-variable border-slate-300">
                <TestTube size={14} className="mr-1" />
                Test
              </Button>
            </div>
          </div>
        </div>
        
        <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
          <QrCode className="mx-auto mb-4 text-variable" size={48} />
          <p className="text-variable mb-4">Add Additional QR Reader</p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" className="text-blue-600 dark:text-blue-400 border-blue-300">
              <Plus className="mr-2" size={16} />
              Add USB Reader
            </Button>
            <Button variant="outline" className="text-purple-600 border-purple-300">
              <Globe className="mr-2" size={16} />
              Add Ethernet Reader
            </Button>
          </div>
        </div>
      </div>
    </GlassCard>
    <GlassCard>
      <div className="flex items-center mb-6">
        <TestTube className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
        <h3 className="text-lg font-semibold text-fixed">QR Reader Testing</h3>
      </div>
      
      <div className="space-y-4">
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">Test Mode Active</h4>
          <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
            Scan any QR code or barcode to test your readers. Results will appear below.
          </p>
          <Button className="gradient-blue text-white">
            <Scan className="mr-2" size={16} />
            Start Test Scan
          </Button>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
          <h4 className="font-medium text-slate-800 dark:text-slate-200 mb-3">Recent Scan Results</h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            <div className="text-sm text-slate-600 dark:text-slate-400 p-2 bg-white dark:bg-slate-700 rounded">
              <span className="font-mono">VIS-2025-001234</span> - <span className="text-green-600">USB Scanner</span> - <span className="text-xs">2 minutes ago</span>
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400 p-2 bg-white dark:bg-slate-700 rounded">
              <span className="font-mono">STAFF-ENG-456</span> - <span className="text-blue-600 dark:text-blue-400">Ethernet Scanner</span> - <span className="text-xs">5 minutes ago</span>
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  </TabsContent>
</Tabs>
    </div>
  );
}
