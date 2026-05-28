import { useState, useEffect, useRef } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface CompanyComboboxProps {
  value: string;
  onChange: (value: string) => void;
  companies: string[];
  placeholder?: string;
  className?: string;
  testId?: string;
}

export function CompanyCombobox({
  value,
  onChange,
  companies,
  placeholder = "Select or type company...",
  className,
  testId,
}: CompanyComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const companyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue);
    setInputValue(selectedValue);
    setOpen(false);
  };

  const handleInputChange = (newValue: string) => {
    setInputValue(newValue);
    onChange(newValue);

    if (companyTimeoutRef.current) {
      clearTimeout(companyTimeoutRef.current);
      companyTimeoutRef.current = null;
    }

    if (newValue.length >= 2) {
      const hasMatches = companies.some((company) =>
        company.toLowerCase().startsWith(newValue.toLowerCase())
      );
      if (hasMatches) {
        companyTimeoutRef.current = setTimeout(() => {
          const currentInput = document.activeElement as HTMLInputElement;
          if (currentInput && currentInput.value === newValue) {
            setOpen(true);
          }
        }, 300);
      } else {
        setOpen(false);
      }
    } else {
      setOpen(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && inputValue.trim()) {
      event.preventDefault();
      onChange(inputValue.trim());
      setOpen(false);
    }
  };

  const filteredCompanies = companies
    .filter((company) =>
      company.toLowerCase().includes(inputValue.toLowerCase())
    )
    .sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const searchLower = inputValue.toLowerCase();
      if (aLower === searchLower) return -1;
      if (bLower === searchLower) return 1;
      const aStarts = aLower.startsWith(searchLower);
      const bStarts = bLower.startsWith(searchLower);
      if (aStarts && !bStarts) return -1;
      if (bStarts && !aStarts) return 1;
      return a.localeCompare(b);
    })
    .slice(0, 6);

  return (
    <div className="relative">
      <Input
        value={inputValue}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder={placeholder}
        className={cn("w-full pr-8", className)}
        data-testid={testId}
        onBlur={(e) => {
          const relatedTarget = e.relatedTarget as HTMLElement;
          if (
            !relatedTarget ||
            !relatedTarget.closest("[data-radix-popper-content-wrapper]")
          ) {
            setTimeout(() => setOpen(false), 150);
          }
        }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      <Button
        variant="ghost"
        size="sm"
        type="button"
        className="absolute right-0 top-0 h-full px-2 hover:bg-transparent"
        onClick={() => setOpen(!open)}
      >
        <ChevronsUpDown className="h-4 w-4 text-variable" />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="absolute inset-0 pointer-events-none" />
        </PopoverTrigger>
        <PopoverContent
          className="w-full p-2 shadow-lg border border-slate-200"
          align="start"
          style={{
            width: "var(--radix-popover-trigger-width)",
            maxHeight: "320px",
          }}
        >
          <Command>
            <CommandList className="max-h-64 overflow-auto">
              {filteredCompanies.length > 0 && (
                <CommandGroup>
                  <div className="px-2 py-1.5 text-xs font-medium text-variable uppercase tracking-wide">
                    Existing Companies
                  </div>
                  {filteredCompanies.map((company) => (
                    <CommandItem
                      key={company}
                      value={company}
                      onSelect={() => handleSelect(company)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 cursor-pointer rounded-md mx-2"
                    >
                      <div className="flex-shrink-0">
                        <Check
                          className={cn(
                            "h-4 w-4 text-blue-600",
                            value === company ? "opacity-100" : "opacity-0"
                          )}
                        />
                      </div>
                      <span className="text-fixed truncate">{company}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {inputValue.trim() && (
                <CommandGroup>
                  {filteredCompanies.length > 0 && (
                    <div className="border-t border-slate-200 my-1" />
                  )}
                  <div className="px-2 py-1.5 text-xs font-medium text-green-600 uppercase tracking-wide">
                    Add New
                  </div>
                  <CommandItem
                    value={inputValue}
                    onSelect={() => handleSelect(inputValue.trim())}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-green-50 cursor-pointer rounded-md mx-2"
                  >
                    <div className="flex-shrink-0 w-4 h-4 bg-green-100 rounded-full flex items-center justify-center">
                      <span className="text-green-600 text-sm font-bold">+</span>
                    </div>
                    <span className="text-green-700 font-medium truncate">
                      Use "{inputValue.trim()}"
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}

              {filteredCompanies.length === 0 && inputValue.trim() && (
                <div className="px-4 py-6 text-center text-variable">
                  <div className="text-sm mb-1">No existing companies found</div>
                  <div className="text-xs text-variable">
                    Press Enter to add "{inputValue.trim()}" as new company
                  </div>
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
