// Standard: use GlassCard (or <Card variant="glass">) to create glass panels.
// Set solid={true} on safety-critical screens (emergency, kiosk, muster) — those must be opaque and high-contrast.
import { cn } from "@/lib/utils";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  solid?: boolean;
}

export default function GlassCard({ children, className, hover = false, solid = false, onClick, ...rest }: GlassCardProps) {
  if (solid) {
    return (
      <div
        className={cn(
          "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm",
          className
        )}
        onClick={onClick}
        {...rest}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "glass-effect rounded-2xl p-6",
        hover && "glass-hover cursor-pointer",
        className
      )}
      onClick={onClick}
      {...rest}
    >
      {children}
    </div>
  );
}
