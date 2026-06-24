import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { StickyNote, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatDateLocale } from "@/utils/formatDate";

interface StaffNotesTabProps {
  staffId: string;
}

const NOTE_TYPES = [
  { value: "general", label: "General", color: "bg-gray-100 text-gray-700" },
  { value: "welfare", label: "Welfare", color: "bg-blue-100 text-blue-700" },
  { value: "performance", label: "Performance", color: "bg-purple-100 text-purple-700" },
  { value: "safeguarding", label: "Safeguarding", color: "bg-red-100 text-red-700" },
];

function NoteTypeBadge({ type }: { type: string }) {
  const t = NOTE_TYPES.find(n => n.value === type) || NOTE_TYPES[0];
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${t.color}`}
    >
      {t.label}
    </span>
  );
}

export default function StaffNotesTab({ staffId }: StaffNotesTabProps) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState("general");

  const { data: notes = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/staff", staffId, "notes"],
    queryFn: () =>
      fetch(`/api/staff/${staffId}/notes`, { credentials: "include" }).then(r => r.json()),
  });

  const addMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/staff/${staffId}/notes`, {
        note: noteText,
        noteType,
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff", staffId, "notes"] });
      setNoteText("");
      setNoteType("general");
      setShowAdd(false);
      toast({ title: "Note added" });
    },
    onError: () => toast({ title: "Failed to add note", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => apiRequest("DELETE", `/api/staff/notes/${noteId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff", staffId, "notes"] });
      toast({ title: "Note deleted" });
    },
    onError: () => toast({ title: "Failed to delete note", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {showAdd ? (
        <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
          <Select value={noteType} onValueChange={setNoteType}>
            <SelectTrigger className="h-7 text-xs w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NOTE_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Add a note about this staff member..."
            className="text-xs min-h-[70px]"
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => {
                setShowAdd(false);
                setNoteText("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs h-7"
              disabled={!noteText.trim() || addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              {addMutation.isPending && (
                <Loader2 size={12} className="animate-spin mr-1" />
              )}
              Save Note
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs h-8 border-dashed"
          onClick={() => setShowAdd(true)}
        >
          <Plus size={12} className="mr-1.5" /> Add Note
        </Button>
      )}

      {notes.length === 0 ? (
        <div className="text-center py-8">
          <StickyNote className="h-7 w-7 mx-auto text-gray-300 mb-2" />
          <p className="text-gray-400 text-xs">No notes yet. Add the first note above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((n: any) => (
            <div
              key={n.id}
              className="bg-white border border-gray-100 rounded-lg px-3 py-2.5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <NoteTypeBadge type={n.note_type} />
                  <span className="text-[10px] text-gray-400">
                    {n.added_by} · {formatDateLocale(new Date(n.created_at))}
                  </span>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(n.id)}
                  className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
                  title="Delete note"
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Trash2 size={12} />
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-700 mt-1.5 whitespace-pre-wrap">{n.note}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
