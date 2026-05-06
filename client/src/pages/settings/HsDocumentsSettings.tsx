import ContractorsHSManagement from "@/components/ContractorsHSManagement";
import { DefaultTemplateManager } from "@/components/DefaultTemplateManager";

export default function HsDocumentsSettings() {
  return (
    <div className="space-y-6">
      <ContractorsHSManagement />

      <div className="mt-8">
        <DefaultTemplateManager className="w-full" />
      </div>
    </div>
  );
}
