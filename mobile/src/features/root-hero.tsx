// The header block every root screen starts with: the overall balance (with the eye that hides the
// figures) and the one action of the screen (js/screens/accounts/list.js `hero`).
import type { ReactNode } from "react";
import { overallBalance } from "../domain/ledger.ts";
import { useCommand, useHidden, useLedgerView } from "../ui/app-context.tsx";
import { Hero, HeroFigure } from "../ui/parts.tsx";

export function RootHero({ icon, label, onAction, below }: { icon?: string; label?: string; onAction?: () => void; below?: ReactNode }) {
  const data = useLedgerView();
  const run = useCommand();
  const hidden = useHidden();
  return (
    <Hero
      caption="Overall balance"
      figure={<HeroFigure value={overallBalance(data)} currency={data.settings.currency} />}
      hidden={hidden}
      onToggleHidden={() => void run((tx) => (tx.setSettings({ hidden: !hidden }), true))}
      actionIcon={icon}
      actionLabel={label}
      onAction={onAction}
      below={below}
    />
  );
}
