import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import GlassCard from "@/components/GlassCard";
import {
  Building2,
  Search,
  LayoutGrid,
  List,
  UserPlus,
  Plus,
  Edit,
  Trash2,
  FileText,
  Users,
  Zap,
} from "lucide-react";
import { type ExtendedContractorCompany } from "./types";

interface ContractorCompaniesTabProps {
  companies: ExtendedContractorCompany[];
  searchTerm: string;
  setSearchTerm: (s: string) => void;
  showAllCompanies: boolean;
  setShowAllCompanies: (b: boolean) => void;
  companyViewMode: "grid" | "list";
  setCompanyViewMode: (v: "grid" | "list") => void;
  matchesSearch: (company: any, term: string) => boolean;
  getSafetyRatingColor: (rating: string) => string;
  getComplianceBadge: (documentsStatus?: Record<string, string>) => any;
  handleViewContractorDetails: (id: string) => void;
  handleEditContractor: (id: string) => void;
  handleDeleteContractor: (id: string, name: string) => void;
  deleteContractorMutation: any;
  setSelectedContractor: (c: any) => void;
  workerForm: any;
  setWorkerForm: (f: any) => void;
  setShowAddWorkerDialog: (b: boolean) => void;
  setLocation: (path: string) => void;
  setShowAddContractorDialog: (b: boolean) => void;
}

export default function ContractorCompaniesTab({
  companies,
  searchTerm,
  setSearchTerm,
  showAllCompanies,
  setShowAllCompanies,
  companyViewMode,
  setCompanyViewMode,
  matchesSearch,
  getSafetyRatingColor,
  getComplianceBadge,
  handleViewContractorDetails,
  handleEditContractor,
  handleDeleteContractor,
  deleteContractorMutation,
  setSelectedContractor,
  workerForm,
  setWorkerForm,
  setShowAddWorkerDialog,
  setLocation,
  setShowAddContractorDialog,
}: ContractorCompaniesTabProps) {
  return (
        <GlassCard className="p-6">
          <div className="space-y-4">
            {/* Section Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-purple-600" />
                <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Contractor Companies</h2>
                <span className="hidden sm:inline text-sm text-slate-500 dark:text-slate-400">
                  Manage all contractor companies and their details
                </span>
              </div>
              <Button
                onClick={() => setShowAddContractorDialog(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                data-testid="button-add-contractor"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Contractor
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by company name, industry, phone, or email..."
                className="pl-10"
                data-testid="input-search-companies"
              />
            </div>

            {/* Show All Button & View Toggle */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
              <div className="text-sm text-slate-600 dark:text-slate-300">
                Showing {showAllCompanies ? companies.filter(company => 
                  matchesSearch(company, searchTerm)
                ).length : Math.min(6, companies.filter(company => 
                  matchesSearch(company, searchTerm)
                ).length)} of {companies.filter(company => 
                  matchesSearch(company, searchTerm)
                ).length} companies
                {searchTerm && ` matching "${searchTerm}"`}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex border rounded-lg overflow-hidden">
                  <Button
                    size="sm"
                    variant={companyViewMode === 'grid' ? 'default' : 'outline'}
                    className="rounded-none border-0 px-2"
                    onClick={() => setCompanyViewMode('grid')}
                    title="Grid view"
                  >
                    <LayoutGrid size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant={companyViewMode === 'list' ? 'default' : 'outline'}
                    className="rounded-none border-0 px-2"
                    onClick={() => setCompanyViewMode('list')}
                    title="List view"
                  >
                    <List size={14} />
                  </Button>
                </div>
                <Button 
                  variant="outline"
                  size="sm"
                  className="text-purple-600 border-purple-600 hover:bg-purple-50 text-xs sm:text-sm whitespace-nowrap"
                  onClick={() => setShowAllCompanies(!showAllCompanies)}
                >
                  {showAllCompanies ? 'Show Less' : `Show All ${companies.length} Companies`}
                </Button>
              </div>
            </div>

            {/* Companies Grid/List */}
            <div className={companyViewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-2"}>
              {companies.filter(company => 
                matchesSearch(company, searchTerm)
              ).slice(0, showAllCompanies ? companies.length : 6).map((company) => (
                companyViewMode === 'grid' ? (
                <GlassCard key={company.id} className="p-4 hover:shadow-md transition-shadow">
                  <div className="space-y-3">
                    <div>
                      <h3
                        className="font-semibold text-slate-800 dark:text-slate-100 hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer hover:underline transition-colors"
                        onClick={() => handleViewContractorDetails(company.id)}
                        title="Click to view contractor details"
                      >
                        {company.name}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-300">{company.contactEmail || company.email}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">{(company as any).contactPhone || company.phone || 'No phone provided'}</p>
                      {company.industry && (
                        <p className="text-sm text-blue-600 font-medium capitalize">
                          {company.industry}
                        </p>
                      )}
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Workers: {company.workersCount || 0}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      <Badge 
                        className={company.status === 'approved' ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}
                      >
                        {company.status || 'pending'}
                      </Badge>
                      
                      <Badge className={getSafetyRatingColor(company.complianceScore || 'N/A')}>
                        {company.complianceScore || 'N/A'}
                      </Badge>
                      
                      {company.industry && (
                        <Badge className="bg-blue-100 text-blue-800 capitalize">
                          {company.serviceType || company.industry}
                        </Badge>
                      )}

                      {/* Compliance badge — derived from documentsStatus */}
                      {(() => {
                        const badge = getComplianceBadge((company as any).documentsStatus);
                        return (
                          <Badge className={`${badge.className} text-xs`} title="Document compliance status">
                            {badge.icon} {badge.label}
                          </Badge>
                        );
                      })()}

                      {/* CDM duty role badge */}
                      {company.cdmRole && (
                        <Badge className="bg-purple-100 text-purple-800 text-xs" title="CDM duty holder role">
                          CDM: {company.cdmRole.replace(/_/g, ' ')}
                        </Badge>
                      )}

                      {/* Constructionline grade badge */}
                      {company.constructionlineGrade && company.constructionlineGrade !== "not_registered" && (
                        <Badge className="bg-indigo-100 text-indigo-800 text-xs" title="Constructionline grade">
                          CL {company.constructionlineGrade}
                        </Badge>
                      )}

                      {/* CHAS certified badge */}
                      {company.chasCertified && (
                        <Badge className="bg-teal-100 text-teal-800 text-xs" title="CHAS accredited">
                          CHAS
                        </Badge>
                      )}

                      {/* SMAS accredited badge */}
                      {company.smasAccredited && (
                        <Badge className="bg-cyan-100 text-cyan-800 text-xs" title="SMAS accredited">
                          SMAS
                        </Badge>
                      )}
                    </div>

                    {/* Finish setup link if onboarding incomplete */}
                    {(company as any).onboardingCompleted === false && (
                      <button
                        className="text-xs text-amber-600 font-medium flex items-center gap-1 hover:underline"
                        onClick={() => handleViewContractorDetails(company.id)}
                      >
                        <Zap className="w-3 h-3" /> Finish setup
                      </button>
                    )}

                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleViewContractorDetails(company.id)}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                          data-testid={`button-workers-${company.id}`}
                        >
                          <Users className="h-3 w-3 mr-1" />
                          Workers
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-purple-600 border-purple-300 hover:bg-purple-50"
                          onClick={() => setLocation(`/contractors/${company.id}?tab=documents`)}
                          data-testid={`button-documents-${company.id}`}
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          Documents
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-green-600 border-green-600 hover:bg-green-50"
                          onClick={() => {
                            setSelectedContractor(company);
                            setWorkerForm({ ...workerForm, companyId: company.id });
                            setShowAddWorkerDialog(true);
                          }}
                          data-testid={`button-add-worker-${company.id}`}
                        >
                          <UserPlus className="h-3 w-3 mr-1" />
                          Add Worker
                        </Button>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="flex-1 text-blue-600 hover:bg-blue-50"
                          onClick={() => handleEditContractor(company.id)}
                          data-testid={`button-edit-company-${company.id}`}
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="flex-1 text-red-600 hover:bg-red-50"
                          onClick={() => handleDeleteContractor(company.id, company.name)}
                          disabled={deleteContractorMutation.isPending}
                          data-testid={`button-delete-company-${company.id}`}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                </GlassCard>
                ) : (
                <GlassCard key={company.id} className="p-3 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3
                            className="font-semibold text-slate-800 dark:text-slate-100 truncate hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer hover:underline transition-colors"
                            onClick={() => handleViewContractorDetails(company.id)}
                          >{company.name}</h3>
                          <Badge 
                            className={`text-xs ${company.status === 'approved' ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}
                          >
                            {company.status || 'pending'}
                          </Badge>
                          <Badge className={`text-xs ${getSafetyRatingColor(company.complianceScore || 'N/A')}`}>
                            {company.complianceScore || 'N/A'}
                          </Badge>
                          {company.industry && (
                            <Badge className="text-xs bg-blue-100 text-blue-800 capitalize">
                              {company.serviceType || company.industry}
                            </Badge>
                          )}
                          {/* Compliance badge */}
                          {(() => {
                            const badge = getComplianceBadge((company as any).documentsStatus);
                            return (
                              <Badge className={`${badge.className} text-xs`}>
                                {badge.icon} {badge.label}
                              </Badge>
                            );
                          })()}
                          {/* CDM accreditation badges */}
                          {company.cdmRole && (
                            <Badge className="bg-purple-100 text-purple-800 text-xs" title="CDM duty holder role">
                              CDM: {company.cdmRole.replace(/_/g, ' ')}
                            </Badge>
                          )}
                          {company.constructionlineGrade && company.constructionlineGrade !== "not_registered" && (
                            <Badge className="bg-indigo-100 text-indigo-800 text-xs">CL {company.constructionlineGrade}</Badge>
                          )}
                          {company.chasCertified && <Badge className="bg-teal-100 text-teal-800 text-xs">CHAS</Badge>}
                          {company.smasAccredited && <Badge className="bg-cyan-100 text-cyan-800 text-xs">SMAS</Badge>}
                          {(company as any).onboardingCompleted === false && (
                            <span className="text-xs text-amber-600 font-medium flex items-center gap-1 cursor-pointer hover:underline" onClick={() => handleViewContractorDetails(company.id)}>
                              <Zap className="w-3 h-3" /> Finish setup
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300 mt-1">
                          <span>{company.contactEmail || company.email}</span>
                          <span>{(company as any).contactPhone || company.phone || 'No phone'}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">Workers: {company.workersCount || 0}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleViewContractorDetails(company.id)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Users className="h-3 w-3 mr-1" />
                        Workers
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-purple-600 border-purple-300 hover:bg-purple-50"
                        onClick={() => setLocation(`/contractors/${company.id}?tab=documents`)}
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        Documents
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 border-green-600 hover:bg-green-50"
                        onClick={() => {
                          setSelectedContractor(company);
                          setWorkerForm({ ...workerForm, companyId: company.id });
                          setShowAddWorkerDialog(true);
                        }}
                      >
                        <UserPlus className="h-3 w-3 mr-1" />
                        Add Worker
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-blue-600 hover:bg-blue-50"
                        onClick={() => handleEditContractor(company.id)}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => handleDeleteContractor(company.id, company.name)}
                        disabled={deleteContractorMutation.isPending}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </GlassCard>
                )
              ))}
            </div>

            {companies.filter(company => 
              matchesSearch(company, searchTerm)
            ).length === 0 && (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                {searchTerm ? `No contractor companies found matching "${searchTerm}"` : "No contractor companies found"}
              </div>
            )}
          </div>
        </GlassCard>
  );
}
