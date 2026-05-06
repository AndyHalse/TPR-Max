import GlassCard from "@/components/GlassCard";
import { Shield } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSettingsAutoSave } from "@/hooks/useSettingsAutoSave";

export default function LoneWorkerSettings() {
  const { currentSettings, triggerAutoSave } = useSettingsAutoSave();

  return (
    <div className="space-y-6">
      <GlassCard>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <Shield className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-fixed">Lone Worker Protection</h3>
            <p className="text-sm text-variable">Automated welfare checks for staff and contractors working alone</p>
          </div>
        </div>
        <div className="space-y-6">
          {/* Enable toggle */}
          <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
            <div>
              <p className="font-medium text-fixed">Enable Lone Worker Protection</p>
              <p className="text-sm text-variable mt-0.5">Allow supervisors to activate welfare check monitoring for individuals</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={currentSettings?.loneWorkerEnabled ?? false}
              onClick={() => triggerAutoSave('loneWorkerEnabled', !(currentSettings?.loneWorkerEnabled ?? false))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                currentSettings?.loneWorkerEnabled ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${currentSettings?.loneWorkerEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Check interval */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-fixed">Check-in Interval (minutes)</label>
              <p className="text-xs text-variable">How often a welfare check email is sent</p>
              <Select
                value={String(currentSettings?.loneWorkerCheckIntervalMins ?? 30)}
                onValueChange={(v) => triggerAutoSave('loneWorkerCheckIntervalMins', parseInt(v))}
              >
                <SelectTrigger className="w-full h-10 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-fixed text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[15, 30, 45, 60, 90, 120].map((mins) => (
                    <SelectItem key={mins} value={String(mins)}>{mins} minutes</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Grace period */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-fixed">Grace Period (minutes)</label>
              <p className="text-xs text-variable">Extra time before escalation begins if no response</p>
              <input
                type="number"
                min={1}
                max={60}
                value={currentSettings?.loneWorkerGracePeriodMins ?? 10}
                onChange={(e) => triggerAutoSave('loneWorkerGracePeriodMins', parseInt(e.target.value) || 10)}
                className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-fixed text-sm"
              />
            </div>
          </div>
          {/* Escalation contacts */}
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-fixed mb-1">Level 1 Escalation (Immediate)</h4>
              <p className="text-xs text-variable mb-3">First escalation contact — usually line manager or security desk</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-variable">Name</label>
                  <input type="text" value={currentSettings?.loneWorkerL1Name ?? ''} onChange={(e) => triggerAutoSave('loneWorkerL1Name', e.target.value)} placeholder="e.g. John Smith" className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-fixed text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-variable">Email</label>
                  <input type="email" value={currentSettings?.loneWorkerL1Email ?? ''} onChange={(e) => triggerAutoSave('loneWorkerL1Email', e.target.value)} placeholder="manager@company.com" className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-fixed text-sm" />
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-fixed mb-1">Level 2 Escalation</h4>
              <p className="text-xs text-variable mb-3">Second escalation contact if level 1 doesn't resolve — usually HR or senior manager</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-variable">Name</label>
                  <input type="text" value={currentSettings?.loneWorkerL2Name ?? ''} onChange={(e) => triggerAutoSave('loneWorkerL2Name', e.target.value)} placeholder="e.g. Jane Doe" className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-fixed text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-variable">Email</label>
                  <input type="email" value={currentSettings?.loneWorkerL2Email ?? ''} onChange={(e) => triggerAutoSave('loneWorkerL2Email', e.target.value)} placeholder="hr@company.com" className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-fixed text-sm" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-variable">L2 Escalation delay (minutes after L1)</label>
                <input type="number" min={5} max={120} value={currentSettings?.loneWorkerL2DelayMins ?? 15} onChange={(e) => triggerAutoSave('loneWorkerL2DelayMins', parseInt(e.target.value) || 15)} className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-fixed text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-variable">L3 Escalation delay (minutes after L2)</label>
                <input type="number" min={5} max={120} value={currentSettings?.loneWorkerL3DelayMins ?? 30} onChange={(e) => triggerAutoSave('loneWorkerL3DelayMins', parseInt(e.target.value) || 30)} className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-fixed text-sm" />
              </div>
            </div>
          </div>
          {/* Info box */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
            <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">How it works</h4>
            <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
              <li>Activate lone worker mode for any staff member or contractor from their row in the management pages</li>
              <li>A welfare check email with an "I'm OK" link is sent at the configured interval</li>
              <li>If the worker does not click the link within the interval + grace period, escalation emails are sent (3 levels)</li>
              <li>The session continues until a supervisor clicks "End Session" or the worker's shift ends</li>
              <li>All sessions are logged in the Reports page under Lone Worker Sessions</li>
            </ul>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
