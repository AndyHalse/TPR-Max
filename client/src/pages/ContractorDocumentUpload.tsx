import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Upload, Clock, AlertTriangle, FileText, Loader2, ExternalLink } from "lucide-react";

const UK_DOC_FRAMEWORK = [
  { key: 'publicLiability', name: 'Public Liability Insurance', basis: 'Common law duty of care', note: 'Minimum £2m', category: 'legal', requiresExpiry: true },
  { key: 'employersLiability', name: "Employers' Liability Insurance", basis: "Employers' Liability Act 1969", note: 'Minimum £5m', category: 'legal', requiresExpiry: true },
  { key: 'cisRegistration', name: 'CIS Registration', basis: 'Finance Act 2004', note: 'Construction industry only', category: 'legal', requiresExpiry: false },
  { key: 'healthSafety', name: 'Health & Safety Policy', basis: 'H&S at Work Act 1974', note: 'Required before work commences', category: 'site', requiresExpiry: true },
  { key: 'rams', name: 'Risk Assessment & Method Statement (RAMS)', basis: 'MHSWR 1999', note: 'Site-specific, required before each job', category: 'site', requiresExpiry: true },
  { key: 'modernSlavery', name: 'Modern Slavery Statement', basis: 'Modern Slavery Act 2015', note: 'Mandatory for businesses >£36m turnover', category: 'good', requiresExpiry: false },
  { key: 'environmentalPolicy', name: 'Environmental Policy', basis: 'Client / ISO 14001', note: 'Increasingly required by clients', category: 'good', requiresExpiry: false },
  { key: 'professionalIndemnity', name: 'Professional Indemnity Insurance', basis: 'Client / design work', note: 'Required for design/consultancy roles', category: 'good', requiresExpiry: true },
];

interface Props { token: string; }

interface UploadState {
  file: File | null;
  expiry: string;
  issuedBy: string;
  uploading: boolean;
  done: boolean;
  error: string;
}

export default function ContractorDocumentUpload({ token }: Props) {
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({});
  const [allDone, setAllDone] = useState(false);

  const { data, isLoading, error: fetchError } = useQuery<any>({
    queryKey: ['/api/doc-request', token],
    queryFn: async () => {
      const res = await fetch(`/api/doc-request/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to load upload portal');
      }
      return res.json();
    },
    retry: false,
  });

  const getDocState = (key: string): UploadState =>
    uploadStates[key] ?? { file: null, expiry: '', issuedBy: '', uploading: false, done: false, error: '' };

  const setDocState = (key: string, patch: Partial<UploadState>) =>
    setUploadStates(prev => ({ ...prev, [key]: { ...getDocState(key), ...patch } }));

  const getExistingDoc = (key: string) =>
    (data?.documents || []).find((d: any) => d.documentType === key);

  const handleUpload = async (doc: typeof UK_DOC_FRAMEWORK[0]) => {
    const state = getDocState(doc.key);
    if (!state.file) { setDocState(doc.key, { error: 'Please select a file first' }); return; }
    if (doc.requiresExpiry && !state.expiry) { setDocState(doc.key, { error: 'Please enter the expiry date' }); return; }

    setDocState(doc.key, { uploading: true, error: '' });
    try {
      const urlRes = await fetch(`/api/doc-request/${token}/upload-url`);
      if (!urlRes.ok) throw new Error('Failed to get upload URL');
      const { uploadURL } = await urlRes.json();

      await fetch(uploadURL, { method: 'PUT', body: state.file, headers: { 'Content-Type': state.file.type || 'application/octet-stream' } });
      const documentUrl = uploadURL.split('?')[0];

      const uploadRes = await fetch(`/api/doc-request/${token}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentName: doc.name,
          documentType: doc.key,
          documentUrl,
          expiryDate: state.expiry || null,
          issuedBy: state.issuedBy || null,
        }),
      });
      if (!uploadRes.ok) {
        const body = await uploadRes.json().catch(() => ({}));
        throw new Error(body.error || 'Upload failed');
      }
      setDocState(doc.key, { uploading: false, done: true, error: '' });
    } catch (err: any) {
      setDocState(doc.key, { uploading: false, error: err.message || 'Upload failed' });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
          <p className="text-slate-500">Loading upload portal…</p>
        </div>
      </div>
    );
  }

  if (fetchError) {
    const msg = (fetchError as Error).message;
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center space-y-4">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Link Unavailable</h1>
          <p className="text-slate-500">{msg}</p>
          <p className="text-sm text-slate-400">Please contact your client for a new document request link.</p>
        </div>
      </div>
    );
  }

  const { company, settings } = data;
  const accentColor = settings?.accentColor || '#2460a9';
  const logoUrl = settings?.logoUrl
    ? (settings.logoUrl.startsWith('/uploads/') ? `/objects${settings.logoUrl}` : settings.logoUrl)
    : null;

  const uploadedCount = UK_DOC_FRAMEWORK.filter(d => {
    const state = getDocState(d.key);
    return state.done || !!getExistingDoc(d.key);
  }).length;

  const legalDocs = UK_DOC_FRAMEWORK.filter(d => d.category === 'legal');
  const siteDocs = UK_DOC_FRAMEWORK.filter(d => d.category === 'site');
  const goodDocs = UK_DOC_FRAMEWORK.filter(d => d.category === 'good');

  const DocSection = ({ title, badge, items }: { title: string; badge: string; items: typeof UK_DOC_FRAMEWORK }) => (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-slate-700">{title}</h3>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${accentColor}20`, color: accentColor }}>{badge}</span>
      </div>
      {items.map(doc => {
        const state = getDocState(doc.key);
        const existing = getExistingDoc(doc.key);
        const isDone = state.done || (existing && existing.status !== 'expired');

        return (
          <div key={doc.key} className={`border rounded-xl p-4 transition-all ${isDone ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm text-slate-800">{doc.name}</p>
                  {isDone ? (
                    <Badge className="bg-green-100 text-green-700 text-xs">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      {state.done ? 'Uploaded — Pending Review' : 'Already uploaded'}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-slate-400 border-slate-300 text-xs">Required</Badge>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{doc.basis} — {doc.note}</p>
                {existing?.expiryDate && !state.done && (
                  <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                    <Clock className="w-3 h-3" />Current expires: {new Date(existing.expiryDate).toLocaleDateString('en-GB')}
                  </div>
                )}
              </div>
            </div>

            {!isDone && (
              <div className="space-y-3 border-t border-slate-100 pt-3">
                <div>
                  <Label className="text-xs text-slate-600 mb-1 block">Select file (PDF, image, or Word document)</Label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                    className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                    onChange={e => setDocState(doc.key, { file: e.target.files?.[0] || null })}
                  />
                </div>
                {doc.requiresExpiry && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-slate-600 mb-1 block">Expiry date</Label>
                      <Input type="date" className="h-8 text-sm" value={getDocState(doc.key).expiry} onChange={e => setDocState(doc.key, { expiry: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600 mb-1 block">Issued by (optional)</Label>
                      <Input type="text" placeholder="Insurer / body" className="h-8 text-sm" value={getDocState(doc.key).issuedBy} onChange={e => setDocState(doc.key, { issuedBy: e.target.value })} />
                    </div>
                  </div>
                )}
                {state.error && <p className="text-xs text-red-600">{state.error}</p>}
                <Button
                  size="sm"
                  className="w-full text-white"
                  style={{ backgroundColor: accentColor }}
                  onClick={() => handleUpload(doc)}
                  disabled={state.uploading}
                >
                  {state.uploading ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Uploading…</> : <><Upload className="w-3.5 h-3.5 mr-1.5" />Upload {doc.name.split(' ').slice(0, 2).join(' ')}</>}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="text-white py-6 px-4" style={{ backgroundColor: accentColor }}>
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          {logoUrl && <img src={logoUrl} alt={settings?.companyName} className="h-10 max-w-32 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />}
          <div>
            <p className="text-sm opacity-80">{settings?.companyName || 'Compliance Portal'}</p>
            <h1 className="text-xl font-bold">Document Upload Portal</h1>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Intro card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${accentColor}20` }}>
              <FileText className="w-5 h-5" style={{ color: accentColor }} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">{company?.companyName}</h2>
              <p className="text-sm text-slate-500">Compliance document submission</p>
            </div>
          </div>
          <p className="text-sm text-slate-600">Please upload your compliance documents below. Each document will be reviewed by the {settings?.companyName || 'client'} team before being marked as compliant. Documents marked <em>Required</em> must be provided — optional documents are shown for completeness.</p>
          {data?.expiresAt && (
            <div className="flex items-center gap-2 mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
              This link expires on {new Date(data.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-slate-700">Upload Progress</p>
            <span className="text-sm font-bold" style={{ color: accentColor }}>{uploadedCount} of {UK_DOC_FRAMEWORK.length}</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div className="h-2 rounded-full transition-all" style={{ width: `${(uploadedCount / UK_DOC_FRAMEWORK.length) * 100}%`, backgroundColor: accentColor }} />
          </div>
        </div>

        {/* Doc sections */}
        <DocSection title="Legally Required" badge="UK Law" items={legalDocs} />
        <DocSection title="Site Required" badge="Most sites" items={siteDocs} />
        <DocSection title="Good Practice" badge="Recommended" items={goodDocs} />

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 pb-8 space-y-1">
          <p>Documents are stored securely and reviewed by the {settings?.companyName || 'client'} compliance team.</p>
          <p>Powered by TPR Visitor Management</p>
        </div>
      </div>
    </div>
  );
}
