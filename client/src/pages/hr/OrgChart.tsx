import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { Network, Search, Users, ChevronRight, Loader2, AlertTriangle, UserX, Repeat } from "lucide-react";
import { useState, useMemo, useRef } from "react";

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

type ValidationData = {
  noManager: Array<{ id: string; name: string }>;
  inactiveManager: Array<{ id: string; name: string; managerId: string; managerName: string | null }>;
  circular: string[][];
  totals: { noManager: number; inactiveManager: number; circular: number };
};

function OrgNode({
  node,
  childrenByMgr,
  highlightedId,
  depth = 0,
  nodeRefs,
  expandedIds,
  toggleExpanded,
}: {
  node: StaffNode;
  childrenByMgr: Map<string, StaffNode[]>;
  highlightedId: string | null;
  depth?: number;
  nodeRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
}) {
  const reports = childrenByMgr.get(node.id) || [];
  const expanded = expandedIds.has(node.id) || (depth < 2 && !expandedIds.has(`__collapsed:${node.id}`));
  const highlighted = highlightedId === node.id;

  return (
    <div className={`${depth > 0 ? "ml-6 border-l-2 border-gray-200 pl-4" : ""}`}>
      <div
        className="flex items-center gap-2 my-2"
        ref={el => { nodeRefs.current[node.id] = el; }}
      >
        {reports.length > 0 ? (
          <button onClick={() => toggleExpanded(node.id)} className="text-gray-400 hover:text-gray-600">
            <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
        ) : <div className="w-4" />}
        <Link href={`/hr/staff/${node.id}`}>
          <div className={`flex items-center gap-2 bg-white border rounded-lg px-3 py-2 hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition-all ${highlighted ? "border-amber-400 ring-2 ring-amber-200" : "border-gray-200"}`}>
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
          {reports.map(r => (
            <OrgNode key={r.id} node={r} childrenByMgr={childrenByMgr} highlightedId={highlightedId} depth={depth + 1} nodeRefs={nodeRefs} expandedIds={expandedIds} toggleExpanded={toggleExpanded} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgChart() {
  const [search, setSearch] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        next.add(`__collapsed:${id}`);
      } else {
        next.add(id);
        next.delete(`__collapsed:${id}`);
      }
      return next;
    });
  };

  const { data: allStaff = [], isLoading } = useQuery<StaffNode[]>({
    queryKey: ["/api/staff/org-chart"],
    queryFn: () => fetch("/api/staff/org-chart", { credentials: "include" }).then(r => r.json()),
  });

  const { data: validation } = useQuery<ValidationData>({
    queryKey: ["/api/staff/org-chart/validation"],
    queryFn: () => fetch("/api/staff/org-chart/validation", { credentials: "include" }).then(r => r.json()),
  });

  // Build tree: only valid edges (manager exists in active set). Detect cycles and break them.
  const { rootNodes, unassigned, childrenByMgr } = useMemo(() => {
    const byId = new Map<string, StaffNode>(allStaff.map(s => [s.id, s]));

    // For each staff member, check whether their manager edge is valid AND non-cyclical.
    const inCycle = new Set<string>();
    for (const s of allStaff) {
      const visited = new Set<string>();
      let cur: StaffNode | undefined = s;
      while (cur && cur.line_manager_id && byId.has(cur.line_manager_id)) {
        if (visited.has(cur.id)) { inCycle.add(s.id); break; }
        visited.add(cur.id);
        cur = byId.get(cur.line_manager_id);
        if (cur && cur.id === s.id) { inCycle.add(s.id); break; }
      }
    }

    const childrenByMgr = new Map<string, StaffNode[]>();
    const roots: StaffNode[] = [];
    const unassigned: StaffNode[] = [];

    for (const s of allStaff) {
      const mgrValid = s.line_manager_id && byId.has(s.line_manager_id) && !inCycle.has(s.id);
      if (mgrValid) {
        const arr = childrenByMgr.get(s.line_manager_id!) || [];
        arr.push(s);
        childrenByMgr.set(s.line_manager_id!, arr);
      } else if (!s.line_manager_id || !byId.has(s.line_manager_id || "")) {
        // No manager, or manager not in active staff → could be a real root or orphan.
        // Treat as root only if they themselves are managers (have reports); otherwise unassigned.
        // We delay this decision until after the children map is built.
        roots.push(s);
      } else {
        // Member of a cycle — show in unassigned to break the cycle visually.
        unassigned.push(s);
      }
    }

    // Sort: people with reports first (true roots), then alphabetical
    const realRoots: StaffNode[] = [];
    for (const r of roots) {
      const hasReports = (childrenByMgr.get(r.id) || []).length > 0;
      if (hasReports) realRoots.push(r);
      else unassigned.push(r);
    }

    realRoots.sort((a, b) => `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`));
    unassigned.sort((a, b) => `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`));

    return { rootNodes: realRoots, unassigned, childrenByMgr };
  }, [allStaff]);

  const filtered = search
    ? allStaff.filter(s => `${s.first_name} ${s.last_name} ${s.job_title} ${s.department}`.toLowerCase().includes(search.toLowerCase()))
    : allStaff;

  const byDept = allStaff.reduce((acc: Record<string, number>, s) => {
    acc[s.department || "Unknown"] = (acc[s.department || "Unknown"] || 0) + 1;
    return acc;
  }, {});

  const scrollToStaff = (id: string) => {
    // Expand all ancestors so the target is rendered before we scroll
    const byId = new Map(allStaff.map(s => [s.id, s]));
    const ancestors: string[] = [];
    let cur = byId.get(id);
    const guard = new Set<string>();
    while (cur && cur.line_manager_id && byId.has(cur.line_manager_id) && !guard.has(cur.id)) {
      guard.add(cur.id);
      ancestors.push(cur.line_manager_id);
      cur = byId.get(cur.line_manager_id);
    }
    setExpandedIds(prev => {
      const next = new Set(prev);
      ancestors.forEach(a => { next.add(a); next.delete(`__collapsed:${a}`); });
      return next;
    });
    setHighlightedId(id);
    window.setTimeout(() => {
      const el = nodeRefs.current[id];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => setHighlightedId(prev => (prev === id ? null : prev)), 3000);
    }, 50);
  };

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

  const totalIssues = (validation?.totals.noManager || 0) + (validation?.totals.inactiveManager || 0) + (validation?.totals.circular || 0);

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

      {validation && totalIssues > 0 && (
        <Card className="border-amber-200 bg-amber-50" data-testid="card-validation">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> {totalIssues} reporting structure issue{totalIssues === 1 ? "" : "s"} to review
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {validation.totals.noManager > 0 && (
              <div>
                <div className="font-medium text-amber-900 flex items-center gap-1"><UserX className="h-4 w-4" /> {validation.totals.noManager} staff have no line manager</div>
                <div className="flex flex-wrap gap-2 mt-1">
                  {validation.noManager.map(p => (
                    <button key={p.id} onClick={() => scrollToStaff(p.id)} className="text-xs px-2 py-0.5 rounded bg-white border border-amber-200 hover:bg-amber-100 text-amber-900">
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {validation.totals.inactiveManager > 0 && (
              <div>
                <div className="font-medium text-amber-900 flex items-center gap-1"><UserX className="h-4 w-4" /> {validation.totals.inactiveManager} report{validation.totals.inactiveManager === 1 ? "s" : ""} to an inactive line manager</div>
                <div className="flex flex-wrap gap-2 mt-1">
                  {validation.inactiveManager.map(p => (
                    <button key={p.id} onClick={() => scrollToStaff(p.id)} className="text-xs px-2 py-0.5 rounded bg-white border border-amber-200 hover:bg-amber-100 text-amber-900">
                      {p.name}{p.managerName ? ` → ${p.managerName} (inactive)` : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {validation.totals.circular > 0 && (
              <div>
                <div className="font-medium text-amber-900 flex items-center gap-1"><Repeat className="h-4 w-4" /> {validation.totals.circular} circular reference{validation.totals.circular === 1 ? "" : "s"} detected</div>
                <div className="space-y-1 mt-1">
                  {validation.circular.map((chain, i) => (
                    <div key={i} className="text-xs text-amber-900 bg-white border border-amber-200 rounded px-2 py-1">
                      {chain.join(" → ")} → {chain[0]}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
        <>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Reporting Structure</CardTitle></CardHeader>
            <CardContent>
              {rootNodes.length === 0 ? (
                <div className="text-center py-8 text-gray-400">No staff with reporting structure configured. Assign line managers to staff profiles to build the org chart.</div>
              ) : (
                rootNodes.map(r => <OrgNode key={r.id} node={r} childrenByMgr={childrenByMgr} highlightedId={highlightedId} nodeRefs={nodeRefs} expandedIds={expandedIds} toggleExpanded={toggleExpanded} />)
              )}
            </CardContent>
          </Card>

          {unassigned.length > 0 && (
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-gray-700">
                  <UserX className="h-4 w-4" /> Unassigned ({unassigned.length})
                </CardTitle>
                <p className="text-xs text-gray-500">No line manager, manager no longer active, or part of a circular reference.</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {unassigned.map(s => (
                    <Link key={s.id} href={`/hr/staff/${s.id}`}>
                      <div
                        ref={el => { nodeRefs.current[s.id] = el; }}
                        className={`flex items-center gap-2 bg-white border rounded-lg px-3 py-2 hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition-all ${highlightedId === s.id ? "border-amber-400 ring-2 ring-amber-200" : "border-gray-200"}`}
                      >
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-semibold text-xs flex-shrink-0 overflow-hidden">
                          {s.photo_url ? <img src={s.photo_url} alt="" className="w-full h-full object-cover" /> : `${s.first_name?.[0]}${s.last_name?.[0]}`}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{s.first_name} {s.last_name}</div>
                          <div className="text-xs text-gray-500">{s.job_title || s.department || "—"}</div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
