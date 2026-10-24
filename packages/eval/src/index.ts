export * from "./fixtures";
export * from "./metrics";
export * from "./deterministic";
export * from "./report";
export * from "./definitions";
export * from "./seed";
export * from "./mock-llm";

import heldoutFirstRunJson from "../results/heldout-first-run.json";
import type { EvalReport } from "./deterministic";

/** The frozen first run of the held-out set (see fixtures/heldout/FROZEN.sha256). */
export const HELDOUT_FIRST_RUN = heldoutFirstRunJson as unknown as EvalReport;
