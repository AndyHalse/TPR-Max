import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Star, AlertTriangle, Loader2, ArrowLeft } from "lucide-react";

export default function AppraisalsDue() {
  const { data: due = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/appraisals/due"],
    queryFn: () => fetch("/api/appraisals/due", { credentials: "include" }).then(r => r.json()),
  });

  const overdue = due.filter((d: any) => !d.next_review_date || new Date(d.next_review_date) < new Date());
  const upcoming = due.filter((d: any) => d.next_review_date && new Date(d.next_review_date) >= new Date());

  return (
    <div className="space-y-6">
      <Link to="/hr" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors py-1 px-2 -ml-2 rounded-lg hover:bg-gray-100">
        <ArrowLeft className="h-4 w-4" /> Back to HR Hub
      </Link>
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Star className="h-6 w-6 text-blue-600" /> Appraisals Due</h1>
        <p className="text-gray-500 text-sm mt-1">Staff with upcoming or overdue performance reviews</p>
      </div>

      {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div> : due.length === 0 ? (
        <Card><CardContent className="text-center py-12"><Star className="h-12 w-12 mx-auto text-green-400 mb-3" /><p className="text-gray-500 font-medium">No appraisals due in the next 30 days.</p></CardContent></Card>
      ) : (
        <>
          {overdue.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-semibold text-red-700 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Overdue ({overdue.length})</h2>
              {overdue.map((d: any) => (
                <Link key={d.id} href={`/hr/staff/${d.id}`}>
                  <Card className="cursor-pointer hover:shadow-md transition-shadow border-red-200 bg-red-50">
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{d.first_name} {d.last_name}</div>
                          <div className="text-sm text-gray-500">{d.department} · {d.job_title}</div>
                          {d.last_review_date && <div className="text-xs text-gray-400 mt-1">Last review: {new Date(d.last_review_date).toLocaleDateString("en-GB")} ({d.last_review_type?.replace(/_/g, " ")})</div>}
                          {!d.last_review_date && <div className="text-xs text-red-500 mt-1 font-medium">No appraisal on record</div>}
                        </div>
                        <div className="text-right">
                          <Badge className="bg-red-100 text-red-800">
                            {d.next_review_date ? `Overdue ${Math.abs(Math.ceil((new Date(d.next_review_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))}d` : "Never appraised"}
                          </Badge>
                          <div className="mt-2"><Button size="sm" variant="outline" className="text-xs">Record Appraisal</Button></div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {upcoming.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-semibold text-yellow-700 flex items-center gap-2"><Star className="h-4 w-4" /> Upcoming (next 30 days) ({upcoming.length})</h2>
              {upcoming.map((d: any) => (
                <Link key={d.id} href={`/hr/staff/${d.id}`}>
                  <Card className="cursor-pointer hover:shadow-md transition-shadow border-yellow-200 bg-yellow-50">
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{d.first_name} {d.last_name}</div>
                          <div className="text-sm text-gray-500">{d.department} · {d.job_title}</div>
                        </div>
                        <Badge className="bg-yellow-100 text-yellow-800">Due {new Date(d.next_review_date).toLocaleDateString("en-GB")}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
