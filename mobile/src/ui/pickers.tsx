// Bottom panels to choose an account, a category, a currency or one of a few options.
import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { accountBalance } from "../domain/ledger.ts";
import type { Account, Category } from "../domain/types.ts";
import { useLedger, useMoney, usePalette, useT } from "./app-context.tsx";
import { Badge, Row, useBottomInset } from "./kit.tsx";
import { font, radius, space } from "./theme.ts";

export function Panel({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const p = usePalette();
  const t = useT();
  const bottom = useBottomInset();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} onPress={onClose} />
      <View style={{ maxHeight: "75%", backgroundColor: p.sheet, borderTopLeftRadius: radius.l, borderTopRightRadius: radius.l, paddingBottom: bottom + space.m }}>
        <Text style={{ color: p.ink, fontSize: font.title, fontWeight: "600", padding: space.l }}>{t.t(title)}</Text>
        <ScrollView contentContainerStyle={{ paddingHorizontal: space.s }}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

export function AccountPicker({ visible, title = "Select account", exclude, onPick, onClose }: { visible: boolean; title?: string; exclude?: string | null; onPick: (a: Account) => void; onClose: () => void }) {
  const data = useLedger();
  const money = useMoney();
  const list = data.accounts.filter((a) => !a.archived && a.id !== exclude);
  return (
    <Panel visible={visible} title={title} onClose={onClose}>
      {list.map((a) => (
        <Row
          key={a.id}
          left={<Badge icon={a.icon} color={a.color} size={34} />}
          title={a.name}
          subtitle={money(accountBalance(data, a.id), a.currency, true)}
          onPress={() => {
            onPick(a);
            onClose();
          }}
        />
      ))}
    </Panel>
  );
}

export function CategoryPicker({ visible, type, onPick, onClose }: { visible: boolean; type: Category["type"]; onPick: (c: Category) => void; onClose: () => void }) {
  const data = useLedger();
  const t = useT();
  const top = data.categories.filter((c) => c.type === type && !c.archived && !c.parent);
  return (
    <Panel visible={visible} title="Select category" onClose={onClose}>
      {top.map((c) => (
        <View key={c.id}>
          <Row left={<Badge icon={c.icon} color={c.color} size={34} />} title={c.name} onPress={() => (onPick(c), onClose())} />
          {data.categories
            .filter((s) => s.parent === c.id && !s.archived)
            .map((s) => (
              <View key={s.id} style={{ paddingLeft: 36 }}>
                <Row left={<Badge icon={s.icon} color={s.color} size={26} />} title={s.name} onPress={() => (onPick(s), onClose())} />
              </View>
            ))}
        </View>
      ))}
      {!top.length ? <Text style={{ padding: space.l }}>{t.t("No categories yet")}</Text> : null}
    </Panel>
  );
}

export function OptionPicker<T extends string>({ visible, title, options, value, onPick, onClose }: { visible: boolean; title: string; options: readonly { value: T; label: string }[]; value: T; onPick: (v: T) => void; onClose: () => void }) {
  const t = useT();
  const p = usePalette();
  return (
    <Panel visible={visible} title={title} onClose={onClose}>
      {options.map((o) => (
        <Row key={o.value} title={t.t(o.label)} right={o.value === value ? <Text style={{ color: p.accentInk }}>✓</Text> : null} onPress={() => (onPick(o.value), onClose())} />
      ))}
    </Panel>
  );
}
