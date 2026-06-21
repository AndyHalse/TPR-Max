import { useTranslation } from "react-i18next";
import GlassCard from "@/components/GlassCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CO2SustainabilityReports } from "@/components/CO2SustainabilityReports";
import { Leaf } from "lucide-react";

interface Props {
  companies: any[];
  selectedId: string;
  setSelectedId: (id: string) => void;
}

export default function ContractorCO2Tab({ companies, selectedId, setSelectedId }: Props) {
  const { t } = useTranslation(["contractors", "common"]);
  return (
    <div className="space-y-6">
      <GlassCard className="p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Leaf className="h-5 w-5 text-green-600" />
            <span className="font-medium">{t("co2.selectCompany")}</span>
          </div>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="w-64" data-testid="select-co2-company">
              <SelectValue placeholder={t("co2.choosePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name} ({t("companies.workersCount", { count: company.workersCount })})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </GlassCard>
      {selectedId && (
        <CO2SustainabilityReports
          companyId={selectedId}
          companyName={companies.find((c) => c.id === selectedId)?.name}
        />
      )}
    </div>
  );
}
