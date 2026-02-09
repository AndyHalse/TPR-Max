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
      // Clear localStorage fallback for browser restrictions
      localStorage.removeItem('visigate_user');
      
      toast({
        title: "Logged Out",
        description: "You have been successfully logged out.",
      });
      // Clear the user query cache and force immediate refetch
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      // Clear all cached data to prevent cross-tenant data bleeding
      queryClient.clear();
      // Force hard reload to ensure complete state cleanup
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