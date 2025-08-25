"use client"

import i18next from "i18next";

import en from "@/locales/en.json";
import zh from "@/locales/zh.json";

import React, { createContext, useEffect, useState } from "react";

export const languages = { en, zh };

const resources = Object.fromEntries(
  Object.entries(languages).map(([key, value]) => [
    key,
    { translation: value },
  ]),
);

i18next.init({
  lng: "en",
  fallbackLng: "en",
  resources,
});

export const I18nContext = createContext({ lang: i18next.language });

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(i18next.language);

  useEffect(() => {
    const handleChange = (lng) => setLang(lng);
    i18next.on("languageChanged", handleChange);
    return () => {
      i18next.off("languageChanged", handleChange);
    };
  }, []);

  return (
    <I18nContext.Provider value={{ lang }}>
      {children}
    </I18nContext.Provider>
  );
}