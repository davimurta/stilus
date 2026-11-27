import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { isValidTextKey, type SyncKey } from "@stilus/shared";
import ts from "typescript";
import { normalizeJsxText } from "./jsx-text.js";

const SDK_MODULE = "@stilus/next";
const SOURCE_EXTENSIONS = /\.(tsx|ts|jsx|js|mjs)$/;
const IGNORED_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", "out", "coverage"]);

export type Location = { file: string; line: number };

export type FoundText = {
  key: string;
  defaultValue: string;
  description?: string;
  kind: "line" | "multiline";
  location: Location;
};

export type ScanProblem = { message: string; location: Location };

export type ScanResult = {
  texts: FoundText[];
  errors: ScanProblem[];
  warnings: ScanProblem[];
};

/** Scans one source file. Only `Text` and `t` imported from @stilus/next are considered. */
export function scanSource(fileName: string, code: string): ScanResult {
  const kind = fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, kind);
  const result: ScanResult = { texts: [], errors: [], warnings: [] };

  const textNames = new Set<string>();
  const tNames = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== SDK_MODULE) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      if (imported === "Text") textNames.add(element.name.text);
      if (imported === "t") tNames.add(element.name.text);
    }
  }
  if (textNames.size === 0 && tNames.size === 0) return result;

  const at = (node: ts.Node): Location => ({
    file: fileName,
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
  });
  const error = (node: ts.Node, message: string) =>
    result.errors.push({ message, location: at(node) });

  function staticString(node: ts.Node | undefined): string | null {
    if (!node) return null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isJsxExpression(node)) return staticString(node.expression);
    if (ts.isParenthesizedExpression(node)) return staticString(node.expression);
    return null;
  }

  function addText(
    node: ts.Node,
    key: string,
    defaultValue: string,
    extra: { description?: string; multiline: boolean },
  ) {
    if (!isValidTextKey(key)) {
      error(node, `Invalid key "${key}". Use lowercase segments separated by dots.`);
      return;
    }
    result.texts.push({
      key,
      defaultValue,
      kind: extra.multiline ? "multiline" : "line",
      location: at(node),
      ...(extra.description !== undefined ? { description: extra.description } : {}),
    });
  }

  function visitTextElement(node: ts.JsxElement | ts.JsxSelfClosingElement) {
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    let key: string | null = null;
    let keyNode: ts.Node = opening;
    let description: string | undefined;
    let multiline = false;
    let hasKey = false;

    for (const attribute of opening.attributes.properties) {
      if (!ts.isJsxAttribute(attribute)) {
        error(attribute, "Spread props are not allowed on <Text>: the CLI cannot read them.");
        continue;
      }
      const name = attribute.name.getText(source);
      if (name === "k") {
        hasKey = true;
        keyNode = attribute;
        key = staticString(attribute.initializer);
      } else if (name === "description") {
        const value = staticString(attribute.initializer);
        if (value === null) error(attribute, "description must be a string literal.");
        else description = value;
      } else if (name === "multiline") {
        const init = attribute.initializer;
        multiline =
          init === undefined ||
          (ts.isJsxExpression(init) && init.expression?.kind === ts.SyntaxKind.TrueKeyword);
      }
    }

    if (!hasKey) return error(opening, "<Text> needs a k prop with the text key.");
    if (key === null) return error(keyNode, "The k prop of <Text> must be a string literal.");

    if (!ts.isJsxElement(node) || node.children.length === 0) {
      return error(opening, `<Text k="${key}"> needs a default text as its child.`);
    }
    let defaultValue = "";
    for (const child of node.children) {
      if (ts.isJsxText(child)) {
        // Each JSX text chunk is normalized on its own, like React does.
        defaultValue += normalizeJsxText(child.text);
      } else {
        const value = staticString(child);
        if (value === null) {
          return error(child, `The default text of <Text k="${key}"> must be plain text.`);
        }
        defaultValue += value;
      }
    }
    addText(node, key, defaultValue, { description, multiline });
  }

  function visitTCall(node: ts.CallExpression) {
    const [keyArg, fallbackArg] = node.arguments;
    const key = staticString(keyArg);
    if (key === null) return error(node, "The first argument of t() must be a string literal key.");
    const fallback = staticString(fallbackArg);
    if (fallback === null) {
      return error(node, `The second argument of t("${key}") must be a string literal.`);
    }
    addText(node, key, fallback, { multiline: false });
  }

  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = (ts.isJsxElement(node) ? node.openingElement : node).tagName;
      if (ts.isIdentifier(tag) && textNames.has(tag.text)) visitTextElement(node);
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      tNames.has(node.expression.text)
    ) {
      visitTCall(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}

function listSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (IGNORED_DIRECTORIES.has(entry) || entry.startsWith(".")) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...listSourceFiles(path));
    else if (SOURCE_EXTENSIONS.test(entry) && !entry.endsWith(".d.ts")) files.push(path);
  }
  return files.sort();
}

/** Scans a project directory and merges what it finds into one entry per key. */
export function scanProject(directory: string): ScanResult & { keys: SyncKey[] } {
  const merged: ScanResult = { texts: [], errors: [], warnings: [] };
  for (const path of listSourceFiles(directory)) {
    const fileName = relative(directory, path);
    const result = scanSource(fileName, readFileSync(path, "utf8"));
    merged.texts.push(...result.texts);
    merged.errors.push(...result.errors);
    merged.warnings.push(...result.warnings);
  }

  const byKey = new Map<string, FoundText>();
  for (const text of merged.texts) {
    const first = byKey.get(text.key);
    if (!first) {
      byKey.set(text.key, text);
    } else if (first.defaultValue !== text.defaultValue) {
      merged.warnings.push({
        message: `Key "${text.key}" has different default texts here and in ${first.location.file}:${first.location.line}. Using the first one.`,
        location: text.location,
      });
    }
  }

  const keys = [...byKey.values()].map((text) => ({
    key: text.key,
    defaultValue: text.defaultValue,
    page: text.key.split(".")[0],
    kind: text.kind,
    ...(text.description !== undefined ? { description: text.description } : {}),
  }));
  return { ...merged, keys };
}
