import { cn } from "@/lib/utils";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export default function GlassCard({ children, className, hover = false, onClick, ...rest }: GlassCardProps) {
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
