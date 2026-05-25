import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ClipboardCheck, CheckCircle2, X, AlertTriangle, RefreshCw,
  Upload, MapPin, CalendarDays, User, Camera,
} from "lucide-react";

interface AuditRecord {
  id: string;
  title: string;
  category: string;
  conductedBy: string;
  scheduledDate?: string | null;
  location?: string | null;
  status: string;
  overallScore?: number | null;
  passed?: boolean | null;
  templateName: string;
}

interface AuditRecordItem {
  id: string;
  question: string;
  isCritical: boolean;
  response?: string | null;
  note?: string | null;
  photoUrl?: string | null;
  photoFileName?: string | null;
  sortOrder: number;
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

const CATEGORY_COLORS: Record<string, string> = {
  safety: "bg-blue-100 text-blue-800",
  fire: "bg-red-100 text-red-800",
  environmental: "bg-green-100 text-green-800",
  vehicle: "bg-purple-100 text-purple-800",
  housekeeping: "bg-amber-100 text-amber-800",
  behavioural: "bg-teal-100 text-teal-800",
  custom: "bg-gray-100 text-gray-800",
};

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AuditMobile({ token }: { token: string }) {
  const qc = useQueryClient();
  const photoRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [localItems, setLocalItems] = useState<Record<string, Partial<AuditRecordItem>>>({});
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [uploadingItem, setUploadingItem] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ overallScore: number; passed: boolean; passCount: number; failCount: number; naCount: number } | null>(null);
  const [summaryText, setSummaryText] = useState("");

  const { data, isLoading, error } = useQuery<{ record: AuditRecord; items: AuditRecordItem[] }>({
    queryKey: ["/api/audits/public", token],
    queryFn: async () => {
      const res = await fetch(`/api/audits/public/${token}`);
      if (!res.ok) throw new Error((await res.json())?.error ?? "Audit not found");
      return res.json();
    },
    staleTime: 30000,
  });

  const record = data?.record;
  const items = data?.items ?? [];

  const mergedItems = items.map(item => ({
    ...item,
    ...(localItems[item.id] ?? {}),
  }));

  const respondedCount = mergedItems.filter(i => i.response && i.response !== 'not_checked').length;
  const totalCount = mergedItems.length;
  const progress = totalCount > 0 ? Math.round((respondedCount / totalCount) * 100) : 0;

  async function saveItemResponse(itemId: string, updates: Partial<AuditRecordItem>) {
    setLocalItems(prev => ({ ...prev, [itemId]: { ...(prev[itemId] ?? {}), ...updates } }));
    setSavingItem(itemId);
    try {
      await fetch(`/api/audits/public/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, ...updates }),
      });
    } catch {
      // silent failure — local state is already updated
    } finally {
      setSavingItem(null);
    }
  }

  async function handlePhotoUpload(itemId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingItem(itemId);
    setUploadErrors(prev => ({ ...prev, [itemId]: "" }));
    try {
      const b64 = await fileToBase64(file);
      const res = await fetch(`/api/audits/public/${token}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: b64, mimeType: file.type, fileName: file.name, itemId }),
      });
      if (!res.ok) {
        const { error: errMsg } = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(errMsg ?? "Upload failed");
      }
      const { fileUrl, fileName } = await res.json();
      setLocalItems(prev => ({
        ...prev,
        [itemId]: { ...(prev[itemId] ?? {}), photoUrl: fileUrl, photoFileName: fileName },
      }));
    } catch (err) {
      setUploadErrors(prev => ({ ...prev, [itemId]: err instanceof Error ? err.message : "Upload failed" }));
    } finally {
      setUploadingItem(null);
      if (photoRefs.current[itemId]) photoRefs.current[itemId]!.value = "";
    }
  }

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/audits/public/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: summaryText }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Submit failed");
      return res.json();
    },
    onSuccess: (result) => {
      setSubmitted(true);
      setSubmitResult({ overallScore: result.overallScore, passed: result.passed, passCount: result.passCount, failCount: result.failCount, naCount: result.naCount });
      qc.invalidateQueries({ queryKey: ["/api/audits/public", token] });
    },
  });

  const canSubmit = mergedItems.length > 0 && mergedItems.every(i => i.response && i.response !== 'not_checked');

  // ── Render states ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-slate-600 text-sm">Loading audit…</p>
        </div>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-6">
        <div className="max-w-sm bg-white rounded-2xl shadow-lg p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Audit Not Found</h1>
          <p className="text-gray-600 text-sm">{error instanceof Error ? error.message : "This link is invalid or has expired."}</p>
        </div>
      </div>
    );
  }

  if (submitted && submitResult) {
    const scoreColor = submitResult.passed ? "text-green-600" : "text-red-600";
    const bgColor = submitResult.passed ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200";
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-blue-700 text-white px-4 pt-safe-top pb-6">
          <div className="max-w-lg mx-auto pt-4">
            <div className="flex items-center gap-2 mb-2">
              <ClipboardCheck className="h-5 w-5 opacity-80" />
              <span className="text-sm font-medium opacity-80">Audit Complete</span>
            </div>
            <h1 className="text-xl font-bold">{record.title}</h1>
          </div>
        </div>
        <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
          <div className={`rounded-2xl border p-6 text-center ${bgColor}`}>
            <div className={`text-6xl font-bold mb-2 ${scoreColor}`}>{submitResult.overallScore}%</div>
            <div className="text-lg font-semibold mb-4">
              {submitResult.passed
                ? <span className="text-green-700">✓ Audit Passed</span>
                : <span className="text-red-700">✗ Audit Failed</span>}
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-white/70 rounded-lg p-3">
                <div className="text-2xl font-bold text-green-600">{submitResult.passCount}</div>
                <div className="text-xs text-slate-500">Passed</div>
              </div>
              <div className="bg-white/70 rounded-lg p-3">
                <div className="text-2xl font-bold text-red-600">{submitResult.failCount}</div>
                <div className="text-xs text-slate-500">Failed</div>
              </div>
              <div className="bg-white/70 rounded-lg p-3">
                <div className="text-2xl font-bold text-slate-500">{submitResult.naCount}</div>
                <div className="text-xs text-slate-500">N/A</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border p-4 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-slate-600">Your audit results have been recorded. Thank you!</p>
          </div>
        </div>
      </div>
    );
  }

  const catColor = CATEGORY_COLORS[record.category] ?? CATEGORY_COLORS.custom;
  const isCompleted = record.status === 'completed';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-blue-700 text-white px-4 pt-safe-top pb-4 sticky top-0 z-10">
        <div className="max-w-lg mx-auto pt-4">
          <div className="flex items-center gap-2 mb-1">
            <ClipboardCheck className="h-5 w-5 opacity-80" />
            <span className="text-sm font-medium opacity-80">Audit & Inspection</span>
          </div>
          <h1 className="text-lg font-bold leading-tight">{record.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${catColor}`}>
              {record.category}
            </span>
          </div>
          {/* Progress */}
          <div className="mt-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="opacity-80">{respondedCount} of {totalCount} items completed</span>
              <span className="opacity-80">{progress}%</span>
            </div>
            <div className="bg-white/30 rounded-full h-2">
              <div className="bg-white rounded-full h-2 transition-all" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-3">
        {/* Meta */}
        <div className="bg-white rounded-xl shadow-sm border p-4 grid grid-cols-2 gap-3 text-sm">
          {record.location && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-slate-500">Location</p>
                <p className="font-medium">{record.location}</p>
              </div>
            </div>
          )}
          {record.scheduledDate && (
            <div className="flex items-start gap-2">
              <CalendarDays className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-slate-500">Scheduled</p>
                <p className="font-medium">{fmtDate(record.scheduledDate)}</p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-2">
            <User className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-slate-500">Conducted By</p>
              <p className="font-medium">{record.conductedBy}</p>
            </div>
          </div>
        </div>

        {/* Checklist items */}
        {mergedItems.map((item) => {
          const resp = item.response;
          const showNote = !!(item.note) || resp === 'fail';
          const saving = savingItem === item.id;
          const uploading = uploadingItem === item.id;
          return (
            <div key={item.id} className={`bg-white rounded-xl shadow-sm border p-4 space-y-3 ${item.isCritical ? 'border-l-4 border-l-amber-400' : ''}`}>
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {item.isCritical && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        <AlertTriangle className="h-3 w-3" />Critical
                      </span>
                    )}
                    {saving && (
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <RefreshCw className="h-3 w-3 animate-spin" />Saving…
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-slate-800">{item.question}</p>
                </div>
              </div>

              {/* Critical fail warning */}
              {item.isCritical && resp === 'fail' && (
                <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                  <p className="text-xs text-red-700">Critical item — failing this will result in an overall audit failure regardless of score.</p>
                </div>
              )}

              {/* Response buttons */}
              {!isCompleted && (
                <div className="grid grid-cols-3 gap-2">
                  {(['pass', 'fail', 'na'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => saveItemResponse(item.id, { response: r })}
                      className={`py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                        resp === r
                          ? r === 'pass' ? 'bg-green-500 border-green-500 text-white'
                            : r === 'fail' ? 'bg-red-500 border-red-500 text-white'
                            : 'bg-slate-500 border-slate-500 text-white'
                          : r === 'pass' ? 'border-green-300 text-green-700 hover:bg-green-50'
                            : r === 'fail' ? 'border-red-300 text-red-700 hover:bg-red-50'
                            : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {r === 'pass' ? '✓ Pass' : r === 'fail' ? '✗ Fail' : 'N/A'}
                    </button>
                  ))}
                </div>
              )}

              {/* Note */}
              {(!isCompleted && (showNote || resp === 'fail')) && (
                <Textarea
                  placeholder={resp === 'fail' ? "Describe the issue found…" : "Add a note (optional)…"}
                  value={item.note ?? ""}
                  onChange={e => setLocalItems(prev => ({ ...prev, [item.id]: { ...(prev[item.id] ?? {}), note: e.target.value } }))}
                  onBlur={e => saveItemResponse(item.id, { note: e.target.value })}
                  rows={2}
                  className="text-sm"
                />
              )}
              {isCompleted && item.note && (
                <p className="text-xs text-slate-600 italic">Note: {item.note}</p>
              )}

              {/* Photo upload */}
              {!isCompleted && (resp === 'fail' || resp === 'pass') && (
                <div>
                  {item.photoUrl ? (
                    <div className="flex items-center gap-2 text-xs text-green-700">
                      <Camera className="h-4 w-4" />
                      <span>{item.photoFileName ?? "Photo uploaded"}</span>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        ref={el => { photoRefs.current[item.id] = el; }}
                        onChange={e => handlePhotoUpload(item.id, e)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs"
                        disabled={uploading}
                        onClick={() => photoRefs.current[item.id]?.click()}
                      >
                        {uploading
                          ? <><RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />Uploading…</>
                          : <><Upload className="h-3 w-3 mr-1.5" />Add Photo</>
                        }
                      </Button>
                      {uploadErrors[item.id] && (
                        <p className="text-xs text-red-600 mt-1">{uploadErrors[item.id]}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
              {isCompleted && item.photoUrl && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Camera className="h-4 w-4" />{item.photoFileName ?? "Photo attached"}
                </div>
              )}
            </div>
          );
        })}

        {/* Summary note */}
        {!isCompleted && (
          <div className="bg-white rounded-xl shadow-sm border p-4 space-y-2">
            <p className="text-sm font-medium text-slate-700">Inspector Notes (optional)</p>
            <Textarea
              placeholder="Overall observations, recommendations, or notes…"
              value={summaryText}
              onChange={e => setSummaryText(e.target.value)}
              rows={3}
              className="text-sm"
            />
          </div>
        )}

        {/* Submit */}
        {!isCompleted && (
          <div className="pb-8">
            {!canSubmit && (
              <p className="text-xs text-slate-500 text-center mb-2">
                Complete all {totalCount} checklist items to submit
              </p>
            )}
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-base font-semibold rounded-xl"
              disabled={!canSubmit || submitMutation.isPending}
              onClick={() => submitMutation.mutate()}
            >
              {submitMutation.isPending
                ? <><RefreshCw className="h-5 w-5 mr-2 animate-spin" />Submitting…</>
                : <><CheckCircle2 className="h-5 w-5 mr-2" />Submit Audit</>
              }
            </Button>
            {submitMutation.isError && (
              <p className="text-sm text-red-600 text-center mt-2">
                {submitMutation.error instanceof Error ? submitMutation.error.message : "Submit failed"}
              </p>
            )}
          </div>
        )}

        {isCompleted && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-green-700 font-medium">This audit has been completed.</p>
            {record.overallScore !== null && record.overallScore !== undefined && (
              <p className="text-sm text-green-600">Score: {record.overallScore}% — {record.passed ? "Passed" : "Failed"}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
