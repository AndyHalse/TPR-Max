import { useQuery } from "@tanstack/react-query";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ShieldCheck, CheckCircle, AlertTriangle, Download, HelpCircle, ExternalLink } from "lucide-react";

interface ComplianceRequirement {
  id: string;
  label: string;
  legalObligation: string;
  tprFeature: string;
  active: boolean;
  detail: string;
}

interface ComplianceSummary {
  companyName: string;
  compliancePercent: number;
  activeCount: number;
  totalCount: number;
  requirements: ComplianceRequirement[];
}

export default function Compliance() {
  const { data, isLoading, isError } = useQuery<ComplianceSummary>({
    queryKey: ["/api/compliance/summary"],
  });

  const handleDownloadReport = () => {
    window.open("/api/compliance/report", "_blank");
  };

  const compliancePercent = data?.compliancePercent ?? 0;
  const complianceColor =
    compliancePercent >= 80 ? "text-green-600" : compliancePercent >= 50 ? "text-amber-600" : "text-red-600";
  const complianceBg =
    compliancePercent >= 80
      ? "bg-green-50 border-green-300 dark:bg-green-900/20 dark:border-green-700"
      : compliancePercent >= 50
      ? "bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-700"
      : "bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700";
  const progressColor =
    compliancePercent >= 80 ? "bg-green-500" : compliancePercent >= 50 ? "bg-amber-500" : "bg-red-500";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center text-red-600">
        Failed to load compliance data. Please refresh the page.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="text-blue-600" size={28} />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Martyn's Law Compliance</h1>
            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-xs">
              UK Protect Duty
            </Badge>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Shows how your current TPR Max configuration maps to each legal requirement under the Terrorism
            (Protection of Premises) Act 2025.
          </p>
        </div>
        <Button onClick={handleDownloadReport} className="flex-shrink-0">
          <Download size={15} className="mr-2" />
          Download Compliance Summary
        </Button>
      </div>

      {/* What is Martyn's Law accordion */}
      <Accordion type="single" collapsible>
        <AccordionItem
          value="what-is"
          className="border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-950/20 px-4"
        >
          <AccordionTrigger className="text-sm font-semibold text-blue-800 dark:text-blue-300 hover:no-underline py-3">
            <span className="flex items-center gap-2">
              <HelpCircle size={15} />
              What is Martyn's Law?
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-4 text-sm text-blue-800 dark:text-blue-300 space-y-3">
            <p>
              <strong>Martyn's Law</strong> (the <em>Terrorism (Protection of Premises) Act 2025</em>) is named
              after Martyn Hett, one of 22 people killed in the 2017 Manchester Arena attack. It places a legal
              duty on qualifying venues to implement proportionate protective security and evacuation procedures.
            </p>
            <p>
              Venues with regular capacity of <strong>200 or more people</strong> must have documented procedures
              in place. Those with capacity of <strong>800 or more</strong> face enhanced duties including a
              Designated Security Supervisor and more detailed risk assessment.
            </p>
            <div>
              <div className="font-semibold mb-1">Core requirements include:</div>
              <ul className="text-xs space-y-1 list-disc list-inside">
                <li>Real-time accountability of all people on-site during an emergency</li>
                <li>Written evacuation procedures communicated to all staff</li>
                <li>Named fire marshals responsible for area-based accountability</li>
                <li>Regular evacuation drills, recorded and retained for audit</li>
                <li>Visitor records and audit trails available for inspection</li>
              </ul>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 flex-wrap">
              Official guidance is published by the Home Office.
              <a
                href="https://www.gov.uk/government/publications/martyns-law"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline font-medium"
              >
                View Home Office factsheet <ExternalLink size={11} />
              </a>
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Compliance Score Banner */}
      <GlassCard className={`border ${complianceBg}`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className={`text-5xl font-bold ${complianceColor}`}>{compliancePercent}%</div>
            <div>
              <div className="font-semibold text-gray-800 dark:text-gray-200 text-lg">Compliance Score</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {data?.activeCount ?? 0} of {data?.totalCount ?? 0} requirements met for{" "}
                <strong>{data?.companyName}</strong>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${progressColor}`}
            style={{ width: `${compliancePercent}%` }}
          />
        </div>
      </GlassCard>

      {/* Compliance Requirements */}
      <GlassCard>
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
          <ShieldCheck size={16} />
          Martyn's Law Requirements — TPR Max Mapping
        </h2>
        <div className="space-y-3">
          {(data?.requirements ?? []).map((req) => (
            <div
              key={req.id}
              className={`rounded-lg border p-4 ${
                req.active
                  ? "bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800"
                  : "bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800"
              }`}
            >
              <div className="flex items-start gap-3">
                {req.active ? (
                  <CheckCircle size={20} className="text-green-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm">{req.label}</span>
                    {req.active ? (
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-xs px-2">
                        Enabled
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-xs px-2">
                        Action needed
                      </Badge>
                    )}
                    <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                      TPR Max: {req.tprFeature}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">{req.legalObligation}</p>
                  {(!req.active) && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 italic">{req.detail}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
          Statuses are computed from your live system configuration and data. Use the Download button to generate
          a PDF report suitable for inspection records.
        </p>
      </GlassCard>
    </div>
  );
}
