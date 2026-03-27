import { useState, useRef, useEffect } from "react";
import { Search, X, Check } from "lucide-react";

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  department?: string | null;
  isActive?: boolean;
}

interface StaffSearchSelectProps {
  staff: StaffMember[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
  error?: boolean;
  inputClassName?: string;
}

export function StaffSearchSelect({
  staff,
  value,
  onChange,
  placeholder = "Search for a staff member...",
  className = "",
  error = false,
  inputClassName = "",
}: StaffSearchSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = staff.find((s) => s.id === value);

  const filtered = staff.filter((s) => {
    const full =
      `${s.firstName} ${s.lastName}${s.department ? ` ${s.department}` : ""}`.toLowerCase();
    return full.includes(query.toLowerCase());
  });

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function handleSelect(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    setQuery("");
    setOpen(false);
  }

  function handleWrapperClick() {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const avatarColors = [
    "bg-blue-100 text-blue-700",
    "bg-emerald-100 text-emerald-700",
    "bg-violet-100 text-violet-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-cyan-100 text-cyan-700",
  ];

  function avatarColor(name: string) {
    let n = 0;
    for (let i = 0; i < name.length; i++) n += name.charCodeAt(i);
    return avatarColors[n % avatarColors.length];
  }

  const borderClass = error
    ? "border-red-500 focus-within:ring-2 focus-within:ring-red-400"
    : "border-input focus-within:ring-2 focus-within:ring-ring";

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div
        className={`flex items-center gap-2 w-full px-3 rounded-md border bg-background text-sm text-foreground cursor-text ${borderClass} ${inputClassName}`}
        style={{ minHeight: "2.75rem" }}
        onClick={handleWrapperClick}
      >
        <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />

        {selected && !open ? (
          <div className="flex items-center gap-2 flex-1 min-w-0 py-1.5">
            <div
              className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${avatarColor(selected.firstName + selected.lastName)}`}
            >
              {selected.firstName[0]}
              {selected.lastName[0]}
            </div>
            <span className="flex-1 truncate font-medium">
              {selected.firstName} {selected.lastName}
            </span>
            {selected.department && (
              <span className="text-xs text-muted-foreground truncate hidden sm:block">
                {selected.department}
              </span>
            )}
          </div>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={selected ? `${selected.firstName} ${selected.lastName}` : placeholder}
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground py-2"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
        )}

        {selected && (
          <button
            type="button"
            onPointerDown={handleClear}
            className="flex-shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            tabIndex={-1}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-background border border-input rounded-xl shadow-xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-4 px-4 text-sm text-muted-foreground text-center">
              No staff found matching "{query}"
            </div>
          ) : (
            <div className="max-h-56 overflow-y-auto overscroll-contain">
              {filtered.map((s) => {
                const isSelected = s.id === value;
                const color = avatarColor(s.firstName + s.lastName);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm transition-colors ${
                      isSelected
                        ? "bg-primary/8 text-foreground"
                        : "hover:bg-accent hover:text-accent-foreground active:bg-accent"
                    }`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      handleSelect(s.id);
                    }}
                  >
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${color}`}
                    >
                      {s.firstName[0]}
                      {s.lastName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`truncate ${isSelected ? "font-semibold" : "font-medium"}`}>
                        {s.firstName} {s.lastName}
                      </div>
                      {s.department && (
                        <div className="text-xs text-muted-foreground truncate">
                          {s.department}
                        </div>
                      )}
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
