import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { CheckSquare, Loader2 } from "lucide-react";

export default function OnboardingOverview() {
  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/onboarding/overview"],
    queryFn: () => fetch("/api/onboarding/overview", { credentials: "include" }).then(r => r.json()),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><CheckSquare className="h-6 w-6 text-blue-600" /> Onboarding Overview</h1>
        <p className="text-gray-500 text-sm mt-1">Staff with incomplete onboarding checklists</p>
      </div>

      {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div> : items.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <CheckSquare className="h-12 w-12 mx-auto text-green-400 mb-3" />
            <p className="text-gray-500 font-medium">All onboarding checklists complete!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item: any) => (
            <Link key={item.id} href={`/hr/staff/${item.staff_id}`}>
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{item.first_name} {item.last_name}</div>
                      <div className="text-sm text-gray-500">{item.department}{item.contract_start_date ? ` · Started ${new Date(item.contract_start_date).toLocaleDateString("en-GB")}` : ""}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-sm font-medium">{item.completed_items}/{item.total_items} tasks</div>
                        <div className="w-24 h-2 bg-gray-200 rounded-full mt-1">
                          <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${item.percent}%` }} />
                        </div>
                      </div>
                      <Badge className={item.percent === 100 ? "bg-green-100 text-green-800" : item.percent >= 50 ? "bg-blue-100 text-blue-800" : "bg-yellow-100 text-yellow-800"}>
                        {item.percent}%
                      </Badge>
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
