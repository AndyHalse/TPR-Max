import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LogoutButtonProps {
  bannerInvert?: boolean;
}

export default function LogoutButton({ bannerInvert }: LogoutButtonProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/logout");
      return response.json();
    },
    onSuccess: () => {
      localStorage.removeItem('visigate_user');
      localStorage.removeItem('tprmax-last-login');
      localStorage.removeItem('tprmax-logo-token');
      queryClient.clear();
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
      className="hover:bg-white/10 transition-colors"
      style={bannerInvert ? { color: '#ffffff' } : {}}
      data-testid="button-logout"
    >
      <LogOut size={16} className="mr-2" />
      {logoutMutation.isPending ? "Logging out..." : "Logout"}
    </Button>
  );
}
