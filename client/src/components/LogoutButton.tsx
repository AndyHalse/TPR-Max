import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LogoutButton() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/logout");
      return response.json();
    },
    onSuccess: () => {
      // Navigate away first to avoid React re-renders with stale auth state
      localStorage.removeItem('visigate_user');
      localStorage.removeItem('tprmax-last-login');
      localStorage.removeItem('tprmax-logo-token');
      // Clear all cached data to prevent cross-tenant data bleeding
      queryClient.clear();
      // Hard redirect — clears all React state cleanly
      window.location.href = '/login';
    },
    onError: (error: Error) => {
      toast({
        title: "Logout Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => logoutMutation.mutate()}
      disabled={logoutMutation.isPending}
      className="text-variable hover:text-fixed dark:text-slate-400 dark:hover:text-slate-200"
      data-testid="button-logout"
    >
      <LogOut size={16} className="mr-2" />
      {logoutMutation.isPending ? "Logging out..." : "Logout"}
    </Button>
  );
}