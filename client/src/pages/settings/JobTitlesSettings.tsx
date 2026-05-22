import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Briefcase, Plus, Trash2, RotateCcw, Search } from "lucide-react";

interface JobTitlesData {
  titles: string[];
  customTitles: string[];
  defaultCount: number;
}

export default function JobTitlesSettings() {
  const { toast } = useToast();
  const [newTitle, setNewTitle] = useState("");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<JobTitlesData>({
    queryKey: ["/api/settings/job-titles"],
    queryFn: () => fetch("/api/settings/job-titles", { credentials: "include" }).then(r => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: (customTitles: string[]) =>
      apiRequest("PUT", "/api/settings/job-titles", { customTitles }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/job-titles"] });
      toast({ title: "Job titles saved" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const handleAdd = () => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    if (data?.titles.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      toast({ title: "Already exists", description: "That job title is already in the list.", variant: "destructive" });
      return;
    }
    const updated = [...(data?.customTitles || []), trimmed];
    saveMutation.mutate(updated);
    setNewTitle("");
  };

  const handleDelete = (title: string) => {
    const updated = (data?.customTitles || []).filter(t => t !== title);
    saveMutation.mutate(updated);
  };

  const handleReset = () => {
    if (!window.confirm("Remove all custom job titles and keep only the defaults?")) return;
    saveMutation.mutate([]);
  };

  const filteredTitles = (data?.titles || []).filter(t =>
    !search || t.toLowerCase().includes(search.toLowerCase())
  );

  const isCustom = (title: string) => (data?.customTitles || []).includes(title);

  return (
    <div className="space-y-6">
      <GlassCard>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Briefcase className="text-blue-600 dark:text-blue-400" size={24} />
            <div>
              <h3 className="text-lg font-semibold text-fixed">Job Titles</h3>
              <p className="text-sm text-variable">
                {data?.defaultCount ?? 0} standard UK titles · {data?.customTitles?.length ?? 0} custom
              </p>
            </div>
          </div>
          {(data?.customTitles?.length ?? 0) > 0 && (
            <Button variant="outline" size="sm" onClick={handleReset} className="text-red-600 border-red-200 hover:bg-red-50">
              <RotateCcw size={14} className="mr-1" />
              Reset to defaults
            </Button>
          )}
        </div>

        {/* Add custom title */}
        <div className="flex gap-2 mb-5">
          <Input
            placeholder="Add a custom job title…"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            className="flex-1"
          />
          <Button
            onClick={handleAdd}
            disabled={!newTitle.trim() || saveMutation.isPending}
            className="gradient-blue text-white"
          >
            <Plus size={16} className="mr-1" />
            Add
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Search titles…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-variable">Loading…</div>
        ) : (
          <div className="flex flex-wrap gap-2 max-h-96 overflow-y-auto pr-1">
            {filteredTitles.map(title => (
              <div
                key={title}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  isCustom(title)
                    ? "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:border-blue-700 dark:text-blue-300"
                    : "bg-white/60 border-gray-200 text-gray-700 dark:bg-slate-800/60 dark:border-slate-600 dark:text-slate-300"
                }`}
              >
                <span>{title}</span>
                {isCustom(title) && (
                  <button
                    onClick={() => handleDelete(title)}
                    className="hover:text-red-600 transition-colors ml-0.5"
                    title="Remove custom title"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
            {filteredTitles.length === 0 && (
              <p className="text-variable text-sm py-4">No titles match your search.</p>
            )}
          </div>
        )}

        <p className="mt-4 text-xs text-variable">
          <Badge variant="outline" className="mr-1 text-blue-700 border-blue-200 bg-blue-50">Custom</Badge>
          titles are highlighted in blue and can be removed. Standard titles are built-in and cannot be deleted.
        </p>
      </GlassCard>
    </div>
  );
}
