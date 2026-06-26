import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./locales/en/common.json";
import enDashboard from "./locales/en/dashboard.json";
import enVisitors from "./locales/en/visitors.json";
import enContractors from "./locales/en/contractors.json";
import enStaff from "./locales/en/staff.json";
import enMuster from "./locales/en/muster.json";
import enKiosk from "./locales/en/kiosk.json";
import enMembers from "./locales/en/members.json";
import enInductionSettings from "./locales/en/inductionSettings.json";
import enIncidentReports from "./locales/en/incidentReports.json";
import enPpm from "./locales/en/ppm.json";
import enMeetingRooms from "./locales/en/meetingRooms.json";
import enReports from "./locales/en/reports.json";
import enSettingsPage from "./locales/en/settingsPage.json";

import esCommon from "./locales/es/common.json";
import esDashboard from "./locales/es/dashboard.json";
import esVisitors from "./locales/es/visitors.json";
import esContractors from "./locales/es/contractors.json";
import esStaff from "./locales/es/staff.json";
import esMuster from "./locales/es/muster.json";
import esKiosk from "./locales/es/kiosk.json";
import esMembers from "./locales/es/members.json";
import esInductionSettings from "./locales/es/inductionSettings.json";
import esIncidentReports from "./locales/es/incidentReports.json";
import esPpm from "./locales/es/ppm.json";
import esMeetingRooms from "./locales/es/meetingRooms.json";
import esReports from "./locales/es/reports.json";
import esSettingsPage from "./locales/es/settingsPage.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        dashboard: enDashboard,
        visitors: enVisitors,
        contractors: enContractors,
        staff: enStaff,
        muster: enMuster,
        kiosk: enKiosk,
        members: enMembers,
        inductionSettings: enInductionSettings,
        incidentReports: enIncidentReports,
        ppm: enPpm,
        meetingRooms: enMeetingRooms,
        reports: enReports,
        settingsPage: enSettingsPage,
      },
      es: {
        common: esCommon,
        dashboard: esDashboard,
        visitors: esVisitors,
        contractors: esContractors,
        staff: esStaff,
        muster: esMuster,
        kiosk: esKiosk,
        members: esMembers,
        inductionSettings: esInductionSettings,
        incidentReports: esIncidentReports,
        ppm: esPpm,
        meetingRooms: esMeetingRooms,
        reports: esReports,
        settingsPage: esSettingsPage,
      },
    },
    fallbackLng: "en",
    defaultNS: "common",
    detection: {
      order: ["localStorage"],
      lookupLocalStorage: "language",
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
