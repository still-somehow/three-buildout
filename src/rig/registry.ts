/**
 * All rig definitions. To add a rig (e.g. one built from a reference photo),
 * write src/rig/<name>.ts exporting a RigDef and register it here.
 */
import { humanoid } from "./humanoid";
import type { RigDef } from "./types";

export const RIGS: Record<string, RigDef> = {
  humanoid,
};
