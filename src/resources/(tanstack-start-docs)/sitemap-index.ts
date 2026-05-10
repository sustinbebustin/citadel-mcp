import {
  TANSTACK_LIBS,
  buildIndexMetadata,
  createTanstackIndexHandler,
} from "../../_internal/tanstack-docs.js";

export const metadata = buildIndexMetadata(TANSTACK_LIBS.start);
export const handler = createTanstackIndexHandler(TANSTACK_LIBS.start);
