import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import GlassCard from "@/components/GlassCard";
import { LayoutDashboard, PanelLeft } from "lucide-react";

type NavStyle = "classic" | "sidebar";

export default function PreferencesSettings() {
  const { toast } = useToast();

  const { data: user } = useQuery<{
    id: string;
    navStyle?: string | null;
  }>({
    queryKey: ["/api/auth/me"],
  });

  const currentNavStyle: NavStyle = (user?.navStyle === "sidebar") ? "sidebar" : "classic";

  const navStyleMutation = useMutation({
    mutationFn: async (navStyle: NavStyle) => {
      const res = await apiRequest("PATCH", "/api/users/me/nav-style", { navStyle });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to save preference");
      }
      return res.json();
    },
    onSuccess: (_data, navStyle) => {
      queryClient.setQueryData(["/api/auth/me"], (old: any) =>
        old ? { ...old, navStyle } : old
      );
      toast({
        title: "Navigation style updated",
        description: navStyle === "sidebar"
          ? "Grouped sidebar is now active."
          : "Classic top menu is now active.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message || "Failed to update navigation preference",
        variant: "destructive",
      });
    },
  });

  const options: { value: NavStyle; label: string; description: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    {
      value: "classic",
      label: "Classic",
      description: "Horizontal icon menu fixed to the top of the screen. Icons with tooltips — compact and familiar.",
      icon: LayoutDashboard,
    },
    {
      value: "sidebar",
      label: "Sidebar",
      description: "Grouped left-hand sidebar with collapsible sections. Ideal for navigating many modules quickly.",
      icon: PanelLeft,
    },
  ];

  return (
    <div className="space-y-6">
      <GlassCard>
        <div className="flex items-center mb-6">
          <PanelLeft className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
          <div>
            <h3 className="text-lg font-semibold text-fixed">Navigation Style</h3>
            <p className="text-sm text-variable mt-0.5">
              Choose how you navigate TPR Max. This is saved to your account and applies on all your devices.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {options.map((opt) => {
            const isSelected = currentNavStyle === opt.value;
            const isPending = navStyleMutation.isPending;
            return (
              <button
                key={opt.value}
                disabled={isPending}
                onClick={() => {
                  if (!isSelected) navStyleMutation.mutate(opt.value);
                }}
                className={`relative flex flex-col gap-3 p-5 rounded-xl border-2 text-left transition-all duration-150 ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-white/40 dark:hover:bg-white/5"
                } ${isPending ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
              >
                {isSelected && (
                  <span className="absolute top-3 right-3 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                    <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 fill-white">
                      <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                )}
                <opt.icon
                  size={28}
                  className={isSelected ? "text-primary" : "text-variable"}
                />
                <div>
                  <p className={`font-semibold text-sm ${isSelected ? "text-primary" : "text-fixed"}`}>
                    {opt.label}
                  </p>
                  <p className="text-xs text-variable mt-1 leading-relaxed">
                    {opt.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {navStyleMutation.isPending && (
          <p className="mt-4 text-xs text-variable animate-pulse">Saving preference…</p>
        )}
      </GlassCard>
    </div>
  );
}
