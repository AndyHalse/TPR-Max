import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CheckCircle2, AlertTriangle, MapPin, Shield, Clock, Loader2, QrCode, Camera, X, ImageIcon,
} from "lucide-react";

interface CheckpointData {
  id: string;
  label: string;
  content: string;
  imageUrl?: string | null;
  orderIndex: number;
  isActive: boolean;
}

const HAZARD_TYPES = [
  { value: "slip_trip_fall", label: "Slip, trip or fall" },
  { value: "struck_by_object", label: "Struck by object" },
  { value: "manual_handling", label: "Manual handling" },
  { value: "vehicle_plant", label: "Vehicle or plant" },
  { value: "working_at_height", label: "Working at height" },
  { value: "electrical", label: "Electrical" },
  { value: "fire_explosion", label: "Fire or explosion" },
  { value: "chemical_substance", label: "Chemical or substance" },
  { value: "machinery", label: "Machinery" },
  { value: "other", label: "Other" },
];

export default function InductionCheckpoint() {
  const [match, params] = useRoute("/induction/checkpoint/:qrToken");
  const [, navigate] = useLocation();

  const [loading, setLoading] = useState(true);
  const [checkpoint, setCheckpoint] = useState<CheckpointData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inductionToken, setInductionToken] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [alreadyScanned, setAlreadyScanned] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [allowHazardReport, setAllowHazardReport] = useState(true);

  // Hazard report state
  const [showHazardForm, setShowHazardForm] = useState(false);
  const [hazardForm, setHazardForm] = useState({ description: "", hazardType: "", reporterName: "" });
  const [hazardPhoto, setHazardPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submittingHazard, setSubmittingHazard] = useState(false);
  const [hazardSubmitted, setHazardSubmitted] = useState(false);
  const [hazardError, setHazardError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const qrToken = params?.qrToken || "";

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const t = urlParams.get("t");
    if (t) setInductionToken(t);
  }, []);

  useEffect(() => {
    if (!qrToken) return;
    setLoading(true);
    fetch(`/api/induction/checkpoint/${qrToken}`)
      .then(r => {
        if (!r.ok) throw new Error(r.status === 404 ? "Checkpoint not found" : "Failed to load checkpoint");
        return r.json();
      })
      .then(data => {
        setCheckpoint(data.checkpoint);
        setCompanyName(data.companyName || null);
        setAllowHazardReport(data.allowHazardReport !== false);
      })
      .catch(err => setError(err.message || "Could not load this checkpoint"))
      .finally(() => setLoading(false));
  }, [qrToken]);

  const handleScan = async () => {
    if (!inductionToken.trim() || !qrToken) return;
    setScanning(true);
    try {
      const r = await fetch(`/api/induction/checkpoint/${qrToken}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inductionTokenId: inductionToken.trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to record scan");
      setScanned(true);
      setAlreadyScanned(data.alreadyScanned || false);
    } catch (err: any) {
      setError(err.message || "Scan failed. Please try again.");
    } finally {
      setScanning(false);
    }
  };

  const handlePhotoSelect = (file: File) => {
    const preview = URL.createObjectURL(file);
    setHazardPhoto({ file, preview });
  };

  const handleRemovePhoto = () => {
    if (hazardPhoto) URL.revokeObjectURL(hazardPhoto.preview);
    setHazardPhoto(null);
  };

  const handleSubmitHazard = async () => {
    if (!hazardForm.description.trim()) {
      setHazardError("Please describe the hazard.");
      return;
    }
    setSubmittingHazard(true);
    setHazardError(null);
    try {
      let photoUrl: string | null = null;

      if (hazardPhoto) {
        setUploadingPhoto(true);
        const fd = new FormData();
        fd.append("photo", hazardPhoto.file);
        const uploadRes = await fetch("/api/induction/checkpoint/hazard-photo", {
          method: "POST",
          body: fd,
        });
        if (!uploadRes.ok) throw new Error("Photo upload failed");
        const uploadData = await uploadRes.json();
        photoUrl = uploadData.url;
        setUploadingPhoto(false);
      }

      const res = await fetch(`/api/induction/checkpoint/${qrToken}/report-hazard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: hazardForm.description.trim(),
          hazardType: hazardForm.hazardType || null,
          reporterName: hazardForm.reporterName.trim() || null,
          location: checkpoint?.label || null,
          photoUrl,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to submit hazard report");
      }
      setHazardSubmitted(true);
      setShowHazardForm(false);
    } catch (err: any) {
      setHazardError(err.message || "Failed to submit. Please try again.");
      setUploadingPhoto(false);
    } finally {
      setSubmittingHazard(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-gray-600 text-sm">Loading checkpoint…</p>
        </div>
      </div>
    );
  }

  if (error && !checkpoint) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-red-200">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-red-900 mb-2">Checkpoint Not Found</h2>
            <p className="text-red-700 text-sm">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!checkpoint) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b shadow-sm px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
          <Shield className="w-5 h-5 text-blue-700" />
        </div>
        <div>
          {companyName && <p className="font-bold text-gray-900 text-sm leading-tight">{companyName}</p>}
          <p className="text-xs text-gray-500 leading-tight">Site Walk-around Checkpoint</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center p-4 pt-6">
        <div className="w-full max-w-md space-y-4">

          {/* Checkpoint info card */}
          <Card className={`border-2 ${scanned ? "border-green-300 bg-green-50/60" : "border-blue-200"}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 mb-1">
                <QrCode className="w-5 h-5 text-blue-600" />
                <Badge variant="outline" className="text-xs text-blue-700 border-blue-300">
                  Checkpoint {checkpoint.orderIndex + 1}
                </Badge>
              </div>
              <CardTitle className="text-xl">{checkpoint.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {checkpoint.imageUrl && (
                <img
                  src={`/objects${checkpoint.imageUrl}`}
                  alt={checkpoint.label}
                  className="w-full rounded-lg object-cover max-h-56"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              )}

              {checkpoint.content && (
                <div className="bg-white rounded-lg border p-4">
                  <p className="text-sm text-gray-800 leading-relaxed">{checkpoint.content}</p>
                </div>
              )}

              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Take a moment to familiarise yourself with this area before proceeding.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Scan confirmation */}
          {scanned ? (
            <Card className="border-green-300 bg-green-50">
              <CardContent className="p-6 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-green-900 mb-1">
                  {alreadyScanned ? "Already Recorded" : "Checkpoint Confirmed!"}
                </h3>
                <p className="text-sm text-green-700">
                  {alreadyScanned
                    ? "You have already scanned this checkpoint. Your visit was previously recorded."
                    : `Your visit to "${checkpoint.label}" has been recorded against your induction.`}
                </p>
                <p className="text-xs text-green-600 mt-3">
                  You can now proceed to the next checkpoint.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-5 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-1">Confirm Your Visit</p>
                  <p className="text-xs text-gray-600">
                    Enter your induction reference to log that you've visited this checkpoint.
                  </p>
                </div>

                {!inductionToken && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-gray-700">
                      Induction Reference Code
                    </Label>
                    <Input
                      value={inductionToken}
                      onChange={(e) => setInductionToken(e.target.value)}
                      placeholder="Paste your induction code here"
                      className="text-sm"
                    />
                    <p className="text-xs text-gray-500">
                      This is the code from your induction link email. Tip: open your induction from the email first, then return to this page.
                    </p>
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-xs text-red-700 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      {error}
                    </p>
                  </div>
                )}

                {inductionToken && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                    <p className="text-xs text-blue-800">Induction token linked — ready to confirm.</p>
                  </div>
                )}

                <Button
                  className="w-full"
                  disabled={!inductionToken.trim() || scanning}
                  onClick={handleScan}
                >
                  {scanning ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Recording…</>
                  ) : (
                    <><MapPin className="w-4 h-4 mr-2" />Confirm I've Visited This Checkpoint</>
                  )}
                </Button>

                {inductionToken && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-gray-500"
                    onClick={() => {
                      const base = window.location.pathname;
                      window.history.pushState({}, "", base);
                      setInductionToken("");
                    }}
                  >
                    Clear token (use a different code)
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Hazard Report Section ── */}
          {allowHazardReport && (
            <div>
              {hazardSubmitted ? (
                <Card className="border-green-300 bg-green-50">
                  <CardContent className="p-5 text-center">
                    <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-green-900">Hazard reported — thank you!</p>
                    <p className="text-xs text-green-700 mt-1">Your report has been sent to the site safety team for review.</p>
                  </CardContent>
                </Card>
              ) : showHazardForm ? (
                <Card className="border-orange-200">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-orange-500" />
                        Report a Hazard
                      </CardTitle>
                      <button onClick={() => { setShowHazardForm(false); setHazardError(null); }} className="text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Spotted something unsafe? Let the safety team know.</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-gray-700">Describe the hazard <span className="text-red-500">*</span></Label>
                      <Textarea
                        value={hazardForm.description}
                        onChange={e => setHazardForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="e.g. Wet floor near the emergency exit — no warning sign in place"
                        rows={3}
                        className="text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-gray-700">Hazard type (optional)</Label>
                      <Select value={hazardForm.hazardType} onValueChange={v => setHazardForm(f => ({ ...f, hazardType: v }))}>
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Select type…" />
                        </SelectTrigger>
                        <SelectContent>
                          {HAZARD_TYPES.map(h => (
                            <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-gray-700">Your name (optional)</Label>
                      <Input
                        value={hazardForm.reporterName}
                        onChange={e => setHazardForm(f => ({ ...f, reporterName: e.target.value }))}
                        placeholder="So the team can follow up with you"
                        className="text-sm"
                      />
                    </div>

                    {/* Photo upload */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-gray-700">Photo evidence (optional)</Label>
                      {hazardPhoto ? (
                        <div className="relative">
                          <img
                            src={hazardPhoto.preview}
                            alt="Hazard photo preview"
                            className="w-full max-h-48 object-cover rounded-lg border"
                          />
                          <button
                            type="button"
                            onClick={handleRemovePhoto}
                            className="absolute top-2 right-2 w-7 h-7 bg-white rounded-full shadow flex items-center justify-center text-gray-600 hover:text-red-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => photoInputRef.current?.click()}
                          className="w-full flex flex-col items-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-orange-400 hover:text-orange-600 transition-colors"
                        >
                          <Camera className="w-6 h-6" />
                          <span className="text-xs">Tap to take a photo or choose from gallery</span>
                        </button>
                      )}
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoSelect(f); e.target.value = ""; }}
                      />
                    </div>

                    {hazardError && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-xs text-red-700">{hazardError}</p>
                      </div>
                    )}

                    <Button
                      className="w-full bg-orange-600 hover:bg-orange-700"
                      disabled={submittingHazard || !hazardForm.description.trim()}
                      onClick={handleSubmitHazard}
                    >
                      {submittingHazard ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{uploadingPhoto ? "Uploading photo…" : "Submitting…"}</>
                      ) : (
                        <><AlertTriangle className="w-4 h-4 mr-2" />Submit Hazard Report</>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-gray-200 bg-gray-50">
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-600 mb-3 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      Noticed something unsafe in this area? Report it so it can be dealt with.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-orange-300 text-orange-700 hover:bg-orange-50"
                      onClick={() => setShowHazardForm(true)}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 mr-2" />
                      Report a Hazard
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <p className="text-center text-xs text-gray-400 pb-4">
            TPR Site Induction System · Powered by TPR Visitor Management
          </p>
        </div>
      </div>
    </div>
  );
}
