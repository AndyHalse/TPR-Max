import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { BookOpen, Search, Download, CheckCircle, Clock, Tag, AlertCircle, Loader2, BookMarked, HardHat, FileText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Category = "all" | "induction" | "rams" | "risk_assessment";
type Industry = "all" | "general" | "construction" | "manufacturing" | "healthcare" | "education" | "logistics";

interface LibraryTemplate {
  id: number;
  category: string;
  industry: string;
  title: string;
  description: string;
  content: any;
  regulatory_basis: string[];
  tags: string[];
  difficulty: string;
  estimated_time: string;
}

const CATEGORY_LABELS: Record<string, { label: string; colour: string; icon: any }> = {
  induction: { label: "Induction", colour: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800", icon: BookMarked },
  rams: { label: "RAMS", colour: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800", icon: HardHat },
  risk_assessment: { label: "Risk Assessment", colour: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800", icon: ShieldCheck },
};

const DIFFICULTY_COLOURS: Record<string, string> = {
  beginner: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  intermediate: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  advanced: "bg-red-500/10 text-red-700 dark:text-red-400",
};

const INDUSTRIES: { value: Industry; label: string }[] = [
  { value: "all", label: "All Industries" },
  { value: "general", label: "General" },
  { value: "construction", label: "Construction" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "healthcare", label: "Healthcare" },
  { value: "education", label: "Education" },
  { value: "logistics", label: "Logistics" },
];

export default function TemplateLibrary() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [activeIndustry, setActiveIndustry] = useState<Industry>("all");
  const [search, setSearch] = useState("");
  const [confirmTemplate, setConfirmTemplate] = useState<LibraryTemplate | null>(null);

  const params = new URLSearchParams();
  if (activeCategory !== "all") params.set("category", activeCategory);
  if (activeIndustry !== "all") params.set("industry", activeIndustry);
  if (search.trim()) params.set("q", search.trim());

  const { data: templates = [], isLoading } = useQuery<LibraryTemplate[]>({
    queryKey: ["/api/template-library", activeCategory, activeIndustry, search],
    queryFn: async () => {
      const res = await fetch(`/api/template-library?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
  });

  const importMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/template-library/${id}/import`, {});
      return res.json();
    },
    onSuccess: (data) => {
      setConfirmTemplate(null);
      toast({
        title: "Template imported",
        description: (
          <span>
            {data.message}{" "}
            <button
              className="underline font-medium"
              onClick={() => setLocation(data.redirectUrl)}
            >
              Open to customise →
            </button>
          </span>
        ) as any,
      });
    },
    onError: () => {
      toast({ title: "Import failed", description: "Could not import the template. Please try again.", variant: "destructive" });
    },
  });

  const categoryTabs: { value: Category; label: string }[] = [
    { value: "all", label: "All Templates" },
    { value: "induction", label: "Inductions" },
    { value: "rams", label: "RAMS" },
    { value: "risk_assessment", label: "Risk Assessments" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-200 dark:border-indigo-800">
          <BookOpen className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Template Library</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5">
            Pre-built, UK-regulation-referenced templates for inductions, RAMS, and risk assessments.
            Import any template as a draft and customise it for your site.
          </p>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
        {categoryTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveCategory(tab.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeCategory === tab.value
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {tab.label}
            {tab.value !== "all" && (
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                activeCategory === tab.value ? "bg-indigo-500/30 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-500"
              }`}>
                {templates.filter(t => tab.value === "all" || t.category === tab.value).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Industry filter + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {INDUSTRIES.map((ind) => (
            <button
              key={ind.value}
              onClick={() => setActiveIndustry(ind.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                activeIndustry === ind.value
                  ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent"
                  : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400"
              }`}
            >
              {ind.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      {!isLoading && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {templates.length} template{templates.length !== 1 ? "s" : ""} found
        </p>
      )}

      {/* Template grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No templates found</p>
          <p className="text-sm mt-1">Try adjusting your filters or search term</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map((template) => {
            const cat = CATEGORY_LABELS[template.category];
            const CatIcon = cat?.icon ?? FileText;
            return (
              <div
                key={template.id}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CatIcon className="h-4 w-4 text-slate-500 flex-shrink-0" />
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cat?.colour ?? ""}`}>
                      {cat?.label ?? template.category}
                    </span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${DIFFICULTY_COLOURS[template.difficulty] ?? ""}`}>
                    {template.difficulty}
                  </span>
                </div>

                {/* Title + description */}
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white leading-tight">{template.title}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{template.description}</p>
                </div>

                {/* Regulatory basis pills */}
                {template.regulatory_basis?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {template.regulatory_basis.slice(0, 3).map((reg) => (
                      <span key={reg} className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
                        {reg}
                      </span>
                    ))}
                    {template.regulatory_basis.length > 3 && (
                      <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-400">
                        +{template.regulatory_basis.length - 3} more
                      </span>
                    )}
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <Clock className="h-3.5 w-3.5" />
                    {template.estimated_time}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => setConfirmTemplate(template)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Import
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Import confirmation dialog */}
      <Dialog open={!!confirmTemplate} onOpenChange={(open) => !open && setConfirmTemplate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-indigo-600" />
              Import template
            </DialogTitle>
            <DialogDescription className="pt-2 space-y-3">
              <p>
                This will create a <strong>draft {confirmTemplate ? CATEGORY_LABELS[confirmTemplate.category]?.label?.toLowerCase() ?? confirmTemplate?.category : ""}</strong> in your account based on:
              </p>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700">
                <p className="font-semibold text-slate-900 dark:text-white">{confirmTemplate?.title}</p>
                <p className="text-sm text-slate-500 mt-1">{confirmTemplate?.description}</p>
                {confirmTemplate?.regulatory_basis?.length ? (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {confirmTemplate.regulatory_basis.map((r) => (
                      <span key={r} className="text-xs font-mono bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5 text-slate-600 dark:text-slate-300">{r}</span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>The imported document will be marked as <strong>draft</strong>. Review and customise it before publishing or activating.</span>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTemplate(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => confirmTemplate && importMutation.mutate(confirmTemplate.id)}
              disabled={importMutation.isPending}
              className="gap-2"
            >
              {importMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</>
              ) : (
                <><CheckCircle className="h-4 w-4" /> Import draft</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
