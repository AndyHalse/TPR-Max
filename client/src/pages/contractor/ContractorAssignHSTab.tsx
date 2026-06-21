import { useTranslation } from "react-i18next";
import HSDocumentAssignment from "@/components/HSDocumentAssignment";

type Tab = "previous" | "walkin" | "prebook" | "contractors" | "co2" | "assign-hs" | "rams" | "ppm" | "cdm";

interface Props {
  setActiveTab: (t: Tab) => void;
  toast: (opts: any) => void;
}

export default function ContractorAssignHSTab({ setActiveTab, toast }: Props) {
  const { t } = useTranslation(["contractors", "common"]);
  return (
    <HSDocumentAssignment
      onNavigateToTab={(target) => {
        switch (target) {
          case "contractors": setActiveTab("contractors"); break;
          case "previous": setActiveTab("previous"); break;
          case "templates":
            toast({ title: t("assignHS.templatesTitle"), description: t("assignHS.templatesDesc") });
            break;
          case "assignments":
            toast({ title: t("assignHS.assignmentsTitle"), description: t("assignHS.assignmentsDesc") });
            break;
          default: break;
        }
      }}
    />
  );
}
