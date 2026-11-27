// Who hears the eye. A figure that is masked listens to the mask (useMoney), and a tab keeps hundreds of them (every row of five
// pages of Operations): a tap on the eye drew all of them again, the ones on the pages nobody sees too (speed check build 168:
// 55 of 103 listeners on Operations, 59 of 66 on Statistics). A scope says whether what is inside is in front: a tab (TabScope) and
// the page of a period pager that is the current one (PeriodPager). The eye is told only to the figures of scopes in front; a scope
// that comes in front wakes its figures, and they take the mask as it is now (a figure that is drawn reads the live mask anyway).
import { createContext, useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { useNavigation } from "expo-router";
import type { Channel } from "../application/store.ts";
import { appStore } from "../platform/app-store.ts";

interface Scope {
  active: boolean;
  parent: Scope | null;
  listeners: Set<() => void>;
  children: Set<Scope>;
}
const newScope = (parent: Scope | null, active: boolean): Scope => ({ active, parent, listeners: new Set(), children: new Set() });
const root = newScope(null, true);
const ScopeContext = createContext<Scope>(root);

const inFront = (s: Scope): boolean => s.active && (!s.parent || inFront(s.parent));
const wake = (s: Scope): number => {
  if (!inFront(s)) return 0;
  let n = 0;
  for (const listener of [...s.listeners]) (listener(), n++);
  for (const child of s.children) n += wake(child);
  return n;
};
const MASK: Channel[] = ["mask"];
let listening = false;
function listen(): void {
  if (listening) return;
  listening = true;
  appStore().subscribe(() => void wake(root), MASK);
}

// For useMoney: hears the mask while the scope this figure is in is in front.
export function useMaskSubscriber(): (listener: () => void) => () => void {
  const scope = useContext(ScopeContext);
  const ref = useRef<{ scope: Scope; subscribe: (l: () => void) => () => void } | null>(null);
  if (!ref.current || ref.current.scope !== scope) {
    ref.current = {
      scope,
      subscribe: (listener) => {
        listen();
        scope.listeners.add(listener);
        return () => void scope.listeners.delete(listener);
      },
    };
  }
  return ref.current.subscribe;
}

// The part of the navigator used here.
interface Navigation {
  isFocused(): boolean;
  addListener(event: "focus" | "blur", listener: () => void): () => void;
}
function MaskScopeInner({ active, navigation, children }: { active: boolean; navigation?: Navigation; children: ReactNode }) {
  const parent = useContext(ScopeContext);
  const ref = useRef<Scope | null>(null);
  if (!ref.current || ref.current.parent !== parent) ref.current = newScope(parent, navigation ? safeFocused(navigation) : active);
  const scope = ref.current;
  useEffect(() => {
    parent.children.add(scope);
    return () => void parent.children.delete(scope);
  }, [parent, scope]);
  const apply = (on: boolean) => {
    if (scope.active === on) return;
    const was = inFront(scope);
    scope.active = on;
    if (!was && inFront(scope)) wake(scope);
  };
  useLayoutEffect(() => {
    if (!navigation) apply(active);
  }, [active, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  // A tab is told by the navigator itself, not by drawing: a tab that has been left is frozen, and a frozen screen does not draw
  // (what it would set in its state waits until it is shown again), yet its figures must stop hearing the eye at once.
  useLayoutEffect(() => {
    if (!navigation) return;
    const update = () => apply(safeFocused(navigation));
    update();
    const a = navigation.addListener("focus", update);
    const b = navigation.addListener("blur", update);
    return () => (a(), b());
  }, [navigation, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>;
}
const safeFocused = (navigation: Navigation): boolean => {
  try {
    return navigation.isFocused();
  } catch {
    return true;
  }
};

export function MaskScope({ active, children }: { active: boolean; children: ReactNode }) {
  return <MaskScopeInner active={active}>{children}</MaskScopeInner>;
}

// A tab: in front while its screen is the focused one.
export function TabScope({ children }: { children: ReactNode }) {
  const navigation = useNavigation() as unknown as Navigation;
  return (
    <MaskScopeInner active navigation={navigation}>
      {children}
    </MaskScopeInner>
  );
}
