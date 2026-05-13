import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Download, FileSpreadsheet, Users, UserPlus, UserMinus, Calendar, Loader2 } from "lucide-react";

export default function PayrollExport() {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const currentDate = new Date();
  const firstOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString().slice(0, 10);
  const lastOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [periodStart, setPeriodStart] = useState(firstOfMonth);
  const [periodEnd, setPeriodEnd] = useState(lastOfMonth);

  const { data: summary, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/hr/payroll-export", periodStart, periodEnd, "json"],
    queryFn: () => fetch(`/api/hr/payroll-export?period_start=${periodStart}&period_end=${periodEnd}&format=json`, { credentials: "include" }).then(r => r.json()),
    enabled: !!periodStart && !!periodEnd,
  });

  const handleDownload = async () => {
    if (!periodStart || !periodEnd) {
      toast({ title: "Please select both period start and end dates", variant: "destructive" });
      return;
    }
    setDownloading(true);
    try {
      const res = await fetch(`/api/hr/payroll-export?period_start=${periodStart}&period_end=${periodEnd}`, { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payroll-export-${periodStart}-to-${periodEnd}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Payroll export downloaded" });
    } catch (err) {
      toast({ title: "Export failed", description: "Please try again", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const { rows = [], summary: stats } = summary || {};

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileSpreadsheet className="h-6 w-6 text-blue-600" /> Payroll Export</h1>
        <p className="text-gray-500 text-sm mt-1">Generate a CSV report for your payroll provider</p>
      </div>

      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm font-semibold text-red-800">⚠️ Important — Beta Feature</p>
        <p className="text-sm text-red-700 mt-1">
          Payroll data exported from this module must be independently verified
          before use in any payroll processing system. ACS Ltd accepts no liability
          for payroll errors arising from beta feature use.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Export Period</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label>Period Start</Label>
              <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="w-44" />
            </div>
            <div>
              <Label>Period End</Label>
              <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="w-44" />
            </div>
            <Button onClick={() => refetch()} variant="outline">Preview</Button>
            <Button onClick={handleDownload} disabled={downloading} className="bg-green-600 hover:bg-green-700 text-white">
              {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Download CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            ["Active Staff", stats.activeStaff, Users, "text-blue-700"],
            ["New Starters", stats.starters, UserPlus, "text-green-700"],
            ["Leavers", stats.leavers, UserMinus, "text-red-700"],
            ["Period", `${new Date(stats.periodStart).toLocaleDateString("en-GB")} — ${new Date(stats.periodEnd).toLocaleDateString("en-GB")}`, Calendar, "text-gray-700"],
          ].map(([label, val, Icon, cls]: any) => (
            <Card key={String(label)}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <Icon className={`h-8 w-8 ${cls} opacity-80`} />
                  <div><div className={`text-xl font-bold ${cls}`}>{val}</div><div className="text-xs text-gray-500">{label}</div></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Preview ({rows.length} rows)</CardTitle>
              <Badge className="bg-gray-100 text-gray-700">Showing all staff</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    {["Name", "Dept", "Type", "Status", "Annual Leave", "Sick Days", "Other Leave", "Pending", "Starter", "Leaver"].map(h => (
                      <th key={h} className="text-left p-2 border font-medium text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any, i: number) => (
                    <tr key={i} className={`${r.is_leaver === "YES" ? "bg-red-50" : r.is_new_starter === "YES" ? "bg-green-50" : "hover:bg-gray-50"}`}>
                      <td className="p-2 border font-medium">{r.full_name}</td>
                      <td className="p-2 border text-gray-600">{r.department}</td>
                      <td className="p-2 border capitalize text-gray-600">{r.employment_type?.replace(/_/g, " ")}</td>
                      <td className="p-2 border capitalize">
                        <Badge className={r.employment_status === "leaver" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"} style={{ fontSize: "10px" }}>
                          {r.employment_status}
                        </Badge>
                      </td>
                      <td className="p-2 border text-center">{r.annual_leave_days_taken}</td>
                      <td className="p-2 border text-center">{r.sick_days_taken}</td>
                      <td className="p-2 border text-center">{r.other_leave_days_taken}</td>
                      <td className="p-2 border text-center">{r.leave_days_pending_approval}</td>
                      <td className="p-2 border text-center">{r.is_new_starter === "YES" ? <Badge className="bg-green-100 text-green-800" style={{ fontSize: "10px" }}>NEW</Badge> : "—"}</td>
                      <td className="p-2 border text-center">{r.is_leaver === "YES" ? <Badge className="bg-red-100 text-red-800" style={{ fontSize: "10px" }}>LEAVING</Badge> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-4">
          <h3 className="font-medium text-blue-900 mb-2">What's included in the export</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• All active staff and any leavers/starters within the selected period</li>
            <li>• Annual leave, sick leave and other leave days taken (approved only)</li>
            <li>• Leave pending approval (for your visibility — not yet confirmed)</li>
            <li>• New starter and leaver flags with dates and reasons</li>
            <li>• Employment type and pay grade for each staff member</li>
          </ul>
          <p className="text-xs text-blue-600 mt-3">The CSV is formatted for import into Sage, Xero, BrightPay and most payroll systems. Match the columns to your system's import template.</p>
        </CardContent>
      </Card>
    </div>
  );
}
