import HSDocumentAssignment from "@/components/HSDocumentAssignment";

type Tab = "previous" | "walkin" | "prebook" | "contractors" | "co2" | "assign-hs" | "rams" | "ppm" | "cdm";

interface Props {
  setActiveTab: (t: Tab) => void;
  toast: (opts: any) => void;
}

export default function ContractorAssignHSTab({ setActiveTab, toast }: Props) {
  return (
    <HSDocumentAssignment
      onNavigateToTab={(target) => {
        switch (target) {
          case "contractors": setActiveTab("contractors"); break;
          case "previous": setActiveTab("previous"); break;
          case "templates":
            toast({ title: "Document Templates", description: "Use the assignment dialog to view and manage document templates" });
            break;
          case "assignments":
            toast({ title: "Assignment History", description: "Assignment history is displayed in the current dashboard" });
            break;
          default: break;
        }
      }}
    />
  );
}
