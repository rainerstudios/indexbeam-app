import { AppProvider } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
import enTranslations from "@shopify/polaris/locales/en.json";
import type { ReactNode } from "react";

interface PolarisProviderProps {
  children: ReactNode;
}

export function PolarisProvider({ children }: PolarisProviderProps) {
  return <AppProvider i18n={enTranslations}>{children}</AppProvider>;
}
