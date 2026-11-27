import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { compileFunction } from "node:vm";
import ts from "typescript";

// Load a real Next entry point with per-test substitutes for request context or network I/O.
export function loadSource(file, imports = {}) {
  const url = new URL("../../src/" + file, import.meta.url);
  const require = createRequire(url);
  const { outputText } = ts.transpileModule(readFileSync(url, "utf8"), {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true },
  });
  const exports = {};
  const run = compileFunction(outputText, ["require", "exports"], { filename: fileURLToPath(url) });
  run(name => Object.hasOwn(imports, name) ? imports[name] : require(name), exports);
  return exports;
}
