import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import AddStaffModal from "@/components/AddStaffModal";
import { Plus, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { Staff } from "@shared/schema";

export default function StaffManagement() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const { toast } = useToast();

  const { data: staff, isLoading } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/staff/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({
        title: "Success",
        description: "Staff member deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete staff member",
        variant: "destructive",
      });
    },
  });

  const getInitials = (staff: Staff) => {
    return `${staff.firstName[0]}${staff.lastName[0]}`.toUpperCase();
  };

  const getFullName = (staff: Staff) => {
    return `${staff.firstName} ${staff.lastName}`;
  };

  const getGradientClass = (index: number) => {
    const gradients = [
      'bg-gradient-to-r from-blue-500 to-purple-500',
      'bg-gradient-to-r from-green-500 to-teal-500',
      'bg-gradient-to-r from-purple-500 to-pink-500',
      'bg-gradient-to-r from-orange-500 to-red-500',
      'bg-gradient-to-r from-indigo-500 to-purple-500',
      'bg-gradient-to-r from-teal-500 to-cyan-500',
    ];
    return gradients[index % gradients.length];
  };

  if (isLoading) {
    return <div>Loading staff...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Staff Management</h2>
        <Button
          onClick={() => setIsAddModalOpen(true)}
          className="gradient-blue text-white font-medium hover:shadow-lg transition-all duration-300"
          data-testid="button-add-staff"
        >
          <Plus className="mr-2" size={16} />
          Add Staff Member
        </Button>
      </div>

      {/* Staff Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {!staff || staff.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-slate-600 text-lg">No staff members found</p>
            <p className="text-slate-500 text-sm mt-2">Add your first staff member to get started</p>
          </div>
        ) : (
          staff.map((member, index) => (
            <GlassCard key={member.id} hover>
              <div className="flex items-center space-x-4 mb-4">
                {member.photoUrl ? (
                  <img 
                    src={member.photoUrl} 
                    alt={getFullName(member)}
                    className="w-16 h-16 rounded-full object-cover"
                  />
                ) : (
                  <div className={`w-16 h-16 ${getGradientClass(index)} rounded-full flex items-center justify-center`}>
                    <span className="text-white font-bold text-lg">{getInitials(member)}</span>
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-800" data-testid={`staff-name-${member.id}`}>
                    {getFullName(member)}
                  </h3>
                  <p className="text-slate-600 text-sm" data-testid={`staff-email-${member.id}`}>
                    {member.email}
                  </p>
                  <p className="text-slate-500 text-sm" data-testid={`staff-department-${member.id}`}>
                    {member.department}
                  </p>
                  <p className="text-slate-500 text-xs" data-testid={`staff-id-${member.id}`}>
                    ID: {member.employeeId}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  member.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {member.isActive ? 'Active' : 'Inactive'}
                </span>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => setEditingStaff(member)}
                    className="text-blue-600 hover:text-blue-700 p-2 rounded-lg hover:bg-blue-50 transition-colors" 
                    data-testid={`button-edit-staff-${member.id}`}
                  >
                    <Edit size={16} />
                  </button>
                  <button 
                    onClick={() => deleteMutation.mutate(member.id)}
                    disabled={deleteMutation.isPending}
                    className="text-red-600 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                    data-testid={`button-delete-staff-${member.id}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </GlassCard>
          ))
        )}
      </div>

      <AddStaffModal 
        isOpen={isAddModalOpen || !!editingStaff} 
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingStaff(null);
        }}
        staffToEdit={editingStaff}
      />
    </div>
  );
}
