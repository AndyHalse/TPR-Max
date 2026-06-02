import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Bot, Building2, Palette, Users, Building, Globe, Mail, Phone, FileText, Printer, HardHat, AlertTriangle, Brain, Wrench, Settings2, Bell, ScrollText, MapPin, Shield, ClipboardList, Briefcase, PenLine, PanelLeft } from "lucide-react";

import GeneralSettings from "./settings/GeneralSettings";
import BrandingSettings from "./settings/BrandingSettings";
import SecuritySettings from "./settings/SecuritySettings";
import DepartmentsSettings from "./settings/DepartmentsSettings";
import EmergencySettings from "./settings/EmergencySettings";
import EmailSettings from "./settings/EmailSettings";
import NotificationSettings from "./settings/NotificationSettings";
import PassSettings from "./settings/PassSettings";
import InductionSettings from "./settings/InductionSettings";
import NdaSettings from "./settings/NdaSettings";
import HsDocumentsSettings from "./settings/HsDocumentsSettings";
import ContractorSettings from "./settings/ContractorSettings";
import AiSettings from "./settings/AiSettings";
import IntegrationSettings from "./settings/IntegrationSettings";
import SsoSettings from "./settings/SsoSettings";
import PhoneSystemsSettings from "./settings/PhoneSystemsSettings";
import LoneWorkerSettings from "./settings/LoneWorkerSettings";
import SystemSettings from "./settings/SystemSettings";
import VisitReasonsSettings from "./settings/VisitReasonsSettings";
import JobTitlesSettings from "./settings/JobTitlesSettings";
import PreferencesSettings from "./settings/PreferencesSettings";

export default function Settings() {
  const [activeTab, setActiveTab] = useState("company");

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6 rounded-xl bg-background min-h-screen">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl sm:text-2xl font-bold text-fixed">Settings</h2>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link to="/settings/ai">
            <Button
              variant="outline"
              size="sm"
              className="border-purple-200 text-purple-700 hover:bg-purple-50 font-medium transition-all duration-300"
              data-testid="link-ai-settings"
            >
              <Bot size={15} />
              <span className="hidden sm:inline ml-2">AI Settings</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Auto-save information banner */}
      <div className="flex items-center gap-2 p-3 sm:p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
        <div className="h-2 w-2 flex-shrink-0 bg-green-500 rounded-full animate-pulse"></div>
        <p className="text-xs sm:text-sm text-green-800 dark:text-green-300 font-medium">
          ✨ Auto-save enabled — changes saved after 1.5 seconds
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Mobile (< md): full-width dropdown selector */}
        <div className="md:hidden mb-4">
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full h-11 text-sm font-medium">
              <SelectValue placeholder="Select section…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="company">Company</SelectItem>
              <SelectItem value="branding">Branding</SelectItem>
              <SelectItem value="users">Users</SelectItem>
              <SelectItem value="departments">Departments</SelectItem>
              <SelectItem value="zones">Zones</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="phone-systems">Phone Systems</SelectItem>
              <SelectItem value="reports">Reports</SelectItem>
              <SelectItem value="printing">Printing &amp; ID</SelectItem>
              <SelectItem value="hs-documents">H&amp;S Documents</SelectItem>
              <SelectItem value="hsrules">H&amp;S Rules</SelectItem>
              <SelectItem value="nda">NDA</SelectItem>
              <SelectItem value="contractors">Card Offences</SelectItem>
              <SelectItem value="ai">AI Settings</SelectItem>
              <SelectItem value="integrations">Integrations</SelectItem>
              <SelectItem value="sso">Single Sign-On</SelectItem>
              <SelectItem value="visit-reasons">Visit Reasons</SelectItem>
              <SelectItem value="job-titles">Job Titles</SelectItem>
              <SelectItem value="lone-worker">Lone Worker</SelectItem>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="preferences">My Preferences</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Desktop tab bar */}
        <TabsList className="hidden md:flex flex-wrap h-auto gap-1 p-1 bg-muted/50 rounded-xl mb-2">
          <TabsTrigger value="company" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Building2 size={14} />Company
          </TabsTrigger>
          <TabsTrigger value="branding" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Palette size={14} />Branding
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Users size={14} />Users
          </TabsTrigger>
          <TabsTrigger value="departments" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Building size={14} />Departments
          </TabsTrigger>
          <TabsTrigger value="zones" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <MapPin size={14} />Zones
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Mail size={14} />Email
          </TabsTrigger>
          <TabsTrigger value="phone-systems" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Phone size={14} />Phone Systems
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <FileText size={14} />Reports
          </TabsTrigger>
          <TabsTrigger value="printing" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Printer size={14} />Printing &amp; ID
          </TabsTrigger>
          <TabsTrigger value="hs-documents" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <ScrollText size={14} />H&amp;S Docs
          </TabsTrigger>
          <TabsTrigger value="hsrules" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <HardHat size={14} />H&amp;S Rules
          </TabsTrigger>
          <TabsTrigger value="nda" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <PenLine size={14} />NDA
          </TabsTrigger>
          <TabsTrigger value="contractors" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <AlertTriangle size={14} />Card Offences
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Brain size={14} />AI Settings
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Settings2 size={14} />Integrations
          </TabsTrigger>
          <TabsTrigger value="sso" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Shield size={14} />SSO
          </TabsTrigger>
          <TabsTrigger value="visit-reasons" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <ClipboardList size={14} />Visit Reasons
          </TabsTrigger>
          <TabsTrigger value="job-titles" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Briefcase size={14} />Job Titles
          </TabsTrigger>
          <TabsTrigger value="lone-worker" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Bell size={14} />Lone Worker
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Wrench size={14} />System
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <PanelLeft size={14} />My Preferences
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="space-y-6 mt-6"><GeneralSettings /></TabsContent>
        <TabsContent value="branding" className="space-y-6 mt-6"><BrandingSettings /></TabsContent>
        <TabsContent value="users" className="space-y-6 mt-6"><SecuritySettings /></TabsContent>
        <TabsContent value="departments" className="space-y-6 mt-6"><DepartmentsSettings /></TabsContent>
        <TabsContent value="zones" className="space-y-6 mt-6"><EmergencySettings /></TabsContent>
        <TabsContent value="email" className="space-y-6 mt-6"><EmailSettings /></TabsContent>
        <TabsContent value="phone-systems" className="space-y-6 mt-6"><PhoneSystemsSettings /></TabsContent>
        <TabsContent value="reports" className="space-y-6 mt-6"><NotificationSettings /></TabsContent>
        <TabsContent value="printing" className="space-y-6 mt-6"><PassSettings /></TabsContent>
        <TabsContent value="hs-documents" className="space-y-6 mt-6"><HsDocumentsSettings /></TabsContent>
        <TabsContent value="hsrules" className="space-y-6 mt-6"><InductionSettings /></TabsContent>
        <TabsContent value="nda" className="space-y-6 mt-6"><NdaSettings /></TabsContent>
        <TabsContent value="contractors" className="space-y-6 mt-6"><ContractorSettings /></TabsContent>
        <TabsContent value="ai" className="space-y-6 mt-6"><AiSettings /></TabsContent>
        <TabsContent value="integrations" className="space-y-6 mt-6"><IntegrationSettings /></TabsContent>
        <TabsContent value="sso" className="space-y-6 mt-6"><SsoSettings /></TabsContent>
        <TabsContent value="visit-reasons" className="space-y-6 mt-6"><VisitReasonsSettings /></TabsContent>
        <TabsContent value="job-titles" className="space-y-6 mt-6"><JobTitlesSettings /></TabsContent>
        <TabsContent value="lone-worker" className="space-y-6 mt-6"><LoneWorkerSettings /></TabsContent>
        <TabsContent value="system" className="space-y-6 mt-6"><SystemSettings /></TabsContent>
        <TabsContent value="preferences" className="space-y-6 mt-6"><PreferencesSettings /></TabsContent>
      </Tabs>
    </div>
  );
}
