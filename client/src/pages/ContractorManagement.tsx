import { HardHat, AlertTriangle, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import GlassCard from "@/components/GlassCard";
import WalkInContractorForm from "@/components/WalkInContractorForm";
import ContractorPassPreviewModal from "@/components/ContractorPassPreviewModal";
import { ContractorEditModal } from "@/components/ContractorEditModal";
import ContractorPreBooking from "@/components/ContractorPreBooking";
import ContractorHSModal from "@/components/ContractorHSModal";
import QRScannerModal from "@/components/QRScannerModal";
import RAMSManagement from "@/components/RAMSManagement";
import ContractorPPMTab from "./contractor/ContractorPPMTab";
import ContractorCDMTab from "./contractor/ContractorCDMTab";
import ContractorPreviousTab from "./contractor/ContractorPreviousTab";
import ContractorCompaniesTab from "./contractor/ContractorCompaniesTab";
import ContractorTabNav from "./contractor/ContractorTabNav";
import ContractorCO2Tab from "./contractor/ContractorCO2Tab";
import ContractorAssignHSTab from "./contractor/ContractorAssignHSTab";
import ContractorAddCompanyDialog from "./contractor/ContractorAddCompanyDialog";
import ContractorEditCompanyDialog from "./contractor/ContractorEditCompanyDialog";
import ContractorAddWorkerDialog from "./contractor/ContractorAddWorkerDialog";
import ContractorPreBookDialog from "./contractor/ContractorPreBookDialog";
import ContractorWorkerProfileDialog from "./contractor/ContractorWorkerProfileDialog";
import ContractorQrPassDialog from "./contractor/ContractorQrPassDialog";
import ContractorCheckInDialog from "./contractor/ContractorCheckInDialog";
import { useContractorManagement } from "./contractor/useContractorManagement";

export default function ContractorManagement() {
  const st = useContractorManagement();

  if (st.showWalkInForm) {
    return <WalkInContractorForm onBack={() => st.setShowWalkInForm(false)} />;
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 pb-24 sm:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HardHat className="h-8 w-8 text-orange-600" />
          <h1 className="text-xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100">Contractor Management</h1>
          {st.headerF10OverdueCount > 0 && (
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold cursor-pointer hover:bg-red-200 transition-colors"
              title={`${st.headerF10OverdueCount} CDM project${st.headerF10OverdueCount > 1 ? "s" : ""} with overdue F10 notification`}
              onClick={() => st.setActiveTab("cdm")}
            >
              <AlertTriangle className="h-3 w-3" />
              {st.headerF10OverdueCount} F10 overdue
            </span>
          )}
        </div>
        <Button
          onClick={() => st.setShowQRScanner(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base"
          title="Scan a contractor QR code to check in / out"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            <path d="M14 14h1v1h-1zm3 0h1v1h-1zm-3 3h1v1h-1zm3 3h1v1h-1zm3-3h1v1h-1zm0-3h1v1h-1z" />
          </svg>
          <span className="hidden sm:inline">Scan QR</span>
          <span className="sm:hidden">Scan</span>
        </Button>
      </div>

      <ContractorTabNav activeTab={st.activeTab} setActiveTab={st.setActiveTab} headerF10OverdueCount={st.headerF10OverdueCount} settings={st.companySettings} />

      {/* Tab Content */}
      {st.activeTab === "previous" && (
        <ContractorPreviousTab
          previousContractors={st.previousContractors}
          totalWorkerCount={st.allWorkers.length}
          searchTerm={st.searchTerm}
          setSearchTerm={st.setSearchTerm}
          showAllWorkers={st.showAllWorkers}
          setShowAllWorkers={st.setShowAllWorkers}
          previousViewMode={st.previousViewMode}
          setPreviousViewMode={st.setPreviousViewMode}
          zones={st.zones}
          companySettings={st.companySettings}
          checkInMutation={st.checkInMutation}
          checkOutMutation={st.checkOutMutation}
          sendInductionMutation={st.sendInductionMutation}
          startContractorLoneWorkerMutation={st.startContractorLoneWorkerMutation}
          endContractorLoneWorkerMutation={st.endContractorLoneWorkerMutation}
          getContractorLoneWorkerSession={st.getContractorLoneWorkerSession}
          getLoneWorkerCountdown={st.getLoneWorkerCountdown}
          setViewingWorker={st.setViewingWorker}
          setSelectedWorkerForEdit={st.setSelectedWorkerForEdit}
          setSelectedWorkerCompanyName={st.setSelectedWorkerCompanyName}
          setShowContractorEditModal={st.setShowContractorEditModal}
          setPreBookingWorker={st.setPreBookingWorker}
          setPreBookCompanyName={st.setPreBookCompanyName}
          setWorkerForCheckIn={st.setWorkerForCheckIn}
          setCompanyForCheckIn={st.setCompanyForCheckIn}
          setShowHSModal={st.setShowHSModal}
          setQrPassWorker={st.setQrPassWorker}
          setSelectedWorker={st.setSelectedWorker}
          setSelectedCompanyName={st.setSelectedCompanyName}
          setShowPassPreview={st.setShowPassPreview}
          toast={st.toast}
        />
      )}

      {st.activeTab === "walkin" && (
        <GlassCard className="p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-green-600" />
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Walk-in Registration</h2>
              <span className="hidden sm:inline text-sm text-slate-500 dark:text-slate-400">Register new contractor with document upload for clearance</span>
            </div>
            <div className="text-center py-8">
              <p className="text-slate-600 dark:text-slate-300 mb-4">Register a new contractor who is visiting for the first time</p>
              <Button onClick={() => st.setShowWalkInForm(true)} className="bg-green-600 hover:bg-green-700 text-white" data-testid="button-start-walkin-registration">
                <UserPlus className="mr-2 h-4 w-4" />
                Start Walk-in Registration
              </Button>
            </div>
          </div>
        </GlassCard>
      )}

      {st.activeTab === "contractors" && (
        <ContractorCompaniesTab
          companies={st.companies}
          searchTerm={st.searchTerm}
          setSearchTerm={st.setSearchTerm}
          showAllCompanies={st.showAllCompanies}
          setShowAllCompanies={st.setShowAllCompanies}
          companyViewMode={st.companyViewMode}
          setCompanyViewMode={st.setCompanyViewMode}
          handleViewContractorDetails={st.handleViewContractorDetails}
          handleEditContractor={st.handleEditContractor}
          handleDeleteContractor={st.handleDeleteContractor}
          deleteContractorMutation={st.deleteContractorMutation}
          setSelectedContractor={st.setSelectedContractor}
          setShowAddWorkerDialog={st.setShowAddWorkerDialog}
          setLocation={st.setLocation}
          setShowAddContractorDialog={st.setShowAddContractorDialog}
        />
      )}

      {st.activeTab === "prebook" && <ContractorPreBooking />}
      {st.activeTab === "co2" && st.companySettings?.featureContractors !== false && <ContractorCO2Tab companies={st.companies} selectedId={st.selectedCO2CompanyId} setSelectedId={st.setSelectedCO2CompanyId} />}
      {st.activeTab === "assign-hs" && <ContractorAssignHSTab setActiveTab={st.setActiveTab} toast={st.toast} />}
      {st.activeTab === "rams" && <RAMSManagement />}
      {st.activeTab === "ppm" && st.companySettings?.featurePPM !== false && <ContractorPPMTab />}
      {st.activeTab === "cdm" && st.companySettings?.featureContractors !== false && <ContractorCDMTab companies={st.companies} />}

      {st.selectedWorker && (
        <ContractorPassPreviewModal
          isOpen={st.showPassPreview}
          onClose={() => { st.setShowPassPreview(false); st.setSelectedWorker(null); st.setSelectedCompanyName(""); }}
          worker={st.selectedWorker}
          companyName={st.selectedCompanyName}
        />
      )}

      <ContractorEditModal worker={st.selectedWorkerForEdit} companyName={st.selectedWorkerCompanyName} open={st.showContractorEditModal} onOpenChange={st.setShowContractorEditModal} />

      <ContractorEditCompanyDialog open={st.showCompanyEditDialog} onOpenChange={st.setShowCompanyEditDialog} company={st.selectedContractor as any} customerId={st.customerId} />

      <ContractorAddCompanyDialog
        open={st.showAddContractorDialog}
        onOpenChange={st.setShowAddContractorDialog}
        customerId={st.customerId}
        onAddFirstWorker={(company) => { st.setSelectedContractor(company); st.setShowAddWorkerDialog(true); }}
      />

      <ContractorAddWorkerDialog open={st.showAddWorkerDialog} onOpenChange={st.setShowAddWorkerDialog} selectedContractor={st.selectedContractor} customerId={st.customerId} />

      <ContractorPreBookDialog worker={st.preBookingWorker} companyName={st.preBookCompanyName} onClose={() => st.setPreBookingWorker(null)} />

      <ContractorWorkerProfileDialog
        worker={st.viewingWorker}
        onClose={() => st.setViewingWorker(null)}
        checkInMutation={st.checkInMutation}
        checkOutMutation={st.checkOutMutation}
        onEditWorker={(worker: any, companyName: string) => { st.setSelectedWorkerForEdit(worker); st.setSelectedWorkerCompanyName(companyName); st.setShowContractorEditModal(true); }}
        onQrPass={(worker: any) => st.setQrPassWorker(worker)}
        onPreBook={(worker: any, companyName: string) => { st.setPreBookingWorker(worker); st.setPreBookCompanyName(companyName); }}
        onCheckIn={(worker: any, companyName: string) => { st.setWorkerForCheckIn(worker); st.setCompanyForCheckIn(companyName); st.setShowHSModal(true); }}
      />

      <ContractorQrPassDialog worker={st.qrPassWorker} onClose={() => st.setQrPassWorker(null)} />

      <ContractorCheckInDialog open={st.showCheckInHostDialog} onOpenChange={st.setShowCheckInHostDialog} checkInWorkerId={st.checkInWorkerId} checkInWorkerName={st.checkInWorkerName} checkInMutation={st.checkInMutation} />

      {st.workerForCheckIn && (
        <ContractorHSModal
          isOpen={st.showHSModal}
          onClose={() => { st.setShowHSModal(false); st.setWorkerForCheckIn(null); st.setCompanyForCheckIn(""); }}
          onAccept={(worker: any) => {
            st.setCheckInWorkerId(worker.id);
            st.setCheckInWorkerName(`${worker.firstName} ${worker.lastName}`);
            st.setSelectedCheckInHost("");
            st.setShowCheckInHostDialog(true);
            st.setShowHSModal(false);
            st.setWorkerForCheckIn(null);
            st.setCompanyForCheckIn("");
          }}
          worker={st.workerForCheckIn}
          companyName={st.companyForCheckIn}
        />
      )}

      <QRScannerModal isOpen={st.showQRScanner} onClose={() => st.setShowQRScanner(false)} />
    </div>
  );
}
