import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { MapPin, Plus, Trash2, Edit, Save, Map, Upload, X, GripVertical, Pipette } from "lucide-react";

interface Zone {
  id: string;
  name: string;
  color: string;
  description: string | null;
  displayOrder: number;
  mapX: number | null;
  mapY: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CompanySettings {
  zonesEnabled?: boolean;
  zoneMapUrl?: string | null;
  [key: string]: any;
}

const ZONE_COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#EAB308",
  "#84CC16", "#22C55E", "#14B8A6", "#06B6D4",
  "#0EA5E9", "#3B82F6", "#6366F1", "#8B5CF6",
  "#A855F7", "#D946EF", "#EC4899", "#F43F5E",
];

function hexToHSV(hex: string): { h: number; s: number; v: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function ColorPickerPanel({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const safeHex = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#EF4444";
  const hsv = hexToHSV(safeHex);
  const [hue, setHue] = useState(hsv.h);
  const [sat, setSat] = useState(hsv.s);
  const [val, setVal] = useState(hsv.v);
  const [showPicker, setShowPicker] = useState(false);
  const gradRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const draggingGrad = useRef(false);
  const draggingHue = useRef(false);

  useEffect(() => {
    if (!showPicker) return;
    const newHsv = hexToHSV(/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#EF4444");
    setHue(newHsv.h);
    setSat(newHsv.s);
    setVal(newHsv.v);
  }, [showPicker]);

  const emitColor = (h: number, s: number, v: number) => {
    onChange(hsvToHex(h, s, v));
  };

  const handleGradMove = (e: React.MouseEvent | MouseEvent) => {
    if (!gradRef.current) return;
    const rect = gradRef.current.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    setSat(s);
    setVal(v);
    emitColor(hue, s, v);
  };

  const handleHueMove = (e: React.MouseEvent | MouseEvent) => {
    if (!hueRef.current) return;
    const rect = hueRef.current.getBoundingClientRect();
    const h = Math.max(0, Math.min(359, ((e.clientX - rect.left) / rect.width) * 360));
    setHue(h);
    emitColor(h, sat, val);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingGrad.current) handleGradMove(e);
      if (draggingHue.current) handleHueMove(e);
    };
    const onUp = () => { draggingGrad.current = false; draggingHue.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  });

  const pureHueColor = hsvToHex(hue, 1, 1);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded border-2 border-border cursor-pointer shrink-0"
          style={{ backgroundColor: color }}
          onClick={() => setShowPicker(!showPicker)}
        />
        <Input
          value={color}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v);
            if (/^#[0-9a-fA-F]{6}$/.test(v)) {
              const newHsv = hexToHSV(v);
              setHue(newHsv.h); setSat(newHsv.s); setVal(newHsv.v);
            }
          }}
          className="w-28 font-mono text-sm"
          maxLength={7}
        />
        <div className="flex gap-1 flex-wrap">
          {ZONE_COLORS.slice(0, 8).map((c) => (
            <button
              key={c}
              className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                backgroundColor: c,
                borderColor: color === c ? "white" : "transparent",
              }}
              onClick={() => {
                onChange(c);
                const newHsv = hexToHSV(c);
                setHue(newHsv.h); setSat(newHsv.s); setVal(newHsv.v);
              }}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setShowPicker(!showPicker)}
          title="Pick color"
        >
          <Pipette className="h-4 w-4" />
        </Button>
      </div>

      {showPicker && (
        <div className="rounded-lg border bg-popover p-3 shadow-lg space-y-3 w-[280px]">
          <div
            ref={gradRef}
            className="relative w-full h-[160px] rounded cursor-crosshair select-none"
            style={{
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pureHueColor})`,
            }}
            onMouseDown={(e) => { draggingGrad.current = true; handleGradMove(e); }}
          >
            <div
              className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{
                left: `${sat * 100}%`,
                top: `${(1 - val) * 100}%`,
                backgroundColor: color,
              }}
            />
          </div>

          <div
            ref={hueRef}
            className="relative w-full h-3 rounded-full cursor-pointer select-none"
            style={{
              background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
            }}
            onMouseDown={(e) => { draggingHue.current = true; handleHueMove(e); }}
          >
            <div
              className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{
                left: `${(hue / 360) * 100}%`,
                top: "50%",
                backgroundColor: pureHueColor,
              }}
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <span>R</span>
              <span className="font-mono">{parseInt(color.slice(1, 3), 16) || 0}</span>
            </div>
            <div className="flex items-center gap-1">
              <span>G</span>
              <span className="font-mono">{parseInt(color.slice(3, 5), 16) || 0}</span>
            </div>
            <div className="flex items-center gap-1">
              <span>B</span>
              <span className="font-mono">{parseInt(color.slice(5, 7), 16) || 0}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ZoneManagement() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [selectedZoneForPlacement, setSelectedZoneForPlacement] = useState<string | null>(null);

  const [zoneForm, setZoneForm] = useState({
    name: "",
    color: ZONE_COLORS[0],
    description: "",
  });

  const { data: zones = [] } = useQuery<Zone[]>({ queryKey: ["/api/zones"] });

  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/settings"],
  });

  const zonesEnabled = companySettings?.zonesEnabled ?? false;
  const zoneMapUrl = companySettings?.zoneMapUrl ?? null;

  const toggleZonesMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PUT", "/api/settings", { zonesEnabled: enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: zonesEnabled ? "Zones disabled" : "Zones enabled" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update zones setting", variant: "destructive" });
    },
  });

  const uploadMapMutation = useMutation({
    mutationFn: async (dataUrl: string) => {
      const res = await apiRequest("PUT", "/api/settings", { zoneMapUrl: dataUrl });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Zone map uploaded" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to upload zone map", variant: "destructive" });
    },
  });

  const removeMapMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/settings", { zoneMapUrl: null });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Zone map removed" });
    },
  });

  const createZoneMutation = useMutation({
    mutationFn: async (data: { name: string; color: string; description: string; displayOrder: number }) => {
      const res = await apiRequest("POST", "/api/zones", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/zones"] });
      setShowAddDialog(false);
      setZoneForm({ name: "", color: ZONE_COLORS[zones.length % ZONE_COLORS.length], description: "" });
      toast({ title: "Zone created" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create zone", variant: "destructive" });
    },
  });

  const updateZoneMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; color?: string; description?: string; mapX?: number | null; mapY?: number | null }) => {
      const res = await apiRequest("PUT", `/api/zones/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/zones"] });
      setShowEditDialog(false);
      setEditingZone(null);
      toast({ title: "Zone updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update zone", variant: "destructive" });
    },
  });

  const deleteZoneMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/zones/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/zones"] });
      toast({ title: "Zone deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete zone", variant: "destructive" });
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      uploadMapMutation.mutate(dataUrl);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleMapClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!selectedZoneForPlacement || !mapRef.current) return;
      const rect = mapRef.current.getBoundingClientRect();
      const mapX = ((e.clientX - rect.left) / rect.width) * 100;
      const mapY = ((e.clientY - rect.top) / rect.height) * 100;
      updateZoneMutation.mutate({
        id: selectedZoneForPlacement,
        mapX: Math.round(mapX * 100) / 100,
        mapY: Math.round(mapY * 100) / 100,
      });
      setSelectedZoneForPlacement(null);
    },
    [selectedZoneForPlacement, updateZoneMutation]
  );

  const openAddDialog = () => {
    setZoneForm({
      name: "",
      color: ZONE_COLORS[zones.length % ZONE_COLORS.length],
      description: "",
    });
    setShowAddDialog(true);
  };

  const openEditDialog = (zone: Zone) => {
    setEditingZone(zone);
    setZoneForm({
      name: zone.name,
      color: zone.color,
      description: zone.description || "",
    });
    setShowEditDialog(true);
  };

  const handleCreateZone = () => {
    if (!zoneForm.name.trim()) {
      toast({ title: "Error", description: "Zone name is required", variant: "destructive" });
      return;
    }
    createZoneMutation.mutate({
      name: zoneForm.name.trim(),
      color: zoneForm.color,
      description: zoneForm.description.trim(),
      displayOrder: zones.length + 1,
    });
  };

  const handleUpdateZone = () => {
    if (!editingZone || !zoneForm.name.trim()) return;
    updateZoneMutation.mutate({
      id: editingZone.id,
      name: zoneForm.name.trim(),
      color: zoneForm.color,
      description: zoneForm.description.trim(),
    });
  };

  const handleDeleteZone = (zone: Zone) => {
    if (window.confirm(`Are you sure you want to delete zone "${zone.name}"?`)) {
      deleteZoneMutation.mutate(zone.id);
    }
  };

  const getZoneIndex = (zone: Zone) => {
    const sorted = [...zones].sort((a, b) => a.displayOrder - b.displayOrder);
    return sorted.findIndex((z) => z.id === zone.id) + 1;
  };

  return (
    <div className="space-y-6">
      <GlassCard>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Map className="h-5 w-5 text-primary" />
            <div>
              <h3 className="text-lg font-semibold">Evacuation Zones</h3>
              <p className="text-sm text-muted-foreground">
                Configure evacuation zones for emergency muster points
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="zones-toggle" className="text-sm">Enable Zones</Label>
            <Switch
              id="zones-toggle"
              checked={zonesEnabled}
              onCheckedChange={(checked) => toggleZonesMutation.mutate(checked)}
              disabled={toggleZonesMutation.isPending}
            />
          </div>
        </div>
      </GlassCard>

      {zonesEnabled && (
        <>
          <GlassCard>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Zones</h3>
                <Badge variant="secondary">{zones.length} zones</Badge>
              </div>
              <Button onClick={openAddDialog} size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> Add Zone
              </Button>
            </div>

            {zones.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MapPin className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No zones configured yet</p>
                <p className="text-sm">Add zones to define evacuation areas</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[...zones]
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                  .map((zone) => (
                    <div
                      key={zone.id}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div
                          className="w-4 h-4 rounded-full shrink-0 border border-white/20"
                          style={{ backgroundColor: zone.color }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">{zone.name}</div>
                          {zone.description && (
                            <div className="text-xs text-muted-foreground truncate">
                              {zone.description}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditDialog(zone)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteZone(zone)}
                          disabled={deleteZoneMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Map className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Zone Map</h3>
              </div>
              <div className="flex items-center gap-2">
                {zoneMapUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => removeMapMutation.mutate()}
                    disabled={removeMapMutation.isPending}
                  >
                    <X className="h-4 w-4" /> Remove Map
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMapMutation.isPending}
                >
                  <Upload className="h-4 w-4" /> {zoneMapUrl ? "Replace Map" : "Upload Zone Map"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
            </div>

            {!zoneMapUrl ? (
              <div
                className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:bg-accent/30 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-muted-foreground">Click to upload a zone map image</p>
                <p className="text-sm text-muted-foreground mt-1">PNG, JPG, or SVG recommended</p>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedZoneForPlacement && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">
                      Click on the map to place: {zones.find((z) => z.id === selectedZoneForPlacement)?.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7"
                      onClick={() => setSelectedZoneForPlacement(null)}
                    >
                      <X className="h-4 w-4" /> Cancel
                    </Button>
                  </div>
                )}

                <div
                  ref={mapRef}
                  className="relative rounded-lg overflow-hidden border cursor-crosshair"
                  onClick={handleMapClick}
                  style={{ cursor: selectedZoneForPlacement ? "crosshair" : "default" }}
                >
                  <img
                    src={zoneMapUrl}
                    alt="Zone map"
                    className="w-full h-auto block"
                    draggable={false}
                  />
                  {zones.map((zone) => {
                    if (zone.mapX == null || zone.mapY == null) return null;
                    const idx = getZoneIndex(zone);
                    return (
                      <div
                        key={zone.id}
                        className="absolute flex items-center justify-center transform -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
                        style={{
                          left: `${zone.mapX}%`,
                          top: `${zone.mapY}%`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedZoneForPlacement(zone.id);
                        }}
                        title={`${zone.name} - Click to reposition`}
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg border-2 border-white ring-2 ring-black/20 group-hover:scale-110 transition-transform"
                          style={{ backgroundColor: zone.color }}
                        >
                          {idx}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {zones.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Place zones on map:</Label>
                    <div className="flex flex-wrap gap-2">
                      {[...zones]
                        .sort((a, b) => a.displayOrder - b.displayOrder)
                        .map((zone) => {
                          const idx = getZoneIndex(zone);
                          const isPlaced = zone.mapX != null && zone.mapY != null;
                          const isSelected = selectedZoneForPlacement === zone.id;
                          return (
                            <Button
                              key={zone.id}
                              variant={isSelected ? "default" : isPlaced ? "outline" : "secondary"}
                              size="sm"
                              className="gap-1.5 text-xs"
                              onClick={() =>
                                setSelectedZoneForPlacement(isSelected ? null : zone.id)
                              }
                            >
                              <div
                                className="w-3 h-3 rounded-full border border-white/30"
                                style={{ backgroundColor: zone.color }}
                              />
                              {idx}. {zone.name}
                              {isPlaced && !isSelected && (
                                <MapPin className="h-3 w-3 text-green-500" />
                              )}
                            </Button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </GlassCard>
        </>
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Zone</DialogTitle>
            <DialogDescription>Create a new evacuation zone</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="zone-name">Name *</Label>
              <Input
                id="zone-name"
                value={zoneForm.name}
                onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
                placeholder="e.g. Zone A - Main Building"
              />
            </div>
            <div>
              <Label>Color</Label>
              <ColorPickerPanel
                color={zoneForm.color}
                onChange={(c) => setZoneForm({ ...zoneForm, color: c })}
              />
            </div>
            <div>
              <Label htmlFor="zone-desc">Description</Label>
              <textarea
                id="zone-desc"
                value={zoneForm.description}
                onChange={(e) => setZoneForm({ ...zoneForm, description: e.target.value })}
                placeholder="Optional description for this zone"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateZone}
              disabled={createZoneMutation.isPending || !zoneForm.name.trim()}
              className="gap-1"
            >
              <Save className="h-4 w-4" />
              {createZoneMutation.isPending ? "Creating..." : "Create Zone"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Zone</DialogTitle>
            <DialogDescription>Update zone details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-zone-name">Name *</Label>
              <Input
                id="edit-zone-name"
                value={zoneForm.name}
                onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
                placeholder="e.g. Zone A - Main Building"
              />
            </div>
            <div>
              <Label>Color</Label>
              <ColorPickerPanel
                color={zoneForm.color}
                onChange={(c) => setZoneForm({ ...zoneForm, color: c })}
              />
            </div>
            <div>
              <Label htmlFor="edit-zone-desc">Description</Label>
              <textarea
                id="edit-zone-desc"
                value={zoneForm.description}
                onChange={(e) => setZoneForm({ ...zoneForm, description: e.target.value })}
                placeholder="Optional description for this zone"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateZone}
              disabled={updateZoneMutation.isPending || !zoneForm.name.trim()}
              className="gap-1"
            >
              <Save className="h-4 w-4" />
              {updateZoneMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
