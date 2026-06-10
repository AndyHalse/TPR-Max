import { useQuery } from "@tanstack/react-query";
import ContractorPortalLayout, { portalFetch, getPortalToken } from "./ContractorPortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Phone, Mail, Loader2, HardHat } from "lucide-react";

interface Worker {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phoneNumber?: string;
  mobileNumber?: string;
  jobTitle?: string;
  trade?: string;
  isActive: boolean;
}

export default function ContractorPortalWorkers() {
  const { data: workers = [], isLoading } = useQuery<Worker[]>({
    queryKey: ["portal-workers"],
    queryFn: () => portalFetch("/api/contractor-portal/workers").then((r) => r.json()),
    enabled: !!getPortalToken(),
  });

  return (
    <ContractorPortalLayout>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Workers</h2>
        <p className="text-slate-500 mt-1">
          Workers registered under your company. Contact your site administrator to add or update worker records.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : workers.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">No workers found</p>
            <p className="text-slate-400 text-sm mt-1">
              Workers are added by your site administrator.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workers.map((worker) => (
            <Card key={worker.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-sm font-semibold text-blue-700">
                      {worker.firstName[0]}{worker.lastName[0]}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-900">
                        {worker.firstName} {worker.lastName}
                      </p>
                      <Badge
                        variant={worker.isActive ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {worker.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>

                    {(worker.jobTitle || worker.trade) && (
                      <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                        <HardHat className="h-3 w-3" />
                        {worker.jobTitle || worker.trade}
                      </div>
                    )}

                    <div className="mt-2 space-y-0.5">
                      {worker.email && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Mail className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{worker.email}</span>
                        </div>
                      )}
                      {(worker.mobileNumber || worker.phoneNumber) && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Phone className="h-3 w-3 flex-shrink-0" />
                          {worker.mobileNumber || worker.phoneNumber}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </ContractorPortalLayout>
  );
}
