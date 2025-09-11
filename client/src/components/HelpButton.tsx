import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface HelpButtonProps {
  onClick: () => void;
  isHelpPanelOpen?: boolean;
}

export default function HelpButton({ onClick, isHelpPanelOpen = false }: HelpButtonProps) {
  return (
    <div className="fixed bottom-6 right-6 z-40">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={onClick}
              size="lg"
              className={`
                h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105
                ${isHelpPanelOpen 
                  ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-opacity-50' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                }
              `}
              data-testid="help-button"
            >
              <HelpCircle 
                size={24} 
                className={`transition-transform duration-200 ${isHelpPanelOpen ? 'rotate-12' : ''}`} 
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="bg-slate-900 text-white">
            <p>{isHelpPanelOpen ? "Close Help" : "Get Help"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}