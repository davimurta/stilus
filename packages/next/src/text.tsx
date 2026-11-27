import {
  Fragment,
  createElement,
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactNode,
} from "react";
import { t } from "./server.js";

type TextOwnProps<T extends ElementType> = {
  /** Text key, e.g. `home.hero.title`. */
  k: string;
  /** Default text, rendered when the API has no value or is unavailable. */
  children: string;
  /** Element to render. Defaults to `span`. */
  as?: T;
  /** Shown to editors; read by the CLI. Not rendered. */
  description?: string;
  /** Allows line breaks (rendered as <br>). Read by the CLI. Not rendered. */
  multiline?: boolean;
};

export type TextProps<T extends ElementType = "span"> = TextOwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof TextOwnProps<T> | "dangerouslySetInnerHTML">;

/** Line breaks of multiline texts become <br> elements; the text itself stays plain. */
function withLineBreaks(value: string): ReactNode {
  if (!value.includes("\n")) return value;
  return value
    .split("\n")
    .map((line, index) =>
      createElement(Fragment, { key: index }, index > 0 ? createElement("br") : null, line),
    );
}

/**
 * Editable text. Renders `<as data-stilus-key="k">value</as>` on the server.
 * The value is passed as a React child, so it is always escaped (plain text only).
 */
export async function Text<T extends ElementType = "span">({
  k,
  children,
  as,
  // Removed so they never reach the DOM.
  description,
  multiline,
  ...rest
}: TextProps<T>) {
  const value = await t(k, children);
  // Also stripped at runtime: the value must never be interpreted as HTML.
  const { dangerouslySetInnerHTML, ...safeProps } = rest as Record<string, unknown>;
  return createElement(as ?? "span", { ...safeProps, "data-stilus-key": k }, withLineBreaks(value));
}
