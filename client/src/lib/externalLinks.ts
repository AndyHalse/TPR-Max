export const EXTERNAL_LINKS = {
  riddor: {
    report: {
      url: "https://www.hse.gov.uk/riddor/report.htm",
      label: "Report to HSE (RIDDOR)",
    },
    guidance: {
      url: "https://www.hse.gov.uk/riddor/",
      label: "HSE RIDDOR guidance",
    },
    contactCentre: {
      phone: "0345 300 9923",
      hours: "Mon–Fri 8:30am–5pm",
    },
  },
  fire: {
    govUkFireSafety: {
      url: "https://www.gov.uk/fire-safety-law",
      label: "GOV.UK — Fire Safety Law",
    },
    hseFireGuidance: {
      url: "https://www.gov.uk/workplace-fire-safety-your-responsibilities/fire-risk-assessments",
      label: "GOV.UK — Fire Risk Assessment guidance",
    },
    nfcc: {
      url: "https://nfcc.org.uk/",
      label: "NFCC competent assessor guidance",
    },
  },
} as const;
