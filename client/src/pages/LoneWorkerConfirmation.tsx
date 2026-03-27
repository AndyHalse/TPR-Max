import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Shield, CheckCircle, AlertTriangle, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = 'loading' | 'success' | 'already_used' | 'expired' | 'error' | 'inactive';

interface ConfirmResult {
  success?: boolean;
  nextCheckMins?: number;
  workerName?: string;
  companyName?: string;
  alreadyUsed?: boolean;
  expired?: boolean;
  error?: string;
}

export default function LoneWorkerConfirmation() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [status, setStatus] = useState<Status>('loading');
  const [result, setResult] = useState<ConfirmResult>({});

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }

    fetch(`/api/lone-worker/ok/${token}`)
      .then(async (res) => {
        const data: ConfirmResult = await res.json();
        if (res.ok && data.success) {
          setResult(data);
          setStatus('success');
        } else if (data.alreadyUsed) {
          setStatus('already_used');
        } else if (data.expired) {
          setStatus('expired');
        } else if (!res.ok && data.error?.includes('no longer active')) {
          setStatus('inactive');
        } else {
          setResult(data);
          setStatus('error');
        }
      })
      .catch(() => setStatus('error'));
  }, [token]);

  const containerClass = "min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4";

  if (status === 'loading') {
    return (
      <div className={containerClass}>
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600 text-lg">Confirming your welfare check…</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className={containerClass}>
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-12 w-12 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">You're confirmed safe!</h1>
          {result.workerName && (
            <p className="text-slate-600 mb-4">Hi <strong>{result.workerName}</strong>, your welfare check has been recorded.</p>
          )}
          <div className="bg-blue-50 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-center gap-2 text-blue-700">
              <Clock className="h-5 w-5" />
              <span className="font-semibold">Next check-in in {result.nextCheckMins} minutes</span>
            </div>
            <p className="text-blue-600 text-sm mt-1">A new welfare check email will be sent to you automatically.</p>
          </div>
          {result.companyName && (
            <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
              <Shield className="h-4 w-4" />
              <span>Lone Worker Protection — {result.companyName}</span>
            </div>
          )}
          <div className="mt-6 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-amber-700 text-xs">If you are in danger, call <strong>999</strong> immediately.</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'already_used') {
    return (
      <div className={containerClass}>
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-12 w-12 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Already confirmed</h1>
          <p className="text-slate-600 mb-4">This welfare check link has already been used. Check your email for the next scheduled check-in link.</p>
          <div className="flex items-center justify-center gap-2 text-slate-500 text-sm mt-4">
            <Shield className="h-4 w-4" />
            <span>Lone Worker Protection</span>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className={containerClass}>
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="h-12 w-12 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Link expired</h1>
          <p className="text-slate-600 mb-4">This welfare check link has expired. Your supervisor may have been alerted. Please contact your supervisor to confirm you're safe.</p>
          <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
            <p className="text-red-700 text-sm font-medium">If you are in danger, call <strong>999</strong> immediately.</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'inactive') {
    return (
      <div className={containerClass}>
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Shield className="h-12 w-12 text-slate-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Session ended</h1>
          <p className="text-slate-600">Your lone worker session has been closed. No further check-ins are required.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClass}>
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="h-12 w-12 text-red-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Something went wrong</h1>
        <p className="text-slate-600 mb-4">{result.error || 'Unable to process your welfare check confirmation. Please contact your supervisor.'}</p>
        <Button onClick={() => window.location.reload()} variant="outline" className="mt-2">Try again</Button>
      </div>
    </div>
  );
}
