import { Button } from "@/components/ui/button";
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

export default function ContractorTabNav({ activeTab, setActiveTab, settings }: Props) {
  const { t } = useTranslation('contractors');
  const btn = (tab: Tab, label: string, mobileLabel: string, Icon: any, testId: string) => (
    <Button
      key={tab}
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
  );

  return (
    <div className="flex overflow-x-auto gap-1.5 sm:flex-wrap sm:overflow-visible pb-1 sm:pb-0 scrollbar-hide">
      {btn("previous", t('tabs.existingWorkers'), t('tabs.workersMobile'), History, "tab-previous-contractors")}
      {btn("contractors", t('tabs.contractors'), t('tabs.companiesMobile'), Building2, "tab-contractors")}
      {btn("walkin", t('tabs.walkin'), t('tabs.walkin'), UserPlus, "tab-walkin-registration")}
      {btn("prebook", t('tabs.prebooking'), t('tabs.prebookMobile'), CalendarPlus, "tab-pre-booking")}
      {settings?.featureContractors !== false && btn("co2", t('tabs.co2Reports'), "CO2", Leaf, "tab-co2-reports")}
      {btn("assign-hs", t('tabs.hsDocument'), "H&S", Shield, "tab-assign-hs")}
      {btn("rams", "RAMS", "RAMS", FileText, "tab-rams")}
      {settings?.featurePPM !== false && btn("ppm", "PPM", "PPM", Wrench, "tab-ppm")}
      {settings?.featureContractors !== false && btn("cdm", "CDM 2015", "CDM 2015", HardHatIcon, "tab-cdm")}
    </div>
  );
}
