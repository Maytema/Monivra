// The filters of the operations and the statistics (js/screens/operations/filters.js, filter-parts.js,
// category-filter.js): a sheet of fields — accounts, categories, type, tags, comment, how added — each
// opening its own picker; "Reset all" and "Apply". A picker has its title and how many are chosen, a
// list that scrolls, and Cancel / Confirm that stay in view. All chosen = no filter (null).
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Account } from "../domain/types.ts";
import { emptyFilters, type Filters } from "../domain/periods.ts";
import { useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { promptDialog } from "../ui/dialogs.tsx";
import { Icon } from "../ui/kit.tsx";
import { ToneBadge } from "../ui/parts.tsx";
import { sheets, useCloseLayer } from "../ui/sheets.tsx";

export const filtersActive = (f: Filters): boolean => !!(f.accounts || f.categories || f.types || f.tags || f.origin);

export const TYPE_NAMES: Record<string, string> = { expense: "Expenses", income: "Incomes", transfer: "Transfers" };
const ORIGINS: Record<string, string> = { manual: "By hand", schedule: "By schedule" };
const ACCOUNT_GROUPS: readonly [string, (a: Account) => boolean][] = [
  ["Accounts", (a) => a.type === "Regular"],
  ["Savings", (a) => a.type === "Savings"],
  ["Debts", (a) => a.type === "Debt"],
];

// The square check of the pickers (filter-parts.js `checkboxHtml`).
export function Check({ on }: { on: boolean }) {
  const p = usePalette();
  return (
    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? p.accent : p.inkSoft, backgroundColor: on ? p.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
      {on ? <Icon name="check" size={15} color={p.onAccent} /> : null}
    </View>
  );
}

// Two buttons side by side under a sheet (ui/primitives.js `sheetFooterHtml`).
function Footer({ left, right }: { left: [string, () => void]; right: [string, () => void] }) {
  const p = usePalette();
  const t = useT();
  const button = ([label, onPress]: [string, () => void], primary: boolean) => (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: 50, borderRadius: 26, alignItems: "center", justifyContent: "center", borderWidth: primary ? 0 : 1, borderColor: p.line, backgroundColor: primary ? p.accent : "transparent", opacity: pressed ? 0.85 : 1 })}>
      <Text style={{ color: primary ? p.onAccent : p.ink, fontSize: 16, fontWeight: primary ? "600" : "400" }}>{t.t(label)}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", gap: 12, paddingTop: 12, paddingBottom: 6 }}>
      {button(left, false)}
      {button(right, true)}
    </View>
  );
}

// The frame of a picker: title and what is chosen (or tools) on one line, the list, the footer.
function Picker({ title, summary, children, onConfirm }: { title: string; summary: ReactNode; children: ReactNode; onConfirm: () => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  return (
    <View style={{ flexShrink: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 12 }}>
        <Text style={{ color: p.ink, fontSize: 20 }}>{t.t(title)}</Text>
        {summary}
      </View>
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <Footer left={["Cancel", close]} right={["Confirm", onConfirm]} />
    </View>
  );
}

function Summary({ n }: { n: number }) {
  const p = usePalette();
  const t = useT();
  return <Text style={{ color: p.inkSoft, fontSize: 13 }}>{t.t("{n} selected", { n })}</Text>;
}

const rowLine = (p: ReturnType<typeof usePalette>) => ({ borderBottomWidth: 1, borderBottomColor: p.line });

// One group whose head chooses everything or nothing (filters.js `multiSelect`).
export function MultiSelect({ title, items, selected, done }: { title: string; items: readonly { id: string; name: string }[]; selected: string[] | null; done: (v: string[] | null) => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const [values, setValues] = useState(() => new Set(selected ?? items.map((x) => x.id)));
  const all = items.length > 0 && values.size === items.length;
  const flip = (id: string) => setValues((v) => {
    const next = new Set(v);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  return (
    <Picker
      title={title}
      summary={<Summary n={values.size} />}
      onConfirm={() => {
        close();
        done(values.size === items.length ? null : [...values]);
      }}
    >
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: all }} onPress={() => setValues(all ? new Set() : new Set(items.map((x) => x.id)))} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 50, paddingHorizontal: 10, ...rowLine(p) }}>
        <Text style={{ flex: 1, color: p.ink, fontSize: 16, fontWeight: "600" }}>{t.t("Select all")}</Text>
        <Text style={{ color: p.inkSoft, fontSize: 12 }}>
          {values.size}/{items.length}
        </Text>
        <Check on={all} />
      </Pressable>
      {items.map((x) => (
        <Pressable key={x.id} accessibilityRole="checkbox" accessibilityLabel={t.t(x.name)} accessibilityState={{ checked: values.has(x.id) }} onPress={() => flip(x.id)} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 50, paddingHorizontal: 12, ...rowLine(p) }}>
          <Text style={{ flex: 1, color: p.ink, fontSize: 16 }}>{t.t(x.name)}</Text>
          <Check on={values.has(x.id)} />
        </Pressable>
      ))}
    </Picker>
  );
}

// Accounts grouped by kind; a group head folds the group and chooses all of it (filters.js
// `filterAccountSelect`).
export function AccountSelect({ selected, done }: { selected: string[] | null; done: (v: string[] | null) => void }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const [values, setValues] = useState(() => new Set(selected ?? data.accounts.map((a) => a.id)));
  const [open, setOpen] = useState(() => new Set(ACCOUNT_GROUPS.map(([name]) => name)));
  const chosen = (ids: string[]) => ids.length > 0 && ids.every((id) => values.has(id));
  const toggle = (ids: string[]) =>
    setValues((v) => {
      const next = new Set(v);
      const on = ids.every((id) => next.has(id));
      ids.forEach((id) => (on ? next.delete(id) : next.add(id)));
      return next;
    });
  return (
    <Picker
      title="Accounts"
      summary={<Summary n={values.size} />}
      onConfirm={() => {
        close();
        done(values.size === data.accounts.length ? null : [...values]);
      }}
    >
      {ACCOUNT_GROUPS.map(([name, belongs]) => {
        const items = data.accounts.filter(belongs);
        if (!items.length) return null;
        const ids = items.map((a) => a.id);
        const isOpen = open.has(name);
        return (
          <View key={name} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", minHeight: 50, ...rowLine(p) }}>
              <Pressable accessibilityRole="button" accessibilityLabel={t.t(name)} onPress={() => setOpen((o) => { const n = new Set(o); if (!n.delete(name)) n.add(name); return n; })} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 6, minHeight: 50 }}>
                <Icon name={isOpen ? "down" : "right"} size={18} color={p.ink} />
                <Text style={{ flex: 1, color: p.ink, fontSize: 16, fontWeight: "600" }}>{t.t(name)}</Text>
                <Text style={{ color: p.inkSoft, fontSize: 12 }}>
                  {ids.filter((id) => values.has(id)).length}/{ids.length}
                </Text>
              </Pressable>
              <Pressable accessibilityRole="checkbox" accessibilityLabel={t.t("Toggle all {name}", { name: t.t(name) })} accessibilityState={{ checked: chosen(ids) }} onPress={() => toggle(ids)} style={{ padding: 12 }}>
                <Check on={chosen(ids)} />
              </Pressable>
            </View>
            {isOpen
              ? items.map((a) => (
                  <Pressable key={a.id} accessibilityRole="checkbox" accessibilityLabel={a.name} accessibilityState={{ checked: values.has(a.id) }} onPress={() => toggle([a.id])} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingLeft: 10, paddingRight: 12, ...rowLine(p) }}>
                    <ToneBadge icon={a.icon} color={a.color} size={38} iconSize={22} />
                    <Text numberOfLines={1} style={{ flex: 1, color: p.ink, fontSize: 16 }}>{a.name}</Text>
                    <Check on={values.has(a.id)} />
                  </Pressable>
                ))
              : null}
          </View>
        );
      })}
    </Picker>
  );
}

// Categories as a tree: Expenses and Incomes, their categories, and the subcategories one by one; a
// parent with subcategories offers its own operations as "Without subcategory" (category-filter.js).
export function CategorySelect({ selected, done }: { selected: string[] | null; done: (v: string[] | null) => void }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const all = data.categories.map((c) => c.id);
  const hasChildren = (id: string) => data.categories.some((x) => x.parent === id);
  const parents = data.categories.filter((c) => !c.parent);
  const [values, setValues] = useState(() => new Set(selected ?? all));
  const [types, setTypes] = useState(() => new Set(["expense", "income"]));
  const [open, setOpen] = useState(() => new Set(parents.filter((c) => hasChildren(c.id)).map((c) => c.id)));
  const chosen = (ids: string[]) => ids.length > 0 && ids.every((id) => values.has(id));
  const toggle = (ids: string[]) =>
    setValues((v) => {
      const next = new Set(v);
      const on = ids.every((id) => next.has(id));
      ids.forEach((id) => (on ? next.delete(id) : next.add(id)));
      return next;
    });
  const flip = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => {
    const next = new Set(set);
    if (!next.delete(key)) next.add(key);
    setter(next);
  };
  const box = (label: string, on: boolean, ids: string[]) => (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={t.t("Select {name}", { name: label })} accessibilityState={{ checked: on }} onPress={() => toggle(ids)} style={{ padding: 10 }}>
      <Check on={on} />
    </Pressable>
  );
  const arrow = (isOpen: boolean, label: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={t.t("Expand {name}", { name: label })} onPress={onPress} style={{ width: 36, height: 44, alignItems: "center", justifyContent: "center" }}>
      <Icon name={isOpen ? "down" : "right"} size={18} color={p.ink} />
    </Pressable>
  );
  const tools = (
    <View style={{ flexDirection: "row", gap: 4 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t.t("Collapse all")} onPress={() => (setTypes(new Set()), setOpen(new Set()))} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
        <Icon name="up" size={20} color={p.ink} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t.t("Expand all")} onPress={() => (setTypes(new Set(["expense", "income"])), setOpen(new Set(parents.filter((c) => hasChildren(c.id)).map((c) => c.id))))} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
        <Icon name="down" size={20} color={p.ink} />
      </Pressable>
    </View>
  );
  return (
    <Picker
      title="Filter by categories"
      summary={tools}
      onConfirm={() => {
        close();
        done(values.size === all.length ? null : [...values]);
      }}
    >
      {(["expense", "income"] as const).map((type) => {
        const group = data.categories.filter((c) => c.type === type);
        const title = type === "expense" ? "Expenses" : "Incomes";
        const isOpen = types.has(type);
        return (
          <View key={type} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", ...rowLine(p), borderBottomWidth: 2 }}>
              {arrow(isOpen, t.t(title), () => flip(types, setTypes, type))}
              <Text style={{ flex: 1, color: p.ink, fontSize: 16, fontWeight: "600" }}>{t.t(title)}</Text>
              {box(t.t(title), chosen(group.map((c) => c.id)), group.map((c) => c.id))}
            </View>
            {isOpen
              ? group
                  .filter((c) => !c.parent)
                  .map((c) => {
                    const children = data.categories.filter((x) => x.parent === c.id);
                    const family = [c.id, ...children.map((x) => x.id)];
                    const unfolded = children.length > 0 && open.has(c.id);
                    return (
                      <View key={c.id}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 48, ...rowLine(p) }}>
                          {children.length ? arrow(unfolded, c.name, () => flip(open, setOpen, c.id)) : <View style={{ width: 36 }} />}
                          <ToneBadge icon={c.icon} color={c.color} size={32} iconSize={20} />
                          <Text numberOfLines={1} style={{ flex: 1, color: p.ink, fontSize: 15 }}>{c.name}</Text>
                          {box(c.name, chosen(family), family)}
                        </View>
                        {unfolded
                          ? [...children.map((x) => [x.name, x.id] as const), [t.t("Without subcategory"), c.id] as const].map(([name, id]) => (
                              <View key={id + name} style={{ flexDirection: "row", alignItems: "center", minHeight: 44, paddingLeft: 80, ...rowLine(p) }}>
                                <Text numberOfLines={1} style={{ flex: 1, color: p.ink, fontSize: 15 }}>{name}</Text>
                                {box(name, values.has(id), [id])}
                              </View>
                            ))
                          : null}
                      </View>
                    );
                  })
              : null}
          </View>
        );
      })}
    </Picker>
  );
}

// The sheet of fields; `apply` receives the new filters (the sheet works on a copy until then).
function FiltersSheet({ current, apply }: { current: Filters; apply: (f: Filters) => void }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const [f, setF] = useState<Filters>(() => ({ ...current }));
  const set = (part: Partial<Filters>) => setF((x) => ({ ...x, ...part }));
  const count = (v: string[] | null, one: string, other: string) => (v ? t.tc(one, other, v.length) : null);
  const field = (label: string, value: string, onPress: () => void) => (
    <Pressable key={label} accessibilityRole="button" accessibilityLabel={t.t(label)} onPress={onPress} style={({ pressed }) => ({ borderWidth: 1, borderColor: p.line, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10, backgroundColor: pressed ? p.soft : p.bg })}>
      <Text style={{ color: p.ink, fontSize: 14 }}>{t.t(label)}</Text>
      <Text numberOfLines={1} style={{ color: p.accentInk, fontSize: 15, marginTop: 3 }}>{value}</Text>
    </Pressable>
  );
  const many = (title: string, items: { id: string; name: string }[], selected: string[] | null, done: (v: string[] | null) => void) => sheets.open(<MultiSelect title={title} items={items} selected={selected} done={done} />, "sheet", { scrolls: true });
  return (
    <View style={{ flexShrink: 1 }}>
      <Text style={{ color: p.ink, fontSize: 22, textAlign: "center", marginTop: 2 }}>{t.t("Filters")}</Text>
      <Text style={{ color: p.inkSoft, fontSize: 12, textAlign: "center", marginTop: 8, marginBottom: 14 }}>{t.t("Archived accounts and categories are included in the selection.")}</Text>
      <ScrollView style={{ flexShrink: 1 }}>
        {field("Accounts", count(f.accounts, "{n} account", "{n} accounts") ?? t.t("All accounts"), () => sheets.open(<AccountSelect selected={f.accounts} done={(v) => set({ accounts: v })} />, "sheet", { scrolls: true }))}
        {field("Categories", count(f.categories, "{n} category", "{n} categories") ?? t.t("All categories (All subcategories)"), () => sheets.open(<CategorySelect selected={f.categories} done={(v) => set({ categories: v })} />, "sheet", { scrolls: true }))}
        {field("Type", f.types ? f.types.map((x) => t.t(TYPE_NAMES[x] ?? x)).join(", ") : t.t("All types of operations"), () =>
          many("Type", Object.entries(TYPE_NAMES).map(([id, name]) => ({ id, name })), f.types, (v) => set({ types: v })),
        )}
        {field("Tags", f.tags ? f.tags.join(", ") : t.t("All tags"), () => many("Tags", data.tags.map((x) => ({ id: x, name: x })), f.tags, (v) => set({ tags: v })))}
        {field("Comment", f.comment ? f.comment : t.t("No comment"), () => promptDialog("Comment", f.comment, (v) => set({ comment: v }), "Comment"))}
        {field("How added", f.origin ? f.origin.map((x) => t.t(ORIGINS[x] ?? x)).join(", ") : t.t("All operations"), () =>
          many("How added", Object.entries(ORIGINS).map(([id, name]) => ({ id, name })), f.origin, (v) => set({ origin: v as Filters["origin"] })),
        )}
      </ScrollView>
      <Footer
        left={[
          "Reset all",
          () => {
            close();
            apply(emptyFilters());
          },
        ]}
        right={[
          "Apply",
          () => {
            close();
            apply(f);
          },
        ]}
      />
    </View>
  );
}

export const openFilters = (current: Filters, apply: (f: Filters) => void): number => sheets.open(<FiltersSheet current={current} apply={apply} />, "sheet", { scrolls: true });
