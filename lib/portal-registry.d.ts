export type PortalAction = { key: string; label: string };
export type PortalApp = {
  key: string;
  icon: string;
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  companies: string[];
  actions: PortalAction[];
};
export type PortalCompany = { key: string; label: string };
export type PortalProfile = {
  key: string;
  label: string;
  description: string;
  defaultApps: string[];
  defaultCompanies: string[];
  defaultActions: string[];
};
export const APP_REGISTRY: PortalApp[];
export const COMPANY_REGISTRY: PortalCompany[];
export const PROFILE_REGISTRY: PortalProfile[];
export const APP_KEYS: string[];
export const COMPANY_KEYS: string[];
export const ACTION_KEYS: string[];
export const PROFILES: string[];
