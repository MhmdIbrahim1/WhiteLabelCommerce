import { loadSource } from "./load-source.mjs";

// Exercise React event handlers and effect disposal with deterministic focus, time and network fixtures.
export function view(file, imports) {
  let cursor = 0;
  const slots = [], effects = new Map();
  function useState(initial) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
    return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
  }
  function useEffect(run, deps) {
    const i = cursor++;
    const previous = effects.get(i);
    if (!previous || !deps || deps.some((value, index) => value !== previous.deps[index])) {
      previous?.dispose?.();
      effects.set(i, { run, deps });
    }
  }
  function memoSlot(fn, deps) {
    const i = cursor++, old = slots[i];
    if (!old || deps.some((d, j) => d !== old.deps[j])) slots[i] = { value: fn(), deps };
    return slots[i].value;
  }
  const hooks = {
    useState, useEffect, useTransition: () => [false, fn => fn()], useLayoutEffect: useEffect, useRef: current => useState({ current })[0],
    useId: () => useState(() => "field-" + cursor)[0], useMemo: memoSlot, useCallback: (fn, deps) => memoSlot(() => fn, deps),
    useSyncExternalStore: (_subscribe, get) => get(), createContext: value => ({ value, Provider: "provider" }), useContext: ctx => ctx.value,
  };
  const exports = loadSource(file, { ...imports, react: hooks });
  return {
    exports,
    render(component, props) { cursor = 0; return (typeof component === "string" ? exports[component] : component)(props); },
    flush() {
      for (const effect of effects.values()) if (effect.run) {
        const fn = effect.run; delete effect.run; effect.dispose = fn();
      }
    },
    unmount() { for (const effect of effects.values()) effect.dispose?.(); },
  };
}
export function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree?.props ? [tree, ...nodes(tree.props.children)] : [];
}
export function label(tree) {
  if (Array.isArray(tree)) return tree.map(label).join("");
  return tree?.props ? label(tree.props.children) : typeof tree === "string" || typeof tree === "number" ? String(tree) : "";
}
export function replaceGlobal(t, name, value) {
  const old = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  t.after(() => { if (old) Object.defineProperty(globalThis, name, old); else delete globalThis[name]; });
}
