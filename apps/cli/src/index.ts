import { PACKAGE_NAME as corePackageName } from "@summer-sum/core";

export function cliPackageName(): string {
  return "@summer-sum/cli";
}

export function linkedCorePackageName(): string {
  return corePackageName;
}
