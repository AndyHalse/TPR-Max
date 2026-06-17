export interface ChecklistItem {
  section: string;
  description: string;
  isRequired: boolean;
  order: number;
}

export const PTW_CHECKLISTS: Record<string, ChecklistItem[]> = {
  hot_works: [
    { section: 'Area Preparation', description: 'All flammable/combustible materials removed or protected', isRequired: true, order: 1 },
    { section: 'Area Preparation', description: 'Fire-resistant screens/blankets in position', isRequired: true, order: 2 },
    { section: 'Area Preparation', description: 'Area clear of gas cylinders and compressed gas', isRequired: true, order: 3 },
    { section: 'Area Preparation', description: 'Floor swept clear of debris', isRequired: true, order: 4 },
    { section: 'Area Preparation', description: 'Hot works area inspected and approved', isRequired: true, order: 5 },
    { section: 'Fire Precautions', description: 'Fire extinguisher present and appropriate type (CO₂ or dry powder)', isRequired: true, order: 6 },
    { section: 'Fire Precautions', description: 'Fire alarm system in this area isolated (if required)', isRequired: false, order: 7 },
    { section: 'Fire Precautions', description: 'Hot works fire watcher assigned and briefed (1-hour post-work watch)', isRequired: true, order: 8 },
    { section: 'Fire Precautions', description: 'Nearest fire point identified and accessible', isRequired: true, order: 9 },
    { section: 'PPE', description: 'Welding/grinding PPE available (face shield, gloves, apron)', isRequired: true, order: 10 },
    { section: 'PPE', description: 'Respiratory protection available if required', isRequired: false, order: 11 },
    { section: 'Authorisation', description: 'RAMS for hot works reviewed and accepted', isRequired: true, order: 12 },
    { section: 'Authorisation', description: 'Operative has relevant hot works training/qualification', isRequired: true, order: 13 },
    { section: 'Authorisation', description: 'Operational area evacuated or sealed off', isRequired: true, order: 14 },
  ],
  working_at_height: [
    { section: 'Equipment', description: 'Access equipment inspected and fit for purpose', isRequired: true, order: 1 },
    { section: 'Equipment', description: 'Scaffold or MEWP has current inspection certificate (LOLER)', isRequired: true, order: 2 },
    { section: 'Equipment', description: 'Harness and lanyard inspected (if required)', isRequired: false, order: 3 },
    { section: 'Equipment', description: 'Ladder secured at top and/or footed', isRequired: false, order: 4 },
    { section: 'Area', description: 'Exclusion zone established below work area', isRequired: true, order: 5 },
    { section: 'Area', description: 'Signage in place warning of overhead work', isRequired: true, order: 6 },
    { section: 'Area', description: 'Tools secured to prevent falling objects (tethers)', isRequired: true, order: 7 },
    { section: 'PPE', description: 'Hard hats for those below', isRequired: true, order: 8 },
    { section: 'PPE', description: 'Safety harness fitted and anchored (at 2m+)', isRequired: true, order: 9 },
    { section: 'Authorisation', description: 'Operative holds valid working at height training', isRequired: true, order: 10 },
    { section: 'Authorisation', description: 'MEWP operator has valid IPAF licence (if MEWP in use)', isRequired: false, order: 11 },
    { section: 'Authorisation', description: 'Weather conditions assessed and acceptable', isRequired: true, order: 12 },
  ],
  electrical_isolation: [
    { section: 'Isolation & Lockout', description: 'Circuit identified and confirmed isolated at source', isRequired: true, order: 1 },
    { section: 'Isolation & Lockout', description: 'Isolation point locked off (lock and tag applied)', isRequired: true, order: 2 },
    { section: 'Isolation & Lockout', description: 'Voltage absence verified with approved test equipment', isRequired: true, order: 3 },
    { section: 'Isolation & Lockout', description: 'All phases confirmed dead', isRequired: true, order: 4 },
    { section: 'Isolation & Lockout', description: 'Capacitors discharged (if applicable)', isRequired: false, order: 5 },
    { section: 'Safe System', description: 'Danger notices affixed at isolation point', isRequired: true, order: 6 },
    { section: 'Safe System', description: 'Other personnel informed of isolation', isRequired: true, order: 7 },
    { section: 'Safe System', description: 'Permit to work displayed at the work location', isRequired: true, order: 8 },
    { section: 'Authorisation', description: 'Operative is a Qualified Electrical Person (QEP)', isRequired: true, order: 9 },
    { section: 'Authorisation', description: 'Relevant drawings / diagrams available', isRequired: false, order: 10 },
  ],
  confined_space: [
    { section: 'Atmospheric Testing', description: 'Oxygen level tested: 19.5% - 23.5% (PASS/FAIL)', isRequired: true, order: 1 },
    { section: 'Atmospheric Testing', description: 'Flammable gas/vapour tested: <10% LEL (PASS/FAIL)', isRequired: true, order: 2 },
    { section: 'Atmospheric Testing', description: 'Toxic gas tested (CO, H₂S etc.): Below exposure limits (PASS/FAIL)', isRequired: true, order: 3 },
    { section: 'Atmospheric Testing', description: 'Continuous gas monitoring in place during work', isRequired: true, order: 4 },
    { section: 'Emergency Arrangements', description: 'Rescue plan documented and communicated', isRequired: true, order: 5 },
    { section: 'Emergency Arrangements', description: 'Rescue equipment on site (harness, winch, BA sets)', isRequired: true, order: 6 },
    { section: 'Emergency Arrangements', description: 'Rescue team identified and briefed', isRequired: true, order: 7 },
    { section: 'Emergency Arrangements', description: 'Emergency services number confirmed and accessible', isRequired: true, order: 8 },
    { section: 'Emergency Arrangements', description: 'Attendant stationed outside at all times', isRequired: true, order: 9 },
    { section: 'Entry Controls', description: 'Entry register being maintained', isRequired: true, order: 10 },
    { section: 'Entry Controls', description: 'Communication system between entrant and attendant confirmed', isRequired: true, order: 11 },
    { section: 'Entry Controls', description: 'Entrant briefed on entry and emergency procedures', isRequired: true, order: 12 },
    { section: 'Authorisation', description: 'Confined space risk assessment completed', isRequired: true, order: 13 },
    { section: 'Authorisation', description: 'Entrant has confined space training certificate', isRequired: true, order: 14 },
  ],
  excavation: [
    { section: 'Area & Services', description: 'Underground services located and marked (CAT & Genny)', isRequired: true, order: 1 },
    { section: 'Area & Services', description: 'Permits obtained for road closures / footway crossings (if applicable)', isRequired: false, order: 2 },
    { section: 'Area & Services', description: 'Exclusion zone established around excavation', isRequired: true, order: 3 },
    { section: 'Shoring & Support', description: 'Excavation sides shored / battered / benched as required', isRequired: true, order: 4 },
    { section: 'Shoring & Support', description: 'Trench boxes or other support systems in place', isRequired: false, order: 5 },
    { section: 'Access & Egress', description: 'Safe access / egress ladder in place at no greater than 6m intervals', isRequired: true, order: 6 },
    { section: 'PPE', description: 'Hard hats, hi-vis, steel toecaps and safety glasses worn', isRequired: true, order: 7 },
    { section: 'Authorisation', description: 'Ground conditions assessed and safe to proceed', isRequired: true, order: 8 },
    { section: 'Authorisation', description: 'Daily inspection regime in place', isRequired: true, order: 9 },
  ],
  asbestos: [
    { section: 'Asbestos Survey', description: 'Asbestos Management Survey reviewed — no ACM in work area', isRequired: true, order: 1 },
    { section: 'Asbestos Survey', description: 'Refurbishment/Demolition Survey completed (if intrusive work)', isRequired: true, order: 2 },
    { section: 'Controls', description: 'Licensed contractor appointed (if licensable work)', isRequired: false, order: 3 },
    { section: 'Controls', description: 'HSE notified of licensable work (if applicable)', isRequired: false, order: 4 },
    { section: 'Controls', description: 'Enclosure and decontamination unit in place', isRequired: false, order: 5 },
    { section: 'PPE', description: 'RPE (FFP3 minimum) available and face-fit tested', isRequired: true, order: 6 },
    { section: 'PPE', description: 'Disposable coveralls (Type 5/6) available', isRequired: true, order: 7 },
    { section: 'Authorisation', description: 'Operative holds UKATA or equivalent asbestos awareness certificate', isRequired: true, order: 8 },
    { section: 'Authorisation', description: 'Waste disposal arrangements confirmed (licensed carrier)', isRequired: true, order: 9 },
  ],
  general_high_risk: [
    { section: 'Risk Assessment', description: 'Task-specific risk assessment completed and reviewed', isRequired: true, order: 1 },
    { section: 'Risk Assessment', description: 'Method statement reviewed and agreed', isRequired: true, order: 2 },
    { section: 'Controls', description: 'All significant hazards identified and controls in place', isRequired: true, order: 3 },
    { section: 'Controls', description: 'Emergency procedures communicated to all operatives', isRequired: true, order: 4 },
    { section: 'PPE', description: 'Appropriate PPE identified and available', isRequired: true, order: 5 },
    { section: 'Authorisation', description: 'Operative competent and authorised for this work', isRequired: true, order: 6 },
    { section: 'Authorisation', description: 'Supervisor / responsible person on site', isRequired: true, order: 7 },
  ],
};

export const PERMIT_TYPE_LABELS: Record<string, string> = {
  hot_works: 'Hot Works',
  working_at_height: 'Working at Height',
  electrical_isolation: 'Electrical Isolation',
  confined_space: 'Confined Space',
  excavation: 'Excavation',
  asbestos: 'Asbestos',
  general_high_risk: 'General High Risk',
};

// Single source of truth for company compliance document type labels.
// Keys must match the stored document_type values in ptw_company_documents.
export const PTW_COMPANY_DOC_LABELS: Record<string, string> = {
  public_liability_insurance:    'Public Liability Insurance (PLI)',
  employers_liability_insurance: "Employers' Liability Insurance (ELI)",
  health_safety_policy:          'Health & Safety Policy',
};
