import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Bot, Building2, Palette, Users, Building, Globe, Mail, Phone, FileText, Printer, HardHat, AlertTriangle, Brain, Wrench, Settings2, Bell, ScrollText, MapPin, Shield, ClipboardList, Briefcase, PenLine, PanelLeft, CheckCircle2, Circle, X, Rocket } from "lucide-react";
import { apiRequest, queryClient as globalQueryClient } from "@/lib/queryClient";

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

interface QuickSetupStatus {
  complete: boolean;
  dismissed: boolean;
  items: {
    companyLogoSet: boolean;
    emergencyEmailSet: boolean;
    emailSmtpConfigured: boolean;
    mustersPointNamed: boolean;
  };
}

const QUICK_SETUP_ITEMS = [
  {
    key: "companyLogoSet" as const,
    labelKey: "quickSetup.items.companyLogoLabel",
    hintKey: "quickSetup.items.companyLogoHint",
    tab: "branding",
  },
  {
    key: "emergencyEmailSet" as const,
    labelKey: "quickSetup.items.emergencyEmailLabel",
    hintKey: "quickSetup.items.emergencyEmailHint",
    tab: "company",
  },
  {
    key: "emailSmtpConfigured" as const,
    labelKey: "quickSetup.items.emailSmtpLabel",
    hintKey: "quickSetup.items.emailSmtpHint",
    tab: "email",
  },
  {
    key: "mustersPointNamed" as const,
    labelKey: "quickSetup.items.musterPointLabel",
    hintKey: "quickSetup.items.musterPointHint",
    tab: "zones",
  },
];

export default function Settings() {
  const { t } = useTranslation("settingsPage");
  const [activeTab, setActiveTab] = useState("company");
  const tabsRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: quickSetup } = useQuery<QuickSetupStatus>({
    queryKey: ["/api/settings/quick-setup-status"],
  });

  const dismissMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/settings/quick-setup-dismiss"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/settings/quick-setup-status"] });
    },
  });

  const showPanel =
    quickSetup && !quickSetup.dismissed && !quickSetup.complete;

  const completedCount = quickSetup
    ? Object.values(quickSetup.items).filter(Boolean).length
    : 0;
  const totalCount = QUICK_SETUP_ITEMS.length;

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6 rounded-xl bg-background min-h-screen">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl sm:text-2xl font-bold text-fixed">{t("title")}</h2>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link to="/settings/ai">
            <Button
              variant="outline"
              size="sm"
              className="border-purple-200 text-purple-700 hover:bg-purple-50 font-medium transition-all duration-300"
              data-testid="link-ai-settings"
            >
              <Bot size={15} />
              <span className="hidden sm:inline ml-2">{t("aiSettings")}</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Auto-save information banner */}
      <div className="flex items-center gap-2 p-3 sm:p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
        <div className="h-2 w-2 flex-shrink-0 bg-green-500 rounded-full animate-pulse"></div>
        <p className="text-xs sm:text-sm text-green-800 dark:text-green-300 font-medium">
          {t("autoSave")}
        </p>
      </div>

      {/* Quick-Setup Panel */}
      {showPanel && (
        <div className="relative rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4 sm:p-5">
          <button
            onClick={() => dismissMutation.mutate()}
            className="absolute top-3 right-3 text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
            aria-label={t("quickSetup.dismiss")}
          >
            <X size={16} />
          </button>

          <div className="flex items-center gap-2 mb-3">
            <Rocket size={18} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                {t("quickSetup.heading", { completed: completedCount, total: totalCount })}
              </h3>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                {t("quickSetup.subheading")}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full bg-blue-200 dark:bg-blue-800 mb-4">
            <div
              className="h-1.5 rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${(completedCount / totalCount) * 100}%` }}
            />
          </div>

          <ul className="grid sm:grid-cols-2 gap-2">
            {QUICK_SETUP_ITEMS.map(({ key, labelKey, hintKey, tab }) => {
              const done = quickSetup?.items[key] ?? false;
              return (
                <li key={key}>
                  <button
                    onClick={() => {
                      setActiveTab(tab);
                      setTimeout(() => tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                    }}
                    className={`w-full flex items-start gap-2.5 text-left px-3 py-2.5 rounded-lg border transition-colors ${
                      done
                        ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 cursor-default"
                        : "border-blue-200 dark:border-blue-700 bg-white dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 cursor-pointer"
                    }`}
                  >
                    {done ? (
                      <CheckCircle2
                        size={16}
                        className="text-green-500 flex-shrink-0 mt-0.5"
                      />
                    ) : (
                      <Circle
                        size={16}
                        className="text-blue-400 dark:text-blue-500 flex-shrink-0 mt-0.5"
                      />
                    )}
                    <div className="min-w-0">
                      <p
                        className={`text-xs font-medium leading-tight ${
                          done
                            ? "text-green-700 dark:text-green-300 line-through"
                            : "text-blue-900 dark:text-blue-100"
                        }`}
                      >
                        {t(labelKey)}
                      </p>
                      {!done && (
                        <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5 leading-tight">
                          {t(hintKey)}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div ref={tabsRef}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Mobile (< md): full-width dropdown selector */}
        <div className="md:hidden mb-4">
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full h-11 text-sm font-medium">
              <SelectValue placeholder={t("selectSection")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="company">{t("tabs.company")}</SelectItem>
              <SelectItem value="branding">{t("tabs.branding")}</SelectItem>
              <SelectItem value="users">{t("tabs.users")}</SelectItem>
              <SelectItem value="departments">{t("tabs.departments")}</SelectItem>
              <SelectItem value="zones">{t("tabs.zones")}</SelectItem>
              <SelectItem value="email">{t("tabs.email")}</SelectItem>
              <SelectItem value="phone-systems">{t("tabs.phoneSystems")}</SelectItem>
              <SelectItem value="reports">{t("tabs.reports")}</SelectItem>
              <SelectItem value="printing">{t("tabs.printingFull")}</SelectItem>
              <SelectItem value="hs-documents">{t("tabs.hsSDocsFull")}</SelectItem>
              <SelectItem value="hsrules">{t("tabs.hsRules")}</SelectItem>
              <SelectItem value="nda">{t("tabs.nda")}</SelectItem>
              <SelectItem value="contractors">{t("tabs.contractors")}</SelectItem>
              <SelectItem value="ai">{t("tabs.ai")}</SelectItem>
              <SelectItem value="integrations">{t("tabs.integrations")}</SelectItem>
              <SelectItem value="sso">Single Sign-On</SelectItem>
              <SelectItem value="visit-reasons">{t("tabs.visitReasons")}</SelectItem>
              <SelectItem value="job-titles">{t("tabs.jobTitles")}</SelectItem>
              <SelectItem value="lone-worker">{t("tabs.loneWorker")}</SelectItem>
              <SelectItem value="system">{t("tabs.system")}</SelectItem>
              <SelectItem value="preferences">{t("tabs.preferences")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Desktop tab bar */}
        <TabsList className="hidden md:flex flex-wrap h-auto gap-1 p-1 bg-muted/50 rounded-xl mb-2">
          <TabsTrigger value="company" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Building2 size={14} />{t("tabs.company")}
          </TabsTrigger>
          <TabsTrigger value="branding" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Palette size={14} />{t("tabs.branding")}
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Users size={14} />{t("tabs.users")}
          </TabsTrigger>
          <TabsTrigger value="departments" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Building size={14} />{t("tabs.departments")}
          </TabsTrigger>
          <TabsTrigger value="zones" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <MapPin size={14} />{t("tabs.zones")}
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Mail size={14} />{t("tabs.email")}
          </TabsTrigger>
          <TabsTrigger value="phone-systems" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Phone size={14} />{t("tabs.phoneSystems")}
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <FileText size={14} />{t("tabs.reports")}
          </TabsTrigger>
          <TabsTrigger value="printing" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Printer size={14} />{t("tabs.printing")}
          </TabsTrigger>
          <TabsTrigger value="hs-documents" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <ScrollText size={14} />{t("tabs.hsDocs")}
          </TabsTrigger>
          <TabsTrigger value="hsrules" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <HardHat size={14} />{t("tabs.hsRules")}
          </TabsTrigger>
          <TabsTrigger value="nda" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <PenLine size={14} />{t("tabs.nda")}
          </TabsTrigger>
          <TabsTrigger value="contractors" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <AlertTriangle size={14} />{t("tabs.contractors")}
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Brain size={14} />{t("tabs.ai")}
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Settings2 size={14} />{t("tabs.integrations")}
          </TabsTrigger>
          <TabsTrigger value="sso" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Shield size={14} />{t("tabs.sso")}
          </TabsTrigger>
          <TabsTrigger value="visit-reasons" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <ClipboardList size={14} />{t("tabs.visitReasons")}
          </TabsTrigger>
          <TabsTrigger value="job-titles" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Briefcase size={14} />{t("tabs.jobTitles")}
          </TabsTrigger>
          <TabsTrigger value="lone-worker" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Bell size={14} />{t("tabs.loneWorker")}
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Wrench size={14} />{t("tabs.system")}
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <PanelLeft size={14} />{t("tabs.preferences")}
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
    </div>
  );
}
