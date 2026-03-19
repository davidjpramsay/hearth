import type { ModuleServerAdapter } from "../types.js";
import { koboReaderAdapter } from "./kobo-reader.js";
import { serverStatusAdapter } from "./server-status.js";

export const defaultModuleAdapters: ModuleServerAdapter[] = [
  koboReaderAdapter,
  serverStatusAdapter,
];
