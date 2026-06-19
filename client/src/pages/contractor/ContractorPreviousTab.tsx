import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import GlassCard from "@/components/GlassCard";
import { useLocation } from "wouter";
import {
  History,
  Search,
  LayoutGrid,
  List,
  Building2,
  Clock,
  CheckCircle,
  AlertTriangle,
  Edit,
  Mail,
  CalendarPlus,
  QrCode,
  LogIn,
  LogOut,
  Shield,
  ShieldOff,
} from "lucide-react";

interface ContractorPreviousTabProps {
  previousContractors: any[];
  totalWorkerCount: number;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
  showAllWorkers: boolean;
  setShowAllWorkers: (b: boolean) => void;
  previousViewMode: "grid" | "list";
  setPreviousViewMode: (v: "grid" | "list") => void;
  zones: any[];
  companySettings: any;
  checkInMutation: any;
  checkOutMutation: any;
  sendInductionMutation: any;
  startContractorLoneWorkerMutation: any;
  endContractorLoneWorkerMutation: any;
  getContractorLoneWorkerSession: (id: string) => any;
  getLoneWorkerCountdown: (session: any) => string;
  setViewingWorker: (w: any) => void;
  setSelectedWorkerForEdit: (w: any) => void;
  setSelectedWorkerCompanyName: (s: string) => void;
  setShowContractorEditModal: (b: boolean) => void;
  setPreBookingWorker: (w: any) => void;
  setPreBookCompanyName: (s: string) => void;
  setWorkerForCheckIn: (w: any) => void;
  setCompanyForCheckIn: (s: string) => void;
  setShowHSModal: (b: boolean) => void;
  setQrPassWorker: (w: any) => void;
  setSelectedWorker: (w: any) => void;
  setSelectedCompanyName: (s: string) => void;
  setShowPassPreview: (b: boolean) => void;
  toast: (opts: any) => void;
}

export default function ContractorPreviousTab({
  previousContractors,
  totalWorkerCount,
  searchTerm,
  setSearchTerm,
  showAllWorkers,
  setShowAllWorkers,
  previousViewMode,
  setPreviousViewMode,
  zones,
  companySettings,
  checkInMutation,
  checkOutMutation,
  sendInductionMutation,
  startContractorLoneWorkerMutation,
  endContractorLoneWorkerMutation,
  getContractorLoneWorkerSession,
  getLoneWorkerCountdown,
  setViewingWorker,
  setSelectedWorkerForEdit,
  setSelectedWorkerCompanyName,
  setShowContractorEditModal,
  setPreBookingWorker,
  setPreBookCompanyName,
  setWorkerForCheckIn,
  setCompanyForCheckIn,
  setShowHSModal,
  setQrPassWorker,
  setSelectedWorker,
  setSelectedCompanyName,
  setShowPassPreview,
  toast,
}: ContractorPreviousTabProps) {
  const [, setLocation] = useLocation();
  return (
        <div className="space-y-4">
          <div className="space-y-4">
            {/* Section Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                <h2 className="text-xl font-semibold text-fixed">Existing Contractor Workers</h2>
                <span className="hidden sm:inline text-sm text-variable">
                  Select an existing contractor worker to book onto site
                </span>
              </div>
              {/* Remove Duplicates button removed - duplication prevented via email validation */}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by contractor name or company..."
                className="pl-10"
                data-testid="input-search-contractors"
              />
            </div>

            {/* Show All Button & View Toggle */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
              <div className="text-sm text-slate-600 dark:text-slate-300">
                Showing {showAllWorkers ? previousContractors.length : Math.min(6, previousContractors.length)} of {previousContractors.length} contractors
                {searchTerm && ` matching "${searchTerm}"`}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex border rounded-lg overflow-hidden">
                  <Button
                    size="sm"
                    variant={previousViewMode === 'grid' ? 'default' : 'outline'}
                    className="rounded-none border-0 px-2"
                    onClick={() => setPreviousViewMode('grid')}
                    title="Grid view"
                  >
                    <LayoutGrid size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant={previousViewMode === 'list' ? 'default' : 'outline'}
                    className="rounded-none border-0 px-2"
                    onClick={() => setPreviousViewMode('list')}
                    title="List view"
                  >
                    <List size={14} />
                  </Button>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-blue-600 border-blue-600 hover:bg-blue-50 text-xs sm:text-sm whitespace-nowrap"
                  onClick={() => setShowAllWorkers(!showAllWorkers)}
                >
                  {showAllWorkers ? 'Show Less' : `Show All ${totalWorkerCount} Workers`}
                </Button>
              </div>
            </div>

            {/* Contractors Grid/List */}
            <div className={previousViewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6" : "space-y-2"}>
              {previousContractors.slice(0, showAllWorkers ? previousContractors.length : 6).map((contractor) => (
                previousViewMode === 'grid' ? (
                <GlassCard 
                  key={contractor.id} 
                  hover
                  className="cursor-pointer overflow-hidden"
                  onClick={() => setViewingWorker(contractor)}
                >
                  <div className="flex items-start space-x-3 mb-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ${
                      contractor.photoUrl ? '' :
                      ['bg-gradient-to-r from-orange-500 to-red-500',
                       'bg-gradient-to-r from-blue-500 to-purple-500',
                       'bg-gradient-to-r from-green-500 to-teal-500',
                       'bg-gradient-to-r from-purple-500 to-pink-500',
                       'bg-gradient-to-r from-indigo-500 to-purple-500',
                       'bg-gradient-to-r from-teal-500 to-cyan-500'][previousContractors.indexOf(contractor) % 6]
                    }`}>
                      {contractor.photoUrl ? (
                        <img
                          src={contractor.photoUrl.startsWith('/objects/') ? contractor.photoUrl : `/objects${contractor.photoUrl}`}
                          alt={`${contractor.firstName} ${contractor.lastName}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-white font-bold text-sm">
                          {(contractor.firstName?.[0] || '').toUpperCase()}{(contractor.lastName?.[0] || '').toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-fixed text-sm truncate">
                          {contractor.firstName} {contractor.lastName}
                        </h3>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                          contractor.isCheckedIn ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                        }`}>
                          {contractor.isCheckedIn ? 'Checked In' : 'Available'}
                        </span>
                      </div>
                      <p className="text-variable text-xs truncate flex items-center gap-1">
                        <Building2 className="h-3 w-3 flex-shrink-0" />
                        {contractor.companyName}
                      </p>
                      <p className="text-variable text-xs">
                        Last visit: {contractor.updatedAt ? new Date(contractor.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    {contractor.rightToWork === 'valid' ? (
                      <button onClick={(e) => { e.stopPropagation(); setLocation(`/contractors/${contractor.companyId}?tab=workers&workerId=${contractor.id}`); }} title="Right to Work verified — click to view worker profile" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800 hover:bg-green-200 cursor-pointer transition-colors">
                        <CheckCircle className="h-3 w-3 mr-0.5" />
                        Work Auth
                      </button>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); setLocation(`/contractors/${contractor.companyId}?tab=workers&workerId=${contractor.id}`); }} title="Right to Work not verified — click to review and approve" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800 hover:bg-red-200 cursor-pointer transition-colors">
                        <AlertTriangle className="h-3 w-3 mr-0.5" />
                        Work Auth
                      </button>
                    )}
                    {!contractor.inductionCompleted && (
                      <button onClick={(e) => { e.stopPropagation(); sendInductionMutation.mutate(contractor.id); }} title="Site induction not completed — click to send induction email now" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 cursor-pointer transition-colors">
                        <AlertTriangle className="h-3 w-3 mr-0.5" />
                        No Induction
                      </button>
                    )}
                    {(contractor as any).hasRedCard && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-200 text-red-900">Red Card</span>
                    )}
                    {(contractor as any).hasYellowCard && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-200 text-yellow-900">Yellow Card</span>
                    )}
                    {(!(contractor as any).hasRedCard && !(contractor as any).hasYellowCard) && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-200 text-green-900">Clear</span>
                    )}
                    {(contractor as any).zoneId && (() => {
                      const zone = zones.find((z: any) => z.id === (contractor as any).zoneId);
                      return zone ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: zone.color }} />
                          {zone.name}
                        </span>
                      ) : null;
                    })()}
                    {contractor.isCheckedIn && contractor.checkedInAt && (
                      <span className="text-[10px] text-variable flex items-center ml-auto">
                        <Clock className="h-3 w-3 mr-0.5" />
                        {new Date(contractor.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                    <div className="flex items-center gap-1.5 flex-1">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 w-8 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedWorkerForEdit(contractor);
                          setSelectedWorkerCompanyName(contractor.companyName);
                          setShowContractorEditModal(true);
                        }}
                        data-testid={`button-edit-worker-${contractor.id}`}
                        title="Edit contractor"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 w-8 p-0 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          sendInductionMutation.mutate(contractor.id);
                        }}
                        disabled={sendInductionMutation.isPending}
                        title="Send Site Induction Email"
                        data-testid={`button-send-induction-${contractor.id}`}
                      >
                        <Mail className="h-4 w-4" />
                      </Button>
                      {contractor.isCheckedIn && (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedWorker(contractor);
                            setSelectedCompanyName(contractor.companyName);
                            setShowPassPreview(true);
                          }}
                          title="Print Pass"
                          data-testid={`button-print-pass-${contractor.id}`}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                        </Button>
                      )}
                      {(() => {
                        const isBanned = contractor.hasActiveDisciplinaryCard && contractor.currentCardStatus === 'red' && contractor.redCardBanUntil && new Date(contractor.redCardBanUntil) > new Date();
                        const isClear = !isBanned && contractor.isActive && !contractor.hasActiveDisciplinaryCard;
                        return isClear ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                              onClick={(e) => { e.stopPropagation(); setQrPassWorker(contractor); }}
                              title="QR Pass"
                              data-testid={`button-qr-pass-${contractor.id}`}
                            >
                              <QrCode className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreBookingWorker(contractor);
                                setPreBookCompanyName(contractor.companyName);
                              }}
                              title="Pre-Book Worker"
                              data-testid={`button-prebook-${contractor.id}`}
                            >
                              <CalendarPlus className="h-4 w-4" />
                            </Button>
                          </>
                        ) : null;
                      })()}
                      {(() => {
                        const lwSession = getContractorLoneWorkerSession(contractor.id);
                        return lwSession ? (
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={(e) => { e.stopPropagation(); endContractorLoneWorkerMutation.mutate(contractor.id); }} disabled={endContractorLoneWorkerMutation.isPending} title="End lone worker session"><ShieldOff className="h-4 w-4" /></Button>
                        ) : (contractor.isCheckedIn && companySettings?.loneWorkerEnabled) ? (
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-green-700 hover:bg-green-50" onClick={(e) => { e.stopPropagation(); startContractorLoneWorkerMutation.mutate(contractor.id); }} disabled={startContractorLoneWorkerMutation.isPending || !contractor.email} title={contractor.email ? "Start lone worker session" : "Worker needs an email address"}><Shield className="h-4 w-4" /></Button>
                        ) : null;
                      })()}
                    </div>
                    {!contractor.isCheckedIn ? (() => {
                      const redBanned = !!(contractor.hasActiveDisciplinaryCard && contractor.currentCardStatus === 'red');
                      const notCleared = redBanned || contractor.rightToWork !== 'valid' || !contractor.inductionCompleted;
                      const blockReason = redBanned ? 'Active site ban (Red Card)' : contractor.rightToWork !== 'valid' ? 'Right to work not verified' : !contractor.inductionCompleted ? 'Site induction not completed' : '';
                      return (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (notCleared) {
                              toast({ title: "Cannot Check In", description: blockReason, variant: "destructive" });
                              return;
                            }
                            setWorkerForCheckIn(contractor);
                            setCompanyForCheckIn(contractor.companyName);
                            setShowHSModal(true);
                          }}
                          disabled={checkInMutation.isPending}
                          title={notCleared ? blockReason : 'Check in contractor'}
                          className={`h-9 px-3 text-sm font-medium border ${notCleared ? 'text-gray-400 border-gray-200 cursor-not-allowed dark:text-gray-600 dark:border-gray-600' : 'text-green-600 hover:text-green-700 border-green-300 hover:border-green-400 hover:bg-green-50'}`}
                          data-testid={`button-checkin-${contractor.id}`}
                        >
                          <LogIn className="mr-1.5 h-4 w-4" />
                          Check In
                        </Button>
                      );
                    })() : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          checkOutMutation.mutate(contractor.id);
                        }}
                        disabled={checkOutMutation.isPending}
                        className="h-9 px-3 text-sm font-medium text-red-600 hover:text-red-700 border-red-300 hover:border-red-400 hover:bg-red-50"
                        data-testid={`button-checkout-${contractor.id}`}
                      >
                        <LogOut className="mr-1.5 h-4 w-4" />
                        Check Out
                      </Button>
                    )}
                  </div>
                </GlassCard>
                ) : (
                <div key={contractor.id} className="bg-white/60 dark:bg-slate-800/60 rounded-lg border border-white/30 dark:border-slate-700/40 hover:bg-white/80 dark:hover:bg-slate-800/80 transition-all cursor-pointer" onClick={() => setViewingWorker(contractor)}>
                  {/* Info row — name never truncates on mobile */}
                  <div className="flex items-center gap-3 px-3 pt-3 pb-1">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ${
                      contractor.photoUrl ? '' :
                      ['bg-gradient-to-r from-orange-500 to-red-500',
                       'bg-gradient-to-r from-blue-500 to-purple-500',
                       'bg-gradient-to-r from-green-500 to-teal-500',
                       'bg-gradient-to-r from-purple-500 to-pink-500',
                       'bg-gradient-to-r from-indigo-500 to-purple-500',
                       'bg-gradient-to-r from-teal-500 to-cyan-500'][previousContractors.indexOf(contractor) % 6]
                    }`}>
                      {contractor.photoUrl ? (
                        <img src={contractor.photoUrl.startsWith('/objects/') ? contractor.photoUrl : `/objects${contractor.photoUrl}`} alt={`${contractor.firstName} ${contractor.lastName}`} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white font-bold text-xs">{(contractor.firstName?.[0] || '').toUpperCase()}{(contractor.lastName?.[0] || '').toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-fixed text-sm leading-tight">{contractor.firstName} {contractor.lastName}</p>
                      <p className="text-variable text-xs flex items-center gap-1 mt-0.5">
                        <Building2 className="h-3 w-3 flex-shrink-0" />
                        {contractor.companyName}
                        {contractor.isCheckedIn && contractor.checkedInAt && (
                          <span className="flex items-center gap-0.5 ml-2 text-green-700 font-medium">
                            <Clock className="h-3 w-3" />
                            {new Date(contractor.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </p>
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${contractor.isCheckedIn ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {contractor.isCheckedIn ? 'Checked In' : 'Available'}
                        </span>
                        {contractor.rightToWork === 'valid' ? (
                          <button onClick={(e) => { e.stopPropagation(); setLocation(`/contractors/${contractor.companyId}?tab=workers&workerId=${contractor.id}`); }} title="Right to Work verified — click to view worker profile" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800 hover:bg-green-200 cursor-pointer transition-colors"><CheckCircle className="h-2.5 w-2.5 mr-0.5" />Work Auth</button>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); setLocation(`/contractors/${contractor.companyId}?tab=workers&workerId=${contractor.id}`); }} title="Right to Work not verified — click to review and approve" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800 hover:bg-red-200 cursor-pointer transition-colors"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Work Auth</button>
                        )}
                        {!contractor.inductionCompleted && (
                          <button onClick={(e) => { e.stopPropagation(); sendInductionMutation.mutate(contractor.id); }} title="Site induction not completed — click to send induction email now" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 cursor-pointer transition-colors"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />No Induction</button>
                        )}
                        {(contractor as any).hasRedCard && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-200 text-red-900">Red Card</span>}
                        {(contractor as any).hasYellowCard && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-200 text-yellow-900">Yellow Card</span>}
                        {(!(contractor as any).hasRedCard && !(contractor as any).hasYellowCard) && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-200 text-green-900">Clear</span>}
                        {(contractor as any).zoneId && (() => {
                          const zone = zones.find((z: any) => z.id === (contractor as any).zoneId);
                          return zone ? <span className="inline-flex items-center gap-1 text-[10px]"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: zone.color }} />{zone.name}</span> : null;
                        })()}
                      </div>
                    </div>
                    {/* Desktop: all actions inline */}
                    {(() => {
                      const isBanned = contractor.hasActiveDisciplinaryCard && contractor.currentCardStatus === 'red' && contractor.redCardBanUntil && new Date(contractor.redCardBanUntil) > new Date();
                      const isClear = !isBanned && contractor.isActive && !contractor.hasActiveDisciplinaryCard;
                      const redBanned = !!(contractor.hasActiveDisciplinaryCard && contractor.currentCardStatus === 'red');
                      const notCleared = redBanned || contractor.rightToWork !== 'valid' || !contractor.inductionCompleted;
                      const blockReason = redBanned ? 'Active site ban (Red Card)' : contractor.rightToWork !== 'valid' ? 'Right to work not verified' : !contractor.inductionCompleted ? 'Site induction not completed' : '';
                      const lwSession = getContractorLoneWorkerSession(contractor.id);
                      return (
                        <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          {lwSession && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 animate-pulse"><Shield className="h-3 w-3" />{getLoneWorkerCountdown(lwSession)}</span>}
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); setSelectedWorkerForEdit(contractor); setSelectedWorkerCompanyName(contractor.companyName); setShowContractorEditModal(true); }} title="Edit"><Edit className="h-3.5 w-3.5" /></Button>
                          {isClear && <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-indigo-600 hover:bg-indigo-50" onClick={(e) => { e.stopPropagation(); setPreBookingWorker(contractor); setPreBookCompanyName(contractor.companyName); }} title="Pre-Book"><CalendarPlus className="h-3.5 w-3.5" /></Button>}
                          {lwSession ? (
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={(e) => { e.stopPropagation(); endContractorLoneWorkerMutation.mutate(contractor.id); }} disabled={endContractorLoneWorkerMutation.isPending} title="End lone worker session"><ShieldOff className="h-3.5 w-3.5" /></Button>
                          ) : (contractor.isCheckedIn && companySettings?.loneWorkerEnabled) ? (
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-green-700 hover:bg-green-50" onClick={(e) => { e.stopPropagation(); startContractorLoneWorkerMutation.mutate(contractor.id); }} disabled={startContractorLoneWorkerMutation.isPending || !contractor.email} title={contractor.email ? "Start lone worker session" : "Worker needs an email address"}><Shield className="h-3.5 w-3.5" /></Button>
                          ) : null}
                          {!contractor.isCheckedIn ? (
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); if (notCleared) { toast({ title: "Cannot Check In", description: blockReason, variant: "destructive" }); return; } setWorkerForCheckIn(contractor); setCompanyForCheckIn(contractor.companyName); setShowHSModal(true); }} disabled={checkInMutation.isPending} title={notCleared ? blockReason : 'Check in'} className={`h-9 px-3 ${notCleared ? 'text-gray-400 border-gray-200 cursor-not-allowed' : 'text-green-600 border-green-300 hover:bg-green-50'}`}><LogIn className="mr-1 h-4 w-4" />Check In</Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); checkOutMutation.mutate(contractor.id); }} disabled={checkOutMutation.isPending} className="h-9 px-3 text-red-600 border-red-300 hover:bg-red-50"><LogOut className="mr-1 h-4 w-4" />Check Out</Button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  {/* Mobile: actions as bottom row */}
                  {(() => {
                    const isBanned = contractor.currentCardStatus === 'red' && contractor.redCardBanUntil && new Date(contractor.redCardBanUntil) > new Date();
                    const isClear = !isBanned && contractor.isActive && (!contractor.currentCardStatus || contractor.currentCardStatus === 'clear' || contractor.currentCardStatus === 'yellow');
                    const redBanned = contractor.currentCardStatus === 'red';
                    const notCleared = redBanned || contractor.rightToWork !== 'valid' || !contractor.inductionCompleted;
                    const blockReason = redBanned ? 'Active site ban (Red Card)' : contractor.rightToWork !== 'valid' ? 'Right to work not verified' : !contractor.inductionCompleted ? 'Site induction not completed' : '';
                    const lwSession = getContractorLoneWorkerSession(contractor.id);
                    return (
                      <div className="sm:hidden flex items-center justify-between gap-2 px-3 pb-3 pt-1" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={(e) => { e.stopPropagation(); setSelectedWorkerForEdit(contractor); setSelectedWorkerCompanyName(contractor.companyName); setShowContractorEditModal(true); }} title="Edit"><Edit className="h-4 w-4" /></Button>
                          {isClear && <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-indigo-600 hover:bg-indigo-50" onClick={(e) => { e.stopPropagation(); setPreBookingWorker(contractor); setPreBookCompanyName(contractor.companyName); }} title="Pre-Book"><CalendarPlus className="h-4 w-4" /></Button>}
                          {lwSession ? (
                            <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={(e) => { e.stopPropagation(); endContractorLoneWorkerMutation.mutate(contractor.id); }} disabled={endContractorLoneWorkerMutation.isPending} title="End lone worker session"><ShieldOff className="h-4 w-4" /></Button>
                          ) : (contractor.isCheckedIn && companySettings?.loneWorkerEnabled) ? (
                            <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-slate-400 hover:text-green-700 hover:bg-green-50" onClick={(e) => { e.stopPropagation(); startContractorLoneWorkerMutation.mutate(contractor.id); }} disabled={startContractorLoneWorkerMutation.isPending || !contractor.email} title={contractor.email ? "Start lone worker session" : "Worker needs an email address"}><Shield className="h-4 w-4" /></Button>
                          ) : null}
                        </div>
                        {!contractor.isCheckedIn ? (
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); if (notCleared) { toast({ title: "Cannot Check In", description: blockReason, variant: "destructive" }); return; } setWorkerForCheckIn(contractor); setCompanyForCheckIn(contractor.companyName); setShowHSModal(true); }} disabled={checkInMutation.isPending} title={notCleared ? blockReason : 'Check in'} className={`h-9 px-3 font-medium ${notCleared ? 'text-gray-400 border-gray-200 cursor-not-allowed' : 'text-green-600 border-green-300 hover:bg-green-50'}`}><LogIn className="mr-1 h-4 w-4" />Check In</Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); checkOutMutation.mutate(contractor.id); }} disabled={checkOutMutation.isPending} className="h-9 px-3 font-medium text-red-600 border-red-300 hover:bg-red-50"><LogOut className="mr-1 h-4 w-4" />Check Out</Button>
                        )}
                      </div>
                    );
                  })()}
                </div>
                )
              ))}
            </div>

            {previousContractors.length === 0 && (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                {searchTerm ? `No contractors found matching "${searchTerm}"` : "No existing contractor workers found"}
              </div>
            )}
          </div>
        </div>
  );
}
