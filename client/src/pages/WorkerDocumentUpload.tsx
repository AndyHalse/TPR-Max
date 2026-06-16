import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Upload, Clock, AlertTriangle, FileText, Loader2 } from "lucide-react";

interface CertType {
  key: string;
  name: string;
  legal_basis: string;
  notes: string;
  category: string;
  requires_expiry: boolean;
}

interface UploadState {
  file: File | null;
  fileName: string;
  expiry: string;
  issuedBy: string;
  uploading: boolean;
  done: boolean;
  error: string;
}

interface DocCardProps {
  cert: CertType;
  state: UploadState;
  existingDoc: any;
  accentColor: string;
  onFileChange: (file: File | null, fileName: string) => void;
  onFieldChange: (patch: Partial<UploadState>) => void;
  onUpload: () => void;
}

// Defined outside the page component so React never remounts it on parent re-renders
function DocCard({ cert, state, existingDoc, accentColor, onFileChange, onFieldChange, onUpload }: DocCardProps) {
  const isDone = state.done || (existingDoc && existingDoc.status !== 'expired');

  return (
    <div className={`border rounded-xl p-4 transition-all ${isDone ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm text-slate-800">{cert.name}</p>
            {isDone ? (
              <Badge className="bg-green-100 text-green-700 text-xs border-0">
                <CheckCircle className="w-3 h-3 mr-1" />
                {state.done ? 'Uploaded — Pending Review' : 'Already uploaded'}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-slate-400 border-slate-300 text-xs">Required</Badge>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{cert.legal_basis}{cert.notes ? ` — ${cert.notes}` : ''}</p>
          {existingDoc?.expiryDate && !state.done && (
            <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
              <Clock className="w-3 h-3" />Current expires: {new Date(existingDoc.expiryDate).toLocaleDateString('en-GB')}
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
              onChange={e => {
                const f = e.target.files?.[0] || null;
                onFileChange(f, f?.name || '');
              }}
            />
            {state.fileName && !state.file && (
              <p className="text-xs text-slate-500 mt-1">Selected: {state.fileName}</p>
            )}
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">
                Expiry date{cert.requires_expiry ? '' : ' (optional)'}
              </Label>
              <Input
                type="date"
                className="h-8 text-sm w-full"
                value={state.expiry}
                onChange={e => onFieldChange({ expiry: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Issued by (optional)</Label>
              <Input
                type="text"
                placeholder="Insurer / body"
                className="h-8 text-sm"
                value={state.issuedBy}
                onChange={e => onFieldChange({ issuedBy: e.target.value })}
              />
            </div>
          </div>
          {state.error && <p className="text-xs text-red-600">{state.error}</p>}
          <Button
            size="sm"
            className="w-full text-white"
            style={{ backgroundColor: accentColor }}
            onClick={onUpload}
            disabled={state.uploading}
          >
            {state.uploading
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Uploading…</>
              : <><Upload className="w-3.5 h-3.5 mr-1.5" />Upload {cert.name.split(' ').slice(0, 3).join(' ')}</>
            }
          </Button>
        </div>
      )}
    </div>
  );
}

interface Props { token: string; }

export default function WorkerDocumentUpload({ token }: Props) {
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({});

  const { data, isLoading, error: fetchError } = useQuery<any>({
    queryKey: ['/api/worker-doc-request', token],
    queryFn: async () => {
      const res = await fetch(`/api/worker-doc-request/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to load upload portal');
      }
      return res.json();
    },
    retry: false,
  });

  const getDocState = (key: string): UploadState =>
    uploadStates[key] ?? { file: null, fileName: '', expiry: '', issuedBy: '', uploading: false, done: false, error: '' };

  const setDocState = (key: string, patch: Partial<UploadState>) =>
    setUploadStates(prev => ({ ...prev, [key]: { ...getDocState(key), ...patch } }));

  const getExistingDoc = (key: string) =>
    (data?.documents || []).find((d: any) => d.documentType === key);

  const handleUpload = async (cert: CertType) => {
    const state = getDocState(cert.key);
    if (!state.file) { setDocState(cert.key, { error: 'Please select a file first' }); return; }
    if (cert.requires_expiry && !state.expiry) { setDocState(cert.key, { error: 'Please enter the expiry date' }); return; }

    setDocState(cert.key, { uploading: true, error: '' });
    try {
      const formData = new FormData();
      formData.append('file', state.file);
      const fileRes = await fetch(`/api/worker-doc-request/${token}/upload-file`, {
        method: 'POST',
        body: formData,
      });
      if (!fileRes.ok) {
        const body = await fileRes.json().catch(() => ({}));
        throw new Error(body.error || 'File upload failed');
      }
      const { objectUrl } = await fileRes.json();

      const uploadRes = await fetch(`/api/worker-doc-request/${token}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentName: cert.name,
          documentType: cert.key,
          documentUrl: objectUrl,
          expiryDate: state.expiry || null,
          issuedBy: state.issuedBy || null,
        }),
      });
      if (!uploadRes.ok) {
        const body = await uploadRes.json().catch(() => ({}));
        throw new Error(body.error || 'Upload failed');
      }
      setDocState(cert.key, { uploading: false, done: true, error: '' });
    } catch (err: any) {
      setDocState(cert.key, { uploading: false, error: err.message || 'Upload failed' });
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center space-y-4">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Link Unavailable</h1>
          <p className="text-slate-500">{(fetchError as Error).message}</p>
          <p className="text-sm text-slate-400">Please contact your client for a new document request link.</p>
        </div>
      </div>
    );
  }

  const { worker, company, settings, certificationTypes = [] } = data;
  const accentColor = settings?.accentColor || '#2460a9';
  const logoUrl = settings?.logoUrl
    ? (settings.logoUrl.startsWith('/uploads/') ? `/objects${settings.logoUrl}` : settings.logoUrl)
    : null;

  const activeCerts: CertType[] = certificationTypes.length > 0 ? certificationTypes : [];

  const uploadedCount = activeCerts.filter(d => {
    const state = getDocState(d.key);
    return state.done || !!getExistingDoc(d.key);
  }).length;

  const legalDocs = activeCerts.filter(d => d.category === 'legal');
  const siteDocs = activeCerts.filter(d => d.category === 'site');
  const trainingDocs = activeCerts.filter(d => d.category === 'training');
  const otherDocs = activeCerts.filter(d => !['legal', 'site', 'training'].includes(d.category));

  const DocSection = ({ title, badge, items }: { title: string; badge: string; items: CertType[] }) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-slate-700">{title}</h3>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${accentColor}20`, color: accentColor }}>{badge}</span>
        </div>
        {items.map(cert => (
          <DocCard
            key={cert.key}
            cert={cert}
            state={getDocState(cert.key)}
            existingDoc={getExistingDoc(cert.key)}
            accentColor={accentColor}
            onFileChange={(file, fileName) => setDocState(cert.key, { file, fileName })}
            onFieldChange={patch => setDocState(cert.key, patch)}
            onUpload={() => handleUpload(cert)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="text-white py-6 px-4" style={{ backgroundColor: accentColor }}>
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          {logoUrl && <img src={logoUrl} alt={settings?.companyName} className="h-10 max-w-32 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />}
          <div>
            <p className="text-sm opacity-80">{settings?.companyName || 'Compliance Portal'}</p>
            <h1 className="text-xl font-bold">Worker Document Upload Portal</h1>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${accentColor}20` }}>
              <FileText className="w-5 h-5" style={{ color: accentColor }} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">{worker?.firstName} {worker?.lastName}</h2>
              {company?.companyName && <p className="text-sm text-slate-500">{company.companyName}</p>}
            </div>
          </div>
          <p className="text-sm text-slate-600">Please upload your compliance documents below. Each document will be reviewed by the {settings?.companyName || 'client'} team before being marked as compliant.</p>
          {data?.expiresAt && (
            <div className="flex items-center gap-2 mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
              This link expires on {new Date(data.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          )}
        </div>

        {activeCerts.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-slate-700">Upload Progress</p>
              <span className="text-sm font-bold" style={{ color: accentColor }}>{uploadedCount} of {activeCerts.length}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div className="h-2 rounded-full transition-all" style={{ width: `${(uploadedCount / activeCerts.length) * 100}%`, backgroundColor: accentColor }} />
            </div>
          </div>
        )}

        {activeCerts.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center text-slate-400">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No documents required at this time.</p>
            <p className="text-sm mt-1">Please contact your client if you believe this is incorrect.</p>
          </div>
        ) : (
          <>
            <DocSection title="Legally Required" badge="UK Law" items={legalDocs} />
            <DocSection title="Site Required" badge="Most sites" items={siteDocs} />
            <DocSection title="Training & Competence" badge="As required" items={trainingDocs} />
            <DocSection title="Other Documents" badge="As required" items={otherDocs} />
          </>
        )}

        <div className="text-center text-xs text-slate-400 pb-8 space-y-1">
          <p>Documents are stored securely and reviewed by the {settings?.companyName || 'client'} compliance team.</p>
          <p>Powered by TPR Visitor Management</p>
        </div>
      </div>
    </div>
  );
}
