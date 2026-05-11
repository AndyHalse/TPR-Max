import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { Activity, Search, AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";

const BF_STYLE: Record<string, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

export default function AbsenceOverview() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/absences/overview"],
    queryFn: () => fetch("/api/absences/overview", { credentials: "include" }).then(r => r.json()),
  });

  const { overview = [], summary } = data || {};

  const filtered = search
    ? overview.filter((o: any) => `${o.staff.first_name} ${o.staff.last_name} ${o.staff.department}`.toLowerCase().includes(search.toLowerCase()))
    : overview;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="h-6 w-6 text-blue-600" /> Absence Overview</h1>
          <p className="text-gray-500 text-sm mt-1">Bradford Factor tracking for all staff (rolling 12 months)</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input className="pl-9" placeholder="Search staff…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-3 gap-4">
          {[
            ["Currently Absent", summary.currentlyAbsent, "text-red-700"],
            ["Avg Bradford Score", summary.avgBradford, "text-orange-700"],
            ["Total Days YTD", summary.totalDaysYTD, "text-blue-700"],
          ].map(([label, val, cls]) => (
            <Card key={String(label)}><CardContent className="pt-4 pb-4 text-center"><div className={`text-3xl font-bold ${cls}`}>{val}</div><div className="text-sm text-gray-500">{label}</div></CardContent></Card>
          ))}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <strong>Bradford Factor bands:</strong> Low (&lt;50) · Medium (50–199) · High (200–449) · Critical (450+). Formula: <em>S² × D</em> where S = absence spells, D = total days lost.
      </div>

      {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div> : (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No absence data found.</div>
          ) : filtered.map((o: any) => (
            <Link key={o.staff.id} href={`/hr/staff/${o.staff.id}`}>
              <Card className={`cursor-pointer hover:shadow-md transition-shadow ${o.currentlyAbsent ? "border-red-200" : ""}`}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm">
                        {o.staff.first_name?.[0]}{o.staff.last_name?.[0]}
                      </div>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {o.staff.first_name} {o.staff.last_name}
                          {o.currentlyAbsent && <Badge className="bg-red-100 text-red-800 text-xs">Currently absent</Badge>}
                        </div>
                        <div className="text-sm text-gray-500">{o.staff.department} · {o.totalSpellsThisYear} spell{o.totalSpellsThisYear !== 1 ? "s" : ""} · {o.totalDaysThisYear} days this year</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {o.bradfordFactor.score >= 200 && <AlertTriangle className="h-4 w-4 text-orange-500" />}
                      <div className="text-right">
                        <div className="text-xl font-bold text-gray-900">{o.bradfordFactor.score}</div>
                        <Badge className={BF_STYLE[o.bradfordFactor.rating]}>{o.bradfordFactor.rating?.toUpperCase()}</Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
