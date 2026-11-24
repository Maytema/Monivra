// Speed-check build only (opened by scripts/emulator-perf.sh as monivra://perfbench): a screen that mounts a fixed number of views of
// one kind at a time and writes how long that takes, to find the floor of what the platform itself costs on the emulator and how much
// more than that a page of ours costs. Nothing in other builds (the route draws nothing).
// For every scenario, three runs one after another (the first is the cold one): "commit" is the time from the start to the end of
// React's commit, "frame" the time to the second frame after the native layout (the views are on the screen).
import { FlashList } from "@shopify/flash-list";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Image, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { now, perfLog, PERF_BUILD } from "../platform/perf.ts";
import { useLedger } from "../ui/app-context.tsx";
import { Icon } from "../ui/kit.tsx";
import { OperationRow } from "./operation-row.tsx";

const noop = (): void => undefined;
import type { Operation } from "../domain/types.ts";

const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const GLYPHS = ["★", "☆", "✓", "✕", "♥", "☀", "☂", "✈"];
const NAMES = ["wallet", "calendar", "more", "apps"];
const PATH = "M4 6h16M4 12h16M4 18h16";
const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

interface Scenario {
  name: string;
  // Draws the scenario; `ready` is called when it counts as done (the layout of the container by default, a list's own load).
  draw(ready: () => void, ops: Operation[]): ReactNode;
  needsOps?: boolean;
}

const wrap = { flexDirection: "row", flexWrap: "wrap" } as const;
const flatRow = (i: number) => (
  <View style={{ height: 70, paddingHorizontal: 16, justifyContent: "center" }}>
    <Text numberOfLines={1}>{`row ${i}`}</Text>
    <Text numberOfLines={1}>{"comment"}</Text>
    <Text numberOfLines={1}>{"1 234 KGS"}</Text>
  </View>
);
const absoluteRow = (i: number) => (
  <View style={{ height: 70 }}>
    <Text numberOfLines={1} style={{ position: "absolute", left: 16, top: 8 }}>{`row ${i}`}</Text>
    <Text numberOfLines={1} style={{ position: "absolute", left: 16, top: 30 }}>{"comment"}</Text>
    <Text numberOfLines={1} style={{ position: "absolute", right: 16, top: 8 }}>{"1 234 KGS"}</Text>
  </View>
);

const SCENARIOS: Scenario[] = [
  { name: "170 View", draw: (ready) => <View onLayout={ready} style={wrap}>{range(170).map((i) => <View key={i} style={{ width: 20, height: 20, margin: 1, backgroundColor: "#888" }} />)}</View> },
  { name: "170 View+Text", draw: (ready) => <View onLayout={ready} style={wrap}>{range(170).map((i) => <View key={i} style={{ padding: 2 }}><Text>{i % 10}</Text></View>)}</View> },
  { name: "35 Svg+Path", draw: (ready) => <View onLayout={ready} style={wrap}>{range(35).map((i) => <Svg key={i} width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.7}><Path d={PATH} /></Svg>)}</View> },
  { name: "35 our Icon", draw: (ready) => <View onLayout={ready} style={wrap}>{range(35).map((i) => <Icon key={i} name={NAMES[i % NAMES.length]!} size={24} />)}</View> },
  { name: "35 glyph Text", draw: (ready) => <View onLayout={ready} style={wrap}>{range(35).map((i) => <Text key={i} style={{ fontSize: 22, width: 28 }}>{GLYPHS[i % GLYPHS.length]}</Text>)}</View> },
  { name: "35 Image raster", draw: (ready) => <View onLayout={ready} style={wrap}>{range(35).map((i) => <Image key={i} source={{ uri: `data:image/png;base64,${PIXEL}` }} style={{ width: 24, height: 24 }} />)}</View> },
  { name: "15 flat rows, plain View", draw: (ready) => <View onLayout={ready}>{range(15).map((i) => <View key={i}>{flatRow(i)}</View>)}</View> },
  { name: "15 absolute rows, plain View", draw: (ready) => <View onLayout={ready}>{range(15).map((i) => <View key={i}>{absoluteRow(i)}</View>)}</View> },
  { name: "15 our rows, plain View", needsOps: true, draw: (ready, ops) => <View onLayout={ready}>{ops.slice(0, 15).map((op) => <View key={op.id} style={{ paddingHorizontal: 16 }}><OperationRow op={op} onPress={noop} /></View>)}</View> },
  { name: "15 flat rows, FlashList", draw: (ready) => <View style={{ height: 700 }}><FlashList data={range(15)} renderItem={({ item }) => flatRow(item)} keyExtractor={(i) => String(i)} onLoad={ready} /></View> },
  { name: "15 absolute rows, FlashList", draw: (ready) => <View style={{ height: 700 }}><FlashList data={range(15)} renderItem={({ item }) => absoluteRow(item)} keyExtractor={(i) => String(i)} onLoad={ready} /></View> },
  { name: "15 our rows, FlashList", needsOps: true, draw: (ready, ops) => <View style={{ height: 700 }}><FlashList data={ops.slice(0, 15)} renderItem={({ item }) => <View style={{ paddingHorizontal: 16 }}><OperationRow op={item} onPress={noop} /></View>} keyExtractor={(o) => o.id} onLoad={ready} /></View> },
];

// A scenario drawn once; says when it was committed and when its second frame came.
function Run({ scenario, run, started, ops, finished }: { scenario: Scenario; run: number; started: number; ops: Operation[]; finished: () => void }) {
  const done = useRef(false);
  useLayoutEffect(() => {
    perfLog(`bench ${scenario.name} run ${run}: commit`, now() - started);
  }, [scenario, run, started]);
  const ready = () => {
    if (done.current) return;
    done.current = true;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        perfLog(`bench ${scenario.name} run ${run}: frame`, now() - started);
        finished();
      }),
    );
  };
  return <>{scenario.draw(ready, ops)}</>;
}

function Bench() {
  const ledger = useLedger();
  const [shown, setShown] = useState<{ scenario: Scenario; run: number; started: number } | null>(null);
  const finish = useRef<(() => void) | null>(null);
  useEffect(() => {
    let alive = true;
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    void (async () => {
      await sleep(1000);
      for (const scenario of SCENARIOS) {
        for (let run = 1; run <= 3 && alive; run++) {
          if (scenario.needsOps && ledger.ops.length < 15) {
            perfLog(`bench ${scenario.name}: skipped (fewer than 15 operations)`, 0);
            break;
          }
          setShown(null);
          await sleep(300);
          const finished = new Promise<void>((resolve) => (finish.current = resolve));
          setShown({ scenario, run, started: now() });
          await Promise.race([finished, sleep(4000)]);
        }
      }
      perfLog("bench finished", 0);
    })();
    return () => {
      alive = false;
    };
  }, [ledger]);
  return (
    <View style={{ flex: 1, paddingTop: 120 }}>
      {shown ? <Run key={`${shown.scenario.name}${shown.run}`} scenario={shown.scenario} run={shown.run} started={shown.started} ops={ledger.ops} finished={() => finish.current?.()} /> : null}
    </View>
  );
}

export default function PerfBench() {
  return PERF_BUILD ? <Bench /> : null;
}
