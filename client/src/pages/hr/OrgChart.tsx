import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { Network, Search, Users, ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";

type StaffNode = {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string;
  department: string;
  team: string;
  line_manager_id: string | null;
  photo_url: string | null;
  employment_status: string;
};

function OrgNode({ node, allStaff, depth = 0 }: { node: StaffNode; allStaff: StaffNode[]; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const reports = allStaff.filter(s => s.line_manager_id === node.id);

  return (
    <div className={`${depth > 0 ? "ml-6 border-l-2 border-gray-200 pl-4" : ""}`}>
      <div className="flex items-center gap-2 my-2">
        {reports.length > 0 && (
          <button onClick={() => setExpanded(!expanded)} className="text-gray-400 hover:text-gray-600">
            <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
        )}
        {reports.length === 0 && <div className="w-4" />}
        <Link href={`/hr/staff/${node.id}`}>
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition-colors">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-xs flex-shrink-0 overflow-hidden">
              {node.photo_url ? <img src={node.photo_url} alt="" className="w-full h-full object-cover" /> : `${node.first_name?.[0]}${node.last_name?.[0]}`}
            </div>
            <div>
              <div className="font-medium text-sm">{node.first_name} {node.last_name}</div>
              <div className="text-xs text-gray-500">{node.job_title || node.department}</div>
            </div>
            {reports.length > 0 && <Badge className="bg-gray-100 text-gray-600 text-xs ml-2">{reports.length}</Badge>}
          </div>
        </Link>
      </div>
      {expanded && reports.length > 0 && (
        <div>
          {reports.map(r => <OrgNode key={r.id} node={r} allStaff={allStaff} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

export default function OrgChart() {
  const [search, setSearch] = useState("");

  const { data: allStaff = [], isLoading } = useQuery<StaffNode[]>({
    queryKey: ["/api/staff/org-chart"],
    queryFn: () => fetch("/api/staff/org-chart", { credentials: "include" }).then(r => r.json()),
  });

  const filtered = search
    ? allStaff.filter(s => `${s.first_name} ${s.last_name} ${s.job_title} ${s.department}`.toLowerCase().includes(search.toLowerCase()))
    : allStaff;

  const roots = allStaff.filter(s => !s.line_manager_id || !allStaff.find(m => m.id === s.line_manager_id));

  const byDept = allStaff.reduce((acc: Record<string, number>, s) => {
    acc[s.department || "Unknown"] = (acc[s.department || "Unknown"] || 0) + 1;
    return acc;
  }, {});

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Network className="h-6 w-6 text-blue-600" /> Organisation Chart</h1>
          <p className="text-gray-500 text-sm mt-1">{allStaff.length} active staff members</p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input className="pl-9" placeholder="Search staff…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(byDept).map(([dept, count]) => (
          <Card key={dept}>
            <CardContent className="pt-3 pb-3 text-center">
              <div className="text-2xl font-bold text-blue-700">{count}</div>
              <div className="text-xs text-gray-500">{dept}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {search ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Search Results</CardTitle></CardHeader>
          <CardContent>
            {filtered.length === 0 ? <p className="text-gray-400 text-center py-4">No staff found matching "{search}"</p> : (
              <div className="space-y-2">
                {filtered.map(s => (
                  <Link key={s.id} href={`/hr/staff/${s.id}`}>
                    <div className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-xs">{s.first_name?.[0]}{s.last_name?.[0]}</div>
                      <div><div className="font-medium text-sm">{s.first_name} {s.last_name}</div><div className="text-xs text-gray-500">{s.job_title} · {s.department}</div></div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Reporting Structure</CardTitle></CardHeader>
          <CardContent>
            {roots.length === 0 ? (
              <div className="text-center py-8 text-gray-400">No staff with reporting structure configured. Assign line managers to staff profiles to build the org chart.</div>
            ) : (
              roots.map(r => <OrgNode key={r.id} node={r} allStaff={allStaff} />)
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
