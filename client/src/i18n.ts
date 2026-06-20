import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./locales/en/common.json";
import enDashboard from "./locales/en/dashboard.json";
import enVisitors from "./locales/en/visitors.json";
import enContractors from "./locales/en/contractors.json";
import enStaff from "./locales/en/staff.json";
import enMuster from "./locales/en/muster.json";

import esCommon from "./locales/es/common.json";
import esDashboard from "./locales/es/dashboard.json";
import esVisitors from "./locales/es/visitors.json";
import esContractors from "./locales/es/contractors.json";
import esStaff from "./locales/es/staff.json";
import esMuster from "./locales/es/muster.json";

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
      },
      es: {
        common: esCommon,
        dashboard: esDashboard,
        visitors: esVisitors,
        contractors: esContractors,
        staff: esStaff,
        muster: esMuster,
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
