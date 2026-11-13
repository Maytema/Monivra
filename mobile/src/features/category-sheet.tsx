// The sheet of a held category tile (js/screens/categories.js `categoryActions`): its name, how many
// operations and how much in the period, its share of all of its kind, two actions, and one row for each
// subcategory that lists that subcategory's operations.
import { Text, View } from "react-native";
import { Pressable } from "../ui/pressable.tsx";
import { router } from "expo-router";
import { categoryById, categoryTotalIn, reportRows, totalByType, categoryRows } from "../domain/ledger.ts";
import { emptyFilters, operationsIn } from "../domain/periods.ts";
import { useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { Icon } from "../ui/kit.tsx";
import { ActionGrid, ActionTile, ToneBadge } from "../ui/parts.tsx";
import { sheets, useCloseLayer } from "../ui/sheets.tsx";
import { useView } from "./ui-state.ts";


export const openCategorySheet = (id: string): number => sheets.open(<CategorySheet id={id} />);

function CategorySheet({ id }: { id: string }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const close = useCloseLayer();
  const { period } = useView();
  const c = categoryById(data, id);
  if (!c) return null;
  const rows = reportRows(data, operationsIn(data, period, emptyFilters()));
  const own = categoryRows(data, rows, c.id, c.type);
  const all = totalByType(rows, c.type);
  const total = own.reduce((n, r) => n + r.reportAmount, 0);
  const share = all ? Math.round((total / all) * 100) : 0;
  const children = data.categories.filter((x) => x.parent === c.id && !x.archived);
  const list = (category: string) => {
    close();
    router.push({ pathname: "/filtered", params: { category } });
  };
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 6 }}>
        <ToneBadge icon={c.icon} color={c.color} size={48} />
        <Text style={{ color: p.ink, fontSize: 20, fontWeight: "600", flex: 1 }} numberOfLines={1}>
          {c.name}
        </Text>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 14 }}>
        <Text style={{ color: p.muted, fontSize: 14 }}>{t.tc("{n} operation", "{n} operations", own.length)}</Text>
        <Text style={{ color: p.ink, fontSize: 14 }}>{money(categoryTotalIn(data, rows, c), c.currency)}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}>
        <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: p.line, overflow: "hidden" }}>
          <View style={{ width: `${share}%`, height: 8, backgroundColor: c.color }} />
        </View>
        <Text style={{ color: p.muted, fontSize: 14 }}>{share} %</Text>
      </View>
      <ActionGrid>
        <ActionTile
          icon="edit"
          label="Edit"
          tone="#c04fd8"
          onPress={() => {
            close();
            router.push({ pathname: "/category", params: { id } });
          }}
        />
        <ActionTile icon="receipt" label="Operations" tone="#1f8fe0" onPress={() => list(id)} />
      </ActionGrid>
      {data.settings.subcategories
        ? children.map((x) => (
            <Pressable key={x.id} accessibilityRole="button" onPress={() => list(x.id)} style={{ flexDirection: "row", alignItems: "center", gap: 16, minHeight: 62, paddingHorizontal: 4 }}>
              <Icon name={x.icon} size={24} color={p.ink} />
              <Text style={{ flex: 1, color: p.ink, fontSize: 16 }}>{x.name}</Text>
              <Text style={{ color: p.muted, fontSize: 14 }}>{money(categoryTotalIn(data, rows, x), x.currency)}</Text>
            </Pressable>
          ))
        : null}
    </View>
  );
}

