import { createElement, type ComponentPropsWithoutRef, type ElementType } from "react";
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
};

export type TextProps<T extends ElementType = "span"> = TextOwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof TextOwnProps<T> | "dangerouslySetInnerHTML">;

/**
 * Editable text. Renders `<as data-stilus-key="k">value</as>` on the server.
 * The value is passed as a React child, so it is always escaped (plain text only).
 */
export async function Text<T extends ElementType = "span">({
  k,
  children,
  as,
  // Removed so it never reaches the DOM.
  description,
  ...rest
}: TextProps<T>) {
  const value = await t(k, children);
  // Also stripped at runtime: the value must never be interpreted as HTML.
  const { dangerouslySetInnerHTML, ...safeProps } = rest as Record<string, unknown>;
  return createElement(as ?? "span", { ...safeProps, "data-stilus-key": k }, value);
}
