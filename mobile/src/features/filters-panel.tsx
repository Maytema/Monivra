// The filters of the operations and the statistics (js/screens/operations/filters.js): type, accounts,
// categories and tags. They are kept in the view state, so both tabs show the same selection.
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { emptyFilters, type Filters } from "../domain/periods.ts";
import { useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { Button, Label } from "../ui/kit.tsx";
import { Panel } from "../ui/pickers.tsx";
import { space } from "../ui/theme.ts";

export const filtersActive = (f: Filters): boolean => !!(f.accounts || f.categories || f.types || f.tags || f.origin);

export function FiltersPanel({ visible, filters, onChange, onClose }: { visible: boolean; filters: Filters; onChange: (f: Filters) => void; onClose: () => void }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const toggle = (key: "accounts" | "categories" | "types" | "tags", value: string) => {
    const list = filters[key] ?? [];
    const next = list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
    onChange({ ...filters, [key]: next.length ? next : null });
  };
  const chip = (key: "accounts" | "categories" | "types" | "tags", value: string, label: string) => {
    const on = filters[key]?.includes(value) ?? false;
    return (
      <Pressable key={key + value} onPress={() => toggle(key, value)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? p.accent : p.nav }}>
        <Text style={{ color: on ? p.onAccent : p.ink }}>{label}</Text>
      </Pressable>
    );
  };
  const group = (title: string, chips: ReactNode[]) =>
    chips.length ? (
      <View style={{ gap: 6 }}>
        <Label>{t.t(title)}</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{chips}</View>
      </View>
    ) : null;
  return (
    <Panel visible={visible} title="Filters" onClose={onClose}>
      <View style={{ padding: space.l, gap: space.m }}>
        {group("Type", [chip("types", "expense", t.t("Expense")), chip("types", "income", t.t("Income")), chip("types", "transfer", t.t("Transfer"))])}
        {group("Accounts", data.accounts.filter((a) => !a.archived).map((a) => chip("accounts", a.id, a.name)))}
        {group("Categories", data.categories.filter((c) => !c.archived).map((c) => chip("categories", c.id, (c.parent ? "· " : "") + c.name)))}
        {group("Tags", data.tags.map((tag) => chip("tags", tag, tag)))}
        <Button label="Reset" kind="outline" onPress={() => onChange(emptyFilters())} />
      </View>
    </Panel>
  );
}
