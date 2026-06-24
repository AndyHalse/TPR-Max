import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";
import { History, Building2, UserPlus, CalendarPlus, Leaf, Shield, FileText, Wrench, HardHat as HardHatIcon } from "lucide-react";

type Tab = "previous" | "walkin" | "prebook" | "contractors" | "co2" | "assign-hs" | "rams" | "ppm" | "cdm";

interface Props {
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
  headerF10OverdueCount: number;
  settings?: {
    featurePPM?: boolean | null;
    featureContractors?: boolean | null;
  } | null;
}

const TAB_TOOLTIPS: Record<Tab, string> = {
  previous:     "View workers who have previously visited this site. Check in/out, send inductions, and manage lone worker protection.",
  contractors:  "Manage contractor companies — view compliance gaps, documents, insurance status, and add new contractors.",
  walkin:       "Register an unannounced contractor or worker arriving on site right now.",
  prebook:      "Pre-book a contractor for a scheduled visit — send advance induction links and document requests.",
  co2:          "Track and report the carbon footprint from contractor activities on site.",
  "assign-hs":  "Assign Health & Safety documents that contractors must review and acknowledge before starting work.",
  rams:         "Upload, review, and track acknowledgement of Risk Assessment & Method Statements (RAMS) for contractor activities.",
  ppm:          "Planned Preventive Maintenance — schedule, assign, and track recurring maintenance tasks.",
  cdm:          "Construction Design & Management (CDM 2015) — manage F10 notifications and project documentation.",
};

export default function ContractorTabNav({ activeTab, setActiveTab, settings }: Props) {
  const { t } = useTranslation('contractors');

  const btn = (tab: Tab, label: string, mobileLabel: string, Icon: any, testId: string) => (
    <Tooltip key={tab}>
      <TooltipTrigger asChild>
        <Button
          variant={activeTab === tab ? "default" : "outline"}
          onClick={() => setActiveTab(tab)}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 whitespace-nowrap flex-shrink-0"
          data-testid={testId}
        >
          <Icon className="h-3.5 w-3.5 flex-shrink-0" />
          {mobileLabel !== label ? (
            <>
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{mobileLabel}</span>
            </>
          ) : (
            <span>{label}</span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-center">
        {TAB_TOOLTIPS[tab]}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex overflow-x-auto gap-1.5 sm:flex-wrap sm:overflow-visible pb-1 sm:pb-0 scrollbar-hide">
        {btn("previous", t('tabs.existingWorkers'), t('tabs.workersMobile'), History, "tab-previous-contractors")}
        {btn("contractors", t('tabs.contractors'), t('tabs.companiesMobile'), Building2, "tab-contractors")}
        {btn("walkin", t('tabs.walkin'), t('tabs.walkin'), UserPlus, "tab-walkin-registration")}
        {btn("prebook", t('tabs.prebooking'), t('tabs.prebookMobile'), CalendarPlus, "tab-pre-booking")}
        {settings?.featureContractors !== false && btn("co2", t('tabs.co2Reports'), t('tabs.co2'), Leaf, "tab-co2-reports")}
        {btn("assign-hs", t('tabs.hsDocument'), t('tabs.hsMobile'), Shield, "tab-assign-hs")}
        {btn("rams", t('tabs.rams'), t('tabs.rams'), FileText, "tab-rams")}
        {settings?.featurePPM !== false && btn("ppm", t('tabs.ppm'), t('tabs.ppm'), Wrench, "tab-ppm")}
        {settings?.featureContractors !== false && btn("cdm", t('tabs.cdm'), t('tabs.cdm'), HardHatIcon, "tab-cdm")}
      </div>
    </TooltipProvider>
  );
}
