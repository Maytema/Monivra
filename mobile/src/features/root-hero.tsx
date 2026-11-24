// The header block every root screen starts with: the overall balance (with the eye that hides the
// figures) and the one action of the screen (js/screens/accounts/list.js `hero`).
import { countRender, PERF_BUILD, sinceTouch } from "../platform/perf.ts";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { overallBalance } from "../domain/ledger.ts";
import { useCommand, useLedger, useMoney } from "../ui/app-context.tsx";
import { Hero } from "../ui/parts.tsx";

export function RootHero({ icon, label, onAction, below }: { icon?: string; label?: string; onAction?: () => void; below?: ReactNode }) {
  countRender("root hero");
  const data = useLedger();
  const money = useMoney();
  const run = useCommand();
  const hidden = !!data.settings.hidden;
  // Speed-check build: the time from the finger to the figures drawn masked (or shown again).
  const first = useRef(true);
  useLayoutEffect(() => {
    if (!PERF_BUILD) return;
    if (first.current) first.current = false;
    else sinceTouch(hidden ? "eye: figures masked" : "eye: figures shown");
  }, [hidden]);
  return (
    <Hero
      caption="Overall balance"
      figure={money(overallBalance(data), data.settings.currency, true)}
      hidden={hidden}
      onToggleHidden={() => void run((tx) => (tx.setSettings({ hidden: !hidden }), true))}
      actionIcon={icon}
      actionLabel={label}
      onAction={onAction}
      below={below}
    />
  );
}
