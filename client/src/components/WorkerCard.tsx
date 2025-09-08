import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
// Note: Avatar component not available in current setup, using placeholder
import { 
  Shield, AlertTriangle, XCircle, CheckCircle2, 
  Calendar, Phone, Mail, Award, Clock,
  LogIn, LogOut, Edit, Printer
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
  canManageCards?: boolean;
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
  canManageCards = false 
}: WorkerCardProps) {
  const getCardStatusColor = (status: string) => {
    switch (status) {
      case 'red': return 'bg-red-500';
      case 'yellow': return 'bg-yellow-500';
      case 'clear': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getCardStatusIcon = (status: string) => {
    switch (status) {
      case 'red': return <XCircle className="w-6 h-6 text-white" />;
      case 'yellow': return <AlertTriangle className="w-6 h-6 text-white" />;
      case 'clear': return <CheckCircle2 className="w-6 h-6 text-white" />;
      default: return <Shield className="w-6 h-6 text-white" />;
    }
  };

  const getCardStatusText = (status: string) => {
    switch (status) {
      case 'red': return 'RED CARD - BANNED';
      case 'yellow': return 'YELLOW CARD - WARNING';
      case 'clear': return 'CLEAR - COMPLIANT';
      default: return 'UNKNOWN STATUS';
    }
  };

  const getCertificationStatus = (status: string) => {
    switch (status) {
      case 'valid': return { variant: 'default' as const, text: 'Valid' };
      case 'expired': return { variant: 'destructive' as const, text: 'Expired' };
      case 'expiring': return { variant: 'secondary' as const, text: 'Expiring' };
      case 'missing': return { variant: 'outline' as const, text: 'Missing' };
      default: return { variant: 'outline' as const, text: 'Unknown' };
    }
  };

  const isRedCardBanned = worker.currentCardStatus === 'red' && 
    worker.redCardBanUntil && 
    new Date(worker.redCardBanUntil) > new Date();

  return (
    <Card 
      className="relative w-full max-w-sm mx-auto overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer" 
      data-testid={`worker-card-${worker.id}`}
      onClick={() => onViewDetails?.(worker)}
    >
      {/* Card Status Header - Large visual indicator */}
      <div className={`${getCardStatusColor(worker.currentCardStatus)} p-4 text-center relative`}>
        <div className="flex items-center justify-center gap-2 mb-2">
          {getCardStatusIcon(worker.currentCardStatus)}
          <span className="text-white font-bold text-lg">
            {getCardStatusText(worker.currentCardStatus)}
          </span>
        </div>
        {isRedCardBanned && (
          <div className="text-white text-sm opacity-90">
            Banned until: {new Date(worker.redCardBanUntil!).toLocaleDateString()}
          </div>
        )}
      </div>

      <CardHeader className="text-center pb-2">
        <div className="flex justify-center mb-3">
          <div className="w-20 h-20 border-4 border-white shadow-lg rounded-full bg-blue-100 flex items-center justify-center text-lg font-bold">
            {worker.firstName[0]}{worker.lastName[0]}
          </div>
        </div>
        <h3 className="font-bold text-xl" data-testid={`worker-name-${worker.id}`}>
          {worker.firstName} {worker.lastName}
        </h3>
        <p className="text-muted-foreground">Contractor Worker</p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Contact Information */}
        <div className="space-y-2">
          {worker.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span className="truncate">{worker.email}</span>
            </div>
          )}
          {worker.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <span>{worker.phone}</span>
            </div>
          )}
        </div>

        {/* Action Buttons - Same as Visitor Cards */}
        <div className="flex items-center gap-2">
          {!worker.isCheckedIn ? (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onCheckIn?.(worker);
              }}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              data-testid={`button-checkin-${worker.id}`}
            >
              <LogIn className="mr-2 h-4 w-4" />
              Check In
            </Button>
          ) : (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onCheckOut?.(worker.id);
              }}
              variant="outline"
              className="flex-1"
              data-testid={`button-checkout-${worker.id}`}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Check Out
            </Button>
          )}
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(worker);
            }}
            size="icon"
            variant="outline"
            className="shrink-0"
            data-testid={`button-edit-${worker.id}`}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onPrint?.(worker);
            }}
            size="icon"
            variant="outline"
            className="shrink-0"
            data-testid={`button-print-${worker.id}`}
          >
            <Printer className="h-4 w-4" />
          </Button>
        </div>

        {/* Status Badges */}
        <div className="flex flex-wrap gap-2">
          <Badge variant={worker.inductionCompleted ? "default" : "destructive"} className="text-xs">
            {worker.inductionCompleted ? "Inducted" : "No Induction"}
          </Badge>
        </div>

        {/* Core Certifications */}
        <div className="space-y-2">
          <h4 className="font-semibold text-sm flex items-center gap-1">
            <Award className="w-4 h-4" />
            Certifications
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="text-xs">
              <span className="font-medium">CSCS:</span>
              <Badge {...getCertificationStatus(worker.cscsStatus)} className="ml-1 text-xs">
                {getCertificationStatus(worker.cscsStatus).text}
              </Badge>
            </div>
            <div className="text-xs">
              <span className="font-medium">IPAF:</span>
              <Badge {...getCertificationStatus(worker.ipafStatus)} className="ml-1 text-xs">
                {getCertificationStatus(worker.ipafStatus).text}
              </Badge>
            </div>
            {worker.cibtCard && (
              <div className="text-xs">
                <span className="font-medium">CIBT:</span>
                <Badge {...getCertificationStatus(worker.cibtStatus)} className="ml-1 text-xs">
                  {getCertificationStatus(worker.cibtStatus).text}
                </Badge>
              </div>
            )}
            {worker.cpcsCard && (
              <div className="text-xs">
                <span className="font-medium">CPCS:</span>
                <Badge {...getCertificationStatus(worker.cpcsStatus)} className="ml-1 text-xs">
                  {getCertificationStatus(worker.cpcsStatus).text}
                </Badge>
              </div>
            )}
            {worker.nvqLevel && (
              <div className="text-xs">
                <span className="font-medium">NVQ:</span>
                <Badge {...getCertificationStatus(worker.nvqStatus)} className="ml-1 text-xs">
                  Level {worker.nvqLevel}
                </Badge>
              </div>
            )}
          </div>
        </div>

        {/* Training Badges */}
        <div className="flex flex-wrap gap-1">
          {worker.asbestosAwareness && (
            <Badge variant="outline" className="text-xs">Asbestos Aware</Badge>
          )}
          {worker.manualHandling && (
            <Badge variant="outline" className="text-xs">Manual Handling</Badge>
          )}
        </div>

        {/* Card Management Actions */}
        {canManageCards && (
          <div className="flex gap-2 pt-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => onIssueCard?.(worker.id)}
              className="flex-1"
              data-testid={`issue-card-${worker.id}`}
            >
              Issue Card
            </Button>
            {worker.currentCardStatus === 'red' && (
              <Button 
                size="sm" 
                variant="default" 
                onClick={() => onResetCard?.(worker.id)}
                className="flex-1"
                data-testid={`reset-card-${worker.id}`}
              >
                Reset to Yellow
              </Button>
            )}
          </div>
        )}

        {/* Last Updated */}
        {worker.cardStatusUpdatedAt && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Status updated: {new Date(worker.cardStatusUpdatedAt).toLocaleDateString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}