import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Shield, AlertTriangle, XCircle, CheckCircle2, 
  Phone, Mail, Award, Clock,
  LogIn, LogOut, Edit, Printer, FileText, Send, CalendarPlus, QrCode
} from "lucide-react";
import type { ContractorWorker } from "@shared/schema";

interface WorkerCardProps {
  worker: ContractorWorker;
  onIssueCard?: (workerId: string) => void;
  onResetCard?: (workerId: string) => void;
  onViewDetails?: (worker: ContractorWorker) => void;
  onCheckIn?: (worker: ContractorWorker) => void;
  onCheckOut?: (workerId: string) => void;
  onEdit?: (worker: ContractorWorker) => void;
  onPrint?: (worker: ContractorWorker) => void;
  onPreBook?: (worker: ContractorWorker) => void;
  onQrPass?: (worker: ContractorWorker) => void;
  onResendHSDocument?: (assignmentId: string) => void;
  canManageCards?: boolean;
  hsAssignments?: any[];
}

export function WorkerCard({ 
  worker, 
  onIssueCard, 
  onResetCard, 
  onViewDetails, 
  onCheckIn,
  onCheckOut,
  onEdit,
  onPrint,
  onPreBook,
  onQrPass,
  onResendHSDocument,
  canManageCards = false,
  hsAssignments = []
}: WorkerCardProps) {
  const isBanned = worker.currentCardStatus === 'red' && worker.redCardBanUntil && new Date(worker.redCardBanUntil) > new Date();
  const isAuthorisedToWork = !isBanned && worker.isActive && (!worker.currentCardStatus || worker.currentCardStatus === 'clear' || worker.currentCardStatus === 'yellow');
  const getCardStatusColor = (status: string) => {
    switch (status) {
      case 'red': return 'bg-red-500';
      case 'yellow': return 'bg-yellow-500';
      case 'clear': return 'bg-green-500';
      default: return 'bg-green-500';
    }
  };

  const getCardStatusIcon = (status: string) => {
    switch (status) {
      case 'red': return <XCircle className="w-5 h-5 text-white" />;
      case 'yellow': return <AlertTriangle className="w-5 h-5 text-white" />;
      case 'clear': return <CheckCircle2 className="w-5 h-5 text-white" />;
      default: return <CheckCircle2 className="w-5 h-5 text-white" />;
    }
  };

  const getCardStatusText = (status: string) => {
    switch (status) {
      case 'red': return 'RED CARD - BANNED';
      case 'yellow': return 'YELLOW CARD - WARNING';
      case 'clear': return 'CLEAR - COMPLIANT';
      default: return 'CLEAR - COMPLIANT';
    }
  };

  const isRedCardBanned = worker.currentCardStatus === 'red' && 
    worker.redCardBanUntil && 
    new Date(worker.redCardBanUntil) > new Date();

  const isClearForWork = !isRedCardBanned && worker.isActive && 
    (!worker.currentCardStatus || worker.currentCardStatus === 'clear' || worker.currentCardStatus === 'yellow');

  const isInducted = worker.inductionCompleted || (worker as any).siteInductionCompleted;
  const canCheckIn = isClearForWork && isInducted;

  return (
    <Card 
      className="relative w-full overflow-hidden shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer border-0" 
      data-testid={`worker-card-${worker.id}`}
      onClick={() => onViewDetails?.(worker)}
    >
      <div className={`${getCardStatusColor(worker.currentCardStatus)} px-4 py-3 text-center`}>
        <div className="flex items-center justify-center gap-2">
          {getCardStatusIcon(worker.currentCardStatus)}
          <span className="text-white font-bold text-sm tracking-wide">
            {getCardStatusText(worker.currentCardStatus)}
          </span>
        </div>
        {isRedCardBanned && (
          <div className="text-white/90 text-xs mt-1">
            Banned until: {new Date(worker.redCardBanUntil!).toLocaleDateString()}
          </div>
        )}
      </div>

      <div className="px-5 pt-5 pb-2 text-center">
        <div className="flex justify-center mb-3">
          <div className="w-16 h-16 border-3 border-white shadow-md rounded-full bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 flex items-center justify-center text-lg font-bold text-blue-700 dark:text-blue-200">
            {worker.firstName[0]}{worker.lastName[0]}
          </div>
        </div>
        <h3 className="font-bold text-lg leading-tight" data-testid={`worker-name-${worker.id}`}>
          {worker.firstName} {worker.lastName}
        </h3>
        <p className="text-muted-foreground text-sm mt-0.5">Contractor Worker</p>
      </div>

      <CardContent className="px-5 pb-5 space-y-3">
        {worker.isCheckedIn && worker.checkedInAt && (
          <div className="flex items-center justify-center gap-2 text-sm bg-green-50 dark:bg-green-900/20 rounded-lg py-2 px-3 border border-green-200 dark:border-green-800">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="font-medium text-green-700 dark:text-green-400">Checked In</span>
            <span className="text-green-600/70 dark:text-green-400/70">
              {new Date(worker.checkedInAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}

        <div className="space-y-1.5">
          {worker.email && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{worker.email}</span>
            </div>
          )}
          {worker.phone && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="w-3.5 h-3.5 shrink-0" />
              <span>{worker.phone}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!worker.isCheckedIn ? (
            <div className="flex-1 flex flex-col gap-0.5">
              <Button
                onClick={(e) => { e.stopPropagation(); if (canCheckIn) onCheckIn?.(worker); }}
                variant="outline"
                size="sm"
                disabled={!canCheckIn}
                className={`w-full ${canCheckIn ? 'text-green-600 hover:text-green-700 border-green-300 hover:border-green-400 hover:bg-green-50' : 'text-gray-400 border-gray-200 cursor-not-allowed opacity-60'}`}
                data-testid={`button-checkin-${worker.id}`}
                title={!isInducted ? 'Site induction must be completed before check-in' : !isClearForWork ? 'Worker is not cleared for site' : undefined}
              >
                <LogIn className="mr-1.5 h-3.5 w-3.5" />
                Check In
              </Button>
              {!isInducted && (
                <p className="text-xs text-amber-600 text-center leading-tight">No induction</p>
              )}
            </div>
          ) : (
            <Button
              onClick={(e) => { e.stopPropagation(); onCheckOut?.(worker.id); }}
              variant="outline"
              size="sm"
              className="flex-1 text-red-600 hover:text-red-700 border-red-300 hover:border-red-400 hover:bg-red-50"
              data-testid={`button-checkout-${worker.id}`}
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              Check Out
            </Button>
          )}
          
          {worker.isCheckedIn && !worker.hsRulesAccepted && (
            <Badge variant="outline" className="text-orange-600 border-orange-400 bg-orange-50 text-xs px-2 py-1">
              <Shield className="h-3 w-3 mr-1" />
              H&S Pending
            </Badge>
          )}

          <Button
            onClick={(e) => { e.stopPropagation(); onEdit?.(worker); }}
            size="icon"
            variant="ghost"
            className="shrink-0 h-8 w-8"
            data-testid={`button-edit-${worker.id}`}
          >
            <Edit className="h-3.5 w-3.5" />
          </Button>
          <Button
            onClick={(e) => { e.stopPropagation(); onPrint?.(worker); }}
            size="icon"
            variant="ghost"
            className="shrink-0 h-8 w-8"
            data-testid={`button-print-${worker.id}`}
            title="Print Pass"
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
          {isAuthorisedToWork && (
            <Button
              onClick={(e) => { e.stopPropagation(); onQrPass?.(worker); }}
              size="icon"
              variant="ghost"
              className="shrink-0 h-8 w-8 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
              data-testid={`button-qr-pass-${worker.id}`}
              title="QR Pass"
            >
              <QrCode className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(() => {
            const isInducted = worker.inductionCompleted || (worker as any).siteInductionCompleted;
            return (
              <Badge variant={isInducted ? "default" : "destructive"} className="text-xs">
                {isInducted ? "Inducted" : "No Induction"}
              </Badge>
            );
          })()}
        </div>

        <div className="space-y-2">
          <h4 className="font-semibold text-xs flex items-center gap-1 text-muted-foreground uppercase tracking-wider">
            <Award className="w-3.5 h-3.5" />
            Certifications
          </h4>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <div className="text-xs flex items-center gap-1">
              <span className="text-muted-foreground">CSCS:</span>
              <Badge variant={worker.cscsStatus === 'valid' ? 'default' : worker.cscsStatus === 'expired' ? 'destructive' : 'outline'} className="text-xs h-5 px-1.5">
                {worker.cscsStatus === 'valid' ? 'Valid' : worker.cscsStatus === 'expired' ? 'Expired' : worker.cscsStatus || 'Unknown'}
              </Badge>
            </div>
            <div className="text-xs flex items-center gap-1">
              <span className="text-muted-foreground">IPAF:</span>
              <Badge variant={worker.ipafStatus && worker.ipafStatus !== 'none' && worker.ipafStatus !== 'expired' ? 'default' : worker.ipafStatus === 'expired' ? 'destructive' : 'outline'} className="text-xs h-5 px-1.5">
                {worker.ipafStatus === 'none' || !worker.ipafStatus ? 'Unknown' : worker.ipafStatus === 'expired' ? 'Expired' : worker.ipafStatus}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {worker.asbestosAwareness && (
            <Badge variant="outline" className="text-xs h-5 px-1.5">Asbestos Aware</Badge>
          )}
          {worker.manualHandling && (
            <Badge variant="outline" className="text-xs h-5 px-1.5">Manual Handling</Badge>
          )}
        </div>

        {hsAssignments && hsAssignments.length > 0 && (
          <div className="space-y-1.5">
            <h4 className="font-semibold text-xs flex items-center gap-1 text-muted-foreground uppercase tracking-wider">
              <FileText className="w-3.5 h-3.5" />
              H&S Documents ({hsAssignments.length})
            </h4>
            <div className="space-y-1.5 max-h-24 overflow-y-auto">
              {hsAssignments.map((assignment: any) => {
                const getStatusColor = (status: string) => {
                  switch (status) {
                    case 'accepted': return 'bg-green-100 text-green-800';
                    case 'sent': return 'bg-blue-100 text-blue-800';
                    case 'pending': return 'bg-yellow-100 text-yellow-800';
                    case 'rejected': return 'bg-red-100 text-red-800';
                    case 'expired': return 'bg-gray-100 text-gray-800';
                    default: return 'bg-gray-100 text-gray-800';
                  }
                };
                
                return (
                  <div key={assignment.assignment.id} className="p-2 border rounded bg-white/50 dark:bg-slate-800/50">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" title={assignment.template.documentName}>
                          {assignment.template.documentName}
                        </p>
                        <Badge className={`text-xs mt-0.5 ${getStatusColor(assignment.assignment.status)}`}>
                          {assignment.assignment.status.charAt(0).toUpperCase() + assignment.assignment.status.slice(1)}
                        </Badge>
                      </div>
                      {assignment.assignment.status !== 'accepted' && onResendHSDocument && (
                        <Button
                          onClick={(e) => { e.stopPropagation(); onResendHSDocument(assignment.assignment.id); }}
                          size="sm"
                          variant="outline"
                          className="shrink-0 h-6 px-2 text-xs"
                          data-testid={`resend-hs-${assignment.assignment.id}`}
                        >
                          <Send className="h-3 w-3 mr-1" />
                          Resend
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {canManageCards && (
          <div className="flex gap-2 pt-1 border-t">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={(e) => { e.stopPropagation(); onIssueCard?.(worker.id); }}
              className="flex-1 text-xs h-8"
              data-testid={`issue-card-${worker.id}`}
            >
              Issue Card
            </Button>
            {worker.currentCardStatus === 'red' && (
              <Button 
                size="sm" 
                variant="default" 
                onClick={(e) => { e.stopPropagation(); onResetCard?.(worker.id); }}
                className="flex-1 text-xs h-8"
                data-testid={`reset-card-${worker.id}`}
              >
                Reset to Yellow
              </Button>
            )}
          </div>
        )}

        {isClearForWork && onPreBook && (
          <Button
            onClick={(e) => { e.stopPropagation(); onPreBook(worker); }}
            variant="outline"
            size="sm"
            className="w-full text-indigo-600 hover:text-indigo-700 border-indigo-300 hover:border-indigo-400 hover:bg-indigo-50 text-xs h-8"
          >
            <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
            Pre-Book
          </Button>
        )}

        {worker.cardStatusUpdatedAt && (
          <div className="text-xs text-muted-foreground flex items-center gap-1 pt-1">
            <Clock className="w-3 h-3" />
            Updated: {new Date(worker.cardStatusUpdatedAt).toLocaleDateString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}