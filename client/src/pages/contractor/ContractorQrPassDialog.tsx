import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QrCode, Mail, Printer, Download } from "lucide-react";

interface Props {
  worker: any | null;
  onClose: () => void;
}

function getWorkerPassBranding(companySettings: any) {
  return {
    logoUrl: companySettings?.logoUrl ? `/objects${companySettings.logoUrl}` : null,
    primaryColor: companySettings?.primaryColor || '#1e40af',
    companyName: companySettings?.companyName || 'TPR-Max',
    siteName: companySettings?.siteName || 'Site',
  };
}

function getBrandedWorkerPassHtml(qrCode: string, workerName: string, companyName: string, branding: ReturnType<typeof getWorkerPassBranding>) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body { font-family: system-ui, sans-serif; margin: 0; background: #fff; }
    .pass { width: 340px; margin: 20px auto; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.13); }
    .header { background: ${branding.primaryColor}; color: white; padding: 18px 20px 14px; }
    .header h1 { margin: 0 0 2px; font-size: 18px; font-weight: 700; }
    .header p { margin: 0; font-size: 11px; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px; }
    .body { padding: 20px; text-align: center; background: white; }
    .worker-name { font-size: 22px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
    .company { font-size: 14px; color: #64748b; margin-bottom: 18px; }
    .qr-wrap { background: #f8fafc; border-radius: 12px; padding: 16px; display: inline-block; margin-bottom: 14px; }
    .qr-code { font-family: monospace; font-size: 10px; color: #94a3b8; margin-top: 6px; }
    .footer { padding: 12px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 10px; color: #64748b; }
    img { border-radius: 8px; }
  </style></head><body>
    <div class="pass">
      <div class="header">
        ${branding.logoUrl ? `<img src="${branding.logoUrl}" height="32" style="margin-bottom:8px;border-radius:4px;" onerror="this.style.display='none'">` : ''}
        <h1>${branding.siteName}</h1>
        <p>Contractor Check-In Pass</p>
      </div>
      <div class="body">
        <div class="worker-name">${workerName}</div>
        <div class="company">${companyName}</div>
        <div class="qr-wrap">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrCode)}" width="180" height="180" alt="QR Code">
          <div class="qr-code">${qrCode}</div>
        </div>
        <p style="font-size:12px;color:#64748b;margin:0">Scan at kiosk to sign in/out</p>
      </div>
      <div class="footer">${branding.companyName} · Contractor Access Pass</div>
    </div>
  </body></html>`;
}

export default function ContractorQrPassDialog({ worker, onClose }: Props) {
  const { toast } = useToast();
  const [qrPassData, setQrPassData] = useState<{ qrCode: string; workerName: string; companyName: string } | null>(null);

  const { data: companySettings } = useQuery<any>({ queryKey: ['/api/company-settings'] });

  const sendWorkerQrPassMutation = useMutation({
    mutationFn: async ({ id, method }: { id: string; method: 'email' | 'download' }) => {
      const response = await apiRequest('POST', `/api/contractors/workers/${id}/qr-pass`, { method });
      return response.json();
    },
    onSuccess: (data: any, variables: { id: string; method: string }) => {
      setQrPassData({ qrCode: data.qrCode, workerName: data.workerName, companyName: data.companyName });
      if (variables.method === 'email') {
        toast({ title: "QR Pass Sent", description: `QR pass emailed to ${worker?.email || worker?.firstName}`, duration: 5000 });
      }
    },
    onError: (error: any) => toast({ title: "Failed to send QR pass", description: error.message, variant: "destructive" }),
  });

  const handlePrint = (workerId: string) => {
    sendWorkerQrPassMutation.mutate({ id: workerId, method: 'download' }, {
      onSuccess: (data: any) => {
        const branding = getWorkerPassBranding(companySettings);
        const html = getBrandedWorkerPassHtml(data.qrCode, data.workerName, data.companyName, branding);
        const win = window.open('', '_blank');
        if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 500); }
      }
    });
  };

  const handleDownload = (workerId: string) => {
    sendWorkerQrPassMutation.mutate({ id: workerId, method: 'download' }, {
      onSuccess: (data: any) => {
        const branding = getWorkerPassBranding(companySettings);
        const html = getBrandedWorkerPassHtml(data.qrCode, data.workerName, data.companyName || worker?.companyName, branding);
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `contractor-pass-${data.workerName?.replace(/\s+/g, '-').toLowerCase() || 'worker'}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    });
  };

  return (
    <Dialog open={!!worker} onOpenChange={(open) => { if (!open) { setQrPassData(null); onClose(); } }}>
      <DialogContent className="w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-indigo-600" />
            Contractor QR Check-In Pass
          </DialogTitle>
          <DialogDescription>
            Send a QR code pass to {worker?.firstName} {worker?.lastName} for quick kiosk check-in and check-out.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-sm">{worker ? `${worker.firstName[0]}${worker.lastName[0]}` : ''}</span>
              </div>
              <div>
                <p className="font-semibold text-gray-800">{worker?.firstName} {worker?.lastName}</p>
                <p className="text-sm text-gray-600">{worker?.companyName}</p>
              </div>
            </div>
          </div>

          {qrPassData && (
            <div className="text-center p-4 bg-white rounded-lg border">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrPassData.qrCode)}`} alt="Contractor QR Code" className="w-40 h-40 mx-auto mb-2 rounded-lg shadow-sm" />
              <p className="text-xs text-gray-500 font-mono">{qrPassData.qrCode}</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            <Button onClick={() => worker && sendWorkerQrPassMutation.mutate({ id: worker.id, method: 'email' })} disabled={sendWorkerQrPassMutation.isPending} className="w-full justify-start gap-3 h-14 bg-blue-600 hover:bg-blue-700 text-white">
              <Mail size={20} />
              <div className="text-left">
                <div className="font-medium">Email QR Pass</div>
                <div className="text-xs opacity-80">Send branded pass with QR code to {worker?.email}</div>
              </div>
            </Button>

            <Button variant="outline" onClick={() => worker && handlePrint(worker.id)} disabled={sendWorkerQrPassMutation.isPending} className="w-full justify-start gap-3 h-14">
              <Printer size={20} className="text-green-600" />
              <div className="text-left">
                <div className="font-medium">Print QR Pass</div>
                <div className="text-xs text-gray-500">Print a card-sized pass with QR code</div>
              </div>
            </Button>

            <Button variant="outline" onClick={() => worker && handleDownload(worker.id)} disabled={sendWorkerQrPassMutation.isPending} className="w-full justify-start gap-3 h-14">
              <Download size={20} className="text-purple-600" />
              <div className="text-left">
                <div className="font-medium">Download QR Image</div>
                <div className="text-xs text-gray-500">Download branded pass as image</div>
              </div>
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setQrPassData(null); onClose(); }}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
