"use client";

import { useEffect } from "react";
import { hasEditFlag } from "./edit-state.js";

export type StilusLoaderProps = { apiBase?: string };

/**
 * Put once in the root layout. Renders nothing. When the readable `stilus_edit=1` flag is set,
 * it downloads the editor overlay with a dynamic import; anonymous visitors download nothing else.
 * The cookie is read in the browser only, so public pages stay static.
 */
export function StilusLoader({ apiBase }: StilusLoaderProps) {
  useEffect(() => {
    if (!hasEditFlag(document.cookie)) return;
    void import("./overlay.js").then(({ mountOverlay }) =>
      mountOverlay(apiBase ? { apiBase } : {}),
    );
  }, [apiBase]);
  return null;
}
