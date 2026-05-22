import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Network, Search, Users, Loader2, AlertTriangle, UserX, Repeat, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { useState, useMemo, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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
  circular: Array<Array<{ id: string; name: string }>>;
  totals: { noManager: number; inactiveManager: number; circular: number };
};

const DEPT_COLORS: Record<string, string> = {
  "Management":          "bg-purple-100 text-purple-800",
  "Finance":             "bg-green-100 text-green-800",
  "IT":                  "bg-blue-100 text-blue-800",
  "Operations":          "bg-orange-100 text-orange-800",
  "Human Resources":     "bg-pink-100 text-pink-800",
  "Sales":               "bg-yellow-100 text-yellow-800",
  "Marketing":           "bg-teal-100 text-teal-800",
  "Security":            "bg-red-100 text-red-800",
};
const deptColor = (dept: string) => DEPT_COLORS[dept] ?? "bg-gray-100 text-gray-700";

const COL_GAP = 20; // px — must match the gap used in the flex row below

function NodeAvatar({ node, size = 10 }: { node: StaffNode; size?: number }) {
  const cls = `rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold flex-shrink-0 overflow-hidden`;
  const px = size === 10 ? "w-10 h-10 text-sm" : "w-8 h-8 text-xs";
  return (
    <div className={`${cls} ${px}`}>
      {node.photo_url
        ? <img src={node.photo_url} alt="" className="w-full h-full object-cover rounded-full" />
        : `${node.first_name?.[0] ?? ""}${node.last_name?.[0] ?? ""}`}
    </div>
  );
}

function OrgNodeCard({
  node,
  reportCount,
  expanded,
  highlighted,
  isDragOver,
  onToggle,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  node: StaffNode;
  reportCount: number;
  expanded: boolean;
  highlighted: boolean;
  isDragOver: boolean;
  onToggle: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className={`relative group border rounded-xl px-3 py-2.5 bg-white shadow-sm transition-all select-none w-40
        ${highlighted ? "border-amber-400 ring-2 ring-amber-200" : "border-gray-200"}
        ${isDragOver ? "border-blue-400 ring-2 ring-blue-200 bg-blue-50 scale-105" : ""}
        ${!isDragOver && !highlighted ? "hover:border-blue-300 hover:shadow" : ""}
      `}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragOver && (
        <div className="absolute inset-x-0 -top-5 text-center text-[10px] font-medium text-blue-600 whitespace-nowrap pointer-events-none">
          Drop to assign
        </div>
      )}
      {/* draggable={false} stops the browser treating the <a> as a native draggable link */}
      <Link href={`/hr/staff/${node.id}`} onClick={e => e.stopPropagation()} draggable={false}>
        <div className="flex flex-col items-center gap-1.5 cursor-pointer pointer-events-none">
          <NodeAvatar node={node} size={10} />
          <div className="text-center min-w-0 w-full">
            <div className="font-semibold text-xs leading-tight truncate">{node.first_name} {node.last_name}</div>
            <div className="text-[10px] text-gray-500 leading-tight truncate mt-0.5">{node.job_title || "—"}</div>
          </div>
          <Badge className={`text-[10px] px-1.5 py-0 h-4 font-normal truncate max-w-full ${deptColor(node.department)}`}>
            {node.department || "—"}
          </Badge>
        </div>
      </Link>
      {reportCount > 0 && (
        <button
          onClick={e => { e.stopPropagation(); onToggle(); }}
          className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-white border border-gray-200 rounded-full text-[10px] px-1.5 py-0.5 shadow-sm hover:bg-gray-50 z-10 text-gray-600"
        >
          {expanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
          {reportCount}
        </button>
      )}
    </div>
  );
}

function LandscapeNode({
  node,
  childrenByMgr,
  highlightedId,
  expandedIds,
  toggleExpanded,
  dragOverId,
  setDragOverId,
  onDropOnManager,
  depth = 0,
  nodeRefs,
}: {
  node: StaffNode;
  childrenByMgr: Map<string, StaffNode[]>;
  highlightedId: string | null;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  dragOverId: string | null;
  setDragOverId: (id: string | null) => void;
  onDropOnManager: (managerId: string, e: React.DragEvent) => void;
  depth?: number;
  nodeRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}) {
  const children = childrenByMgr.get(node.id) || [];
  const expanded = expandedIds.has(node.id) || (depth < 2 && !expandedIds.has(`__collapsed:${node.id}`));

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(node.id);
  }, [node.id, setDragOverId]);

  // Only clear the highlight when the cursor genuinely leaves this card,
  // not when it moves between child elements inside it (avatar, text, badge).
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverId(null);
    }
  }, [setDragOverId]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);
    onDropOnManager(node.id, e);
  }, [node.id, onDropOnManager, setDragOverId]);

  const shownChildren = expanded ? children : [];

  return (
    <div className="flex flex-col items-center" ref={el => { nodeRefs.current[node.id] = el; }}>
      <OrgNodeCard
        node={node}
        reportCount={children.length}
        expanded={expanded}
        highlighted={highlightedId === node.id}
        isDragOver={dragOverId === node.id}
        onToggle={() => toggleExpanded(node.id)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      />

      {shownChildren.length > 0 && (
        <>
          {/* Stem down from card to horizontal bar */}
          <div className="w-px bg-gray-200" style={{ height: 20 }} />

          {/* Children row */}
          <div className="flex items-start" style={{ gap: COL_GAP }}>
            {shownChildren.map((child, i) => (
              <div key={child.id} className="flex flex-col items-center">
                {/* Connector: horizontal bar segment + vertical drop */}
                <div className="relative w-full" style={{ height: 20 }}>
                  {shownChildren.length > 1 && (
                    <div
                      className="absolute top-0 bg-gray-200"
                      style={{
                        height: 1,
                        left:  i === 0                        ? "50%" : `-${COL_GAP / 2}px`,
                        right: i === shownChildren.length - 1 ? "50%" : `-${COL_GAP / 2}px`,
                      }}
                    />
                  )}
                  <div
                    className="absolute bg-gray-200"
                    style={{ width: 1, top: 0, bottom: 0, left: "50%", transform: "translateX(-50%)" }}
                  />
                </div>
                <LandscapeNode
                  node={child}
                  childrenByMgr={childrenByMgr}
                  highlightedId={highlightedId}
                  expandedIds={expandedIds}
                  toggleExpanded={toggleExpanded}
                  dragOverId={dragOverId}
                  setDragOverId={setDragOverId}
                  onDropOnManager={onDropOnManager}
                  depth={depth + 1}
                  nodeRefs={nodeRefs}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function OrgChart() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [dragStaffId, setDragStaffId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const { data: allStaff = [], isLoading } = useQuery<StaffNode[]>({
    queryKey: ["/api/staff/org-chart"],
    queryFn: () => fetch("/api/staff/org-chart", { credentials: "include" }).then(r => r.json()),
  });

  const { data: validationRaw } = useQuery({
    queryKey: ["/api/staff/org-chart/validation"],
    queryFn: () => fetch("/api/staff/org-chart/validation", { credentials: "include" }).then(r => r.ok ? r.json() : null),
  });
  const validation: ValidationData | undefined =
    validationRaw && "noManager" in validationRaw ? (validationRaw as ValidationData) : undefined;

  const assignManager = useMutation({
    mutationFn: ({ staffId, managerId }: { staffId: string; managerId: string }) =>
      apiRequest("PATCH", `/api/staff/${staffId}/line-manager`, { lineManagerId: managerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/org-chart"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/org-chart/validation"] });
      toast({ title: "Line manager assigned", description: "The reporting line has been updated." });
    },
    onError: () => toast({ title: "Failed to assign manager", variant: "destructive" }),
  });

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); next.add(`__collapsed:${id}`); }
      else             { next.add(id);    next.delete(`__collapsed:${id}`); }
      return next;
    });
  };

  const { rootNodes, unassigned, childrenByMgr } = useMemo(() => {
    const byId = new Map<string, StaffNode>(allStaff.map(s => [s.id, s]));
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
      } else if (!s.line_manager_id) {
        roots.push(s);
      } else {
        unassigned.push(s);
      }
    }
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

  const handleDropOnManager = useCallback((managerId: string, e: React.DragEvent) => {
    e.preventDefault();
    const staffId = e.dataTransfer.getData("staffId");
    if (!staffId || staffId === managerId) return;
    assignManager.mutate({ staffId, managerId });
  }, [assignManager]);

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

  const totalIssues = (validation?.totals.noManager || 0) + (validation?.totals.inactiveManager || 0) + (validation?.totals.circular || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Validation warnings */}
      {validation && totalIssues > 0 && (
        <Card className="border-amber-200 bg-amber-50">
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
                    <button key={p.id} onClick={() => scrollToStaff(p.id)} className="text-xs px-2 py-0.5 rounded bg-white border border-amber-200 hover:bg-amber-100 text-amber-900">{p.name}</button>
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
                <div className="space-y-2 mt-1">
                  {validation.circular.map((chain, i) => (
                    <div key={i} className="text-xs bg-white border border-amber-200 rounded px-2 py-1 flex flex-wrap items-center gap-1">
                      {chain.map((member, idx) => (
                        <span key={member.id} className="flex items-center gap-1">
                          <button onClick={() => scrollToStaff(member.id)} className="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900">{member.name}</button>
                          {idx < chain.length - 1 && <span className="text-amber-700">→</span>}
                        </span>
                      ))}
                      <span className="text-amber-700">→ <em>{chain[0].name}</em></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dept summary */}
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
                      <NodeAvatar node={s} size={8} />
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
          {/* ── Landscape Org Chart ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Reporting Structure
              </CardTitle>
              <p className="text-xs text-gray-500">Click the badge on a manager node to collapse / expand their team.</p>
            </CardHeader>
            <CardContent>
              {rootNodes.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  No reporting structure configured yet. Assign line managers to staff profiles to build the org chart.
                </div>
              ) : (
                <div className="overflow-x-auto pb-4">
                  <div className="flex gap-16 min-w-max pt-2 px-4">
                    {rootNodes.map(r => (
                      <LandscapeNode
                        key={r.id}
                        node={r}
                        childrenByMgr={childrenByMgr}
                        highlightedId={highlightedId}
                        expandedIds={expandedIds}
                        toggleExpanded={toggleExpanded}
                        dragOverId={dragOverId}
                        setDragOverId={setDragOverId}
                        onDropOnManager={handleDropOnManager}
                        nodeRefs={nodeRefs}
                      />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Unassigned Pool ── */}
          {unassigned.length > 0 && (
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-gray-700">
                  <UserX className="h-4 w-4" /> Unassigned ({unassigned.length})
                </CardTitle>
                <p className="text-xs text-gray-500">
                  {dragStaffId
                    ? "Drag onto any manager in the chart above to assign them."
                    : "Drag a card onto a manager in the chart above to set their line manager. Or open their profile to edit directly."}
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                  {unassigned.map(s => (
                    <div
                      key={s.id}
                      ref={el => { nodeRefs.current[s.id] = el; }}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData("staffId", s.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragStaffId(s.id);
                      }}
                      onDragEnd={() => setDragStaffId(null)}
                      className={`flex items-center gap-2 bg-white border rounded-lg px-3 py-2 cursor-grab active:cursor-grabbing transition-all
                        ${highlightedId === s.id ? "border-amber-400 ring-2 ring-amber-200" : "border-gray-200 hover:border-blue-300"}
                        ${dragStaffId === s.id ? "opacity-50 scale-95" : ""}
                      `}
                    >
                      <GripVertical className="h-4 w-4 text-gray-300 flex-shrink-0" />
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-semibold text-xs flex-shrink-0 overflow-hidden">
                        {s.photo_url ? <img src={s.photo_url} alt="" className="w-full h-full object-cover" /> : `${s.first_name?.[0]}${s.last_name?.[0]}`}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{s.first_name} {s.last_name}</div>
                        <div className="text-xs text-gray-500 truncate">{s.job_title || s.department || "—"}</div>
                      </div>
                    </div>
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
