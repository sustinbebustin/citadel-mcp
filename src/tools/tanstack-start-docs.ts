import {
  TANSTACK_LIBS,
  buildDocsToolMetadata,
  createTanstackDocsHandler,
  tanstackDocsInputSchema,
} from "../_internal/tanstack-docs.js";

export const inputSchema = tanstackDocsInputSchema;
export const metadata = buildDocsToolMetadata(TANSTACK_LIBS.start);
export const handler = createTanstackDocsHandler(TANSTACK_LIBS.start);
