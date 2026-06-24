import { useQuery } from "@tanstack/react-query";
import { History, LogIn, LogOut } from "lucide-react";
import { formatDateLocale, formatTimeLocale } from "@/utils/formatDate";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface StaffActivityTabProps {
  staffId: string;
}

export default function StaffActivityTab({ staffId }: StaffActivityTabProps) {
  const { data: sessions = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/staff", staffId, "sessions"],
    queryFn: () =>
      fetch(`/api/staff/${staffId}/sessions`, { credentials: "include" }).then(r => r.json()),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-10">
        <History className="h-8 w-8 mx-auto text-gray-300 mb-2" />
        <p className="text-gray-500 text-sm font-medium">No activity recorded</p>
        <p className="text-gray-400 text-xs mt-1">
          Check-ins and check-outs will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400 mb-3">Showing last 90 days of site activity</p>
      {sessions.map((s: any) => {
        const inTime = new Date(s.checkInTime);
        const outTime = s.checkOutTime ? new Date(s.checkOutTime) : null;
        const hours =
          s.hoursWorked != null ? parseFloat(Number(s.hoursWorked).toFixed(1)) : null;
        const method = s.checkInMethod || "card";

        return (
          <div
            key={s.id}
            className="flex items-start gap-3 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100"
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center mt-0.5">
              <History size={14} className="text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-800">
                  {formatDateLocale(inTime)}
                </span>
                {hours !== null && (
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1.5 py-0 h-4 font-medium"
                  >
                    {hours}h
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                <span className="flex items-center gap-1">
                  <LogIn size={9} className="text-green-500" />
                  {formatTimeLocale(inTime)}
                </span>
                {outTime ? (
                  <span className="flex items-center gap-1">
                    <LogOut size={9} className="text-red-400" />
                    {formatTimeLocale(outTime)}
                  </span>
                ) : (
                  <span className="text-green-600 font-medium text-[11px]">On site</span>
                )}
                {s.isManual && (
                  <span className="capitalize text-orange-500">{method}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
