import { DynamicAppIconRegistry } from "./types";

export type IconName = DynamicAppIconRegistry["IconName"];

export function setAppIcon(
  name: IconName | null
): IconName | "DEFAULT" | false {
  throw new Error("setAppIcon is not supported on web");
}

export function getAppIcon(): IconName | "DEFAULT" {
  throw new Error("getAppIcon is not supported on web");
}
