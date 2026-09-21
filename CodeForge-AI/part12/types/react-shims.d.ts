/**
 * Hand-rolled ambient declarations for React + JSX. Same reasoning as
 * types/node-shims.d.ts: @types/react is not installable in this sandbox (no network),
 * but react/react-dom ARE globally installed and DO execute — tests/reactRender.test.ts
 * actually renders every component in this project via react-dom/server. This file
 * exists purely so `tsc --noEmit` is a meaningful gate on the component *logic*
 * (hooks, props, state); it deliberately does NOT attempt to fully replicate
 * @types/react's exhaustive HTML attribute typing — DOMProps below is intentionally
 * permissive for element attributes, scoped tight only on the hooks API this project
 * actually calls. Delete this file the moment the real @types/react is installed in
 * the host repo.
 */

declare module 'react' {
  export type ReactNode = unknown;

  export function useState<S>(initial: S | (() => S)): [S, (next: S | ((prev: S) => S)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
  export function useRef<T>(initial: T): { current: T };
  export function useMemo<T>(factory: () => T, deps: unknown[]): T;
  export function createElement(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): unknown;
}

declare module 'react-dom/server' {
  export function renderToStaticMarkup(element: unknown): string;
  export function renderToString(element: unknown): string;
}

declare module 'react/jsx-runtime' {
  export function jsx(type: unknown, props: unknown, key?: unknown): unknown;
  export function jsxs(type: unknown, props: unknown, key?: unknown): unknown;
  export const Fragment: unknown;
}

declare namespace JSX {
  // Deliberately permissive per-element prop bag rather than a full HTML attribute
  // union — see file header. `children`/`key` are handled by the JSX transform itself;
  // everything else this project passes (className, style, onClick, aria-*, data-*,
  // disabled, type, role, scope, tabIndex, onKeyDown, title) flows through `[k: string]: unknown`.
  interface DOMProps {
    children?: unknown;
    key?: string | number;
    [key: string]: unknown;
  }
  interface IntrinsicElements {
    div: DOMProps;
    span: DOMProps;
    button: DOMProps;
    p: DOMProps;
    pre: DOMProps;
    table: DOMProps;
    thead: DOMProps;
    tbody: DOMProps;
    tr: DOMProps;
    th: DOMProps;
    td: DOMProps;
    dl: DOMProps;
    dt: DOMProps;
    dd: DOMProps;
    ul: DOMProps;
    ol: DOMProps;
    li: DOMProps;
    style: DOMProps;
  }
  interface Element {
    type: unknown;
    props: unknown;
  }
  interface ElementChildrenAttribute {
    children: unknown;
  }
}
