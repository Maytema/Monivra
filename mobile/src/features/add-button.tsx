// The floating button that adds an operation.
import { Pressable } from "react-native";
import { router } from "expo-router";
import { usePalette, useT } from "../ui/app-context.tsx";
import { Icon } from "../ui/kit.tsx";

export function AddButton({ params }: { params?: Record<string, string> }) {
  const p = usePalette();
  const t = useT();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.t("New operation")}
      onPress={() => router.push({ pathname: "/operation", params: params ?? {} })}
      style={({ pressed }) => ({
        position: "absolute",
        right: 20,
        bottom: 20,
        width: 62,
        height: 62,
        borderRadius: 31,
        backgroundColor: p.accent,
        alignItems: "center",
        justifyContent: "center",
        elevation: 4,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Icon name="plus" color={p.onAccent} size={28} />
    </Pressable>
  );
}
