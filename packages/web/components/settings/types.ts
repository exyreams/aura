export type NoticeTone = "success" | "danger";

export type StatusTone = "neutral" | "success" | "warning" | "danger";

export type SessionAction = "local" | "others" | "global";

export type SettingsSectionId =
  | "profile"
  | "security"
  | "privacy"
  | "wallets"
  | "conduit"
  | "runtime";

export interface RuntimeSettingRow {
  label: string;
  value: string;
  detail: string;
}
