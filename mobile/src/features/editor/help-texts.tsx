// The explanations of the editor, word for word from the first application (js/screens/fees.js
// CALCULATION_RULES, js/screens/recurrence.js REMINDER_RULES): how fees are counted and how a reminder
// behaves. Each one opens as a dialog with a closing button.
import { ScrollView, Text, View } from "react-native";
import { usePalette, useT } from "../../ui/app-context.tsx";
import { TextButton } from "../../ui/calendar-sheet.tsx";
import { DialogActions, DialogTitle } from "../../ui/dialogs.tsx";
import { sheets } from "../../ui/sheets.tsx";

const CALCULATION_RULES: readonly (readonly [string, readonly string[]])[] = [
  ["1. The value of the operation after calculations cannot be negative! In the case of a negative value, it will be equal to 0. An operation with a zero value cannot be written.", ["Example 1: 10 - commission (50) = -40 = 0"]],
  ["2. Use add or subtract value.", ["Example 1: 100 + commission (10%) + tax (20%) = 130", "Example 2: 100 - commission (10%) - tax (20%) = 72"]],
  [
    "3. When subtracting, the value from the previous arithmetic operation is used, and when adding, the base value at the end of the calculation.",
    ["Example 1: 100 + commission (10%) + tax (20%) = 100 + 30 = 130", "Example 2: 100 + commission (10%) - tax (20%) = 110 -> 80", "Example 3: 100 - commission (10%) + tax (20%) = 120 -> 90", "Example 4: 100 - commission (10%) - tax (20%) = 100 - 10 = 90 - 18 = 72"],
  ],
  [
    "4. The order of counting is important! Correctly arrange the order of counting! (you can use drag and drop elements or remove the first one and add it to the end).",
    ["Example 1: 100 - tax (20%) - commission (7) = 100 - 20 = 80 - 7 = 73", "Example 2: 100 - commission (7) - tax (20%) = 100 - 7 = 93 - 18,6 = 74,4"],
  ],
];

const REMINDER_RULES: readonly string[] = [
  "1) The reminder must not be set earlier than the current time, otherwise it will be shown immediately when it is set!",
  "For example: it is 6 pm now, you schedule a payment for tomorrow and set a reminder for it 1 day before at 3 pm. This time for the reminder would be 3 hours before the current time, which means the notification will be shown immediately when it is set.",
  "2) The reminder must be set within the time frame between periodic payments, otherwise it will be shown immediately when it is set!",
  "For example: you set a scheduled payment to repeat once a week, but set a payment reminder a month before the payment, which means that the notification will be shown immediately after it is set and will repeat once a month, not once a week.",
  "3) Be careful when setting a reminder by day when you want to set a reminder a month or a year before the payment!",
  "For example: you want to set a reminder a month before the payment, but instead of setting the period a month before, you set it 30 days before. In this case, some months can be either 28 days or 31 and the reminder will not be on the day you expected. If you want to set a reminder a month before, you should set it exactly a month before, without using days. The same is true for setting a reminder a year or years before.",
];

function Rules({ title, lead, lines, rules, button }: { title: string; lead?: string; lines?: readonly string[]; rules?: typeof CALCULATION_RULES; button: string }) {
  const p = usePalette();
  const t = useT();
  const text = { color: p.inkSoft, fontSize: 15, lineHeight: 22, marginBottom: 8 } as const;
  return (
    <View>
      <DialogTitle>{t.t(title)}</DialogTitle>
      <ScrollView style={{ maxHeight: 420 }}>
        {lead ? <Text style={text}>{t.t(lead)}</Text> : null}
        {lines?.map((line) => (
          <Text key={line} style={text}>
            {t.t(line)}
          </Text>
        ))}
        {rules?.map(([rule, examples]) => (
          <View key={rule}>
            <Text style={{ ...text, color: p.ink, fontWeight: "600", marginTop: 6 }}>{t.t(rule)}</Text>
            {examples.map((e) => (
              <Text key={e} style={text}>
                {t.t(e)}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
      <DialogActions>
        <TextButton label={button} onPress={() => sheets.closeTop()} />
      </DialogActions>
    </View>
  );
}

export const openCalculationHelp = (): number => sheets.open(<Rules title="Information about calculation" lead="In order for everything to be calculated correctly, several points must be taken into account:" rules={CALCULATION_RULES} button="I understood" />, "dialog");
export const openReminderHelp = (): number => sheets.open(<Rules title="Important information about setting a reminder" lines={REMINDER_RULES} button="OK" />, "dialog");
