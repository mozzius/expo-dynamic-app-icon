import ExpoDynamicAppIconModule from "./ExpoDynamicAppIconModule";
import { DynamicAppIconRegistry } from "./types";

export type IconName = DynamicAppIconRegistry["IconName"];

export function setAppIcon(
  name: IconName | null
): IconName | "DEFAULT" | false {
  return ExpoDynamicAppIconModule.setAppIcon(name);
}

export function getAppIcon(): IconName | "DEFAULT" {
  return ExpoDynamicAppIconModule.getAppIcon();
}
