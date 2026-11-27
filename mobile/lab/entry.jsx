import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { LedgerLook } from "@src/ui/app-context.tsx";
import { OperationsScreen } from "@src/features/operations.tsx";
import { handle } from "./pagerview-stub.jsx";
import { deckHandle } from "./reanimated-stub.jsx";
import { counts } from "./flash-stub.jsx";

const lines = [];
const log = console.log;
console.log = (...a) => { const s = a.join(" "); if (s.startsWith("[perf]")) lines.push(s); else log(...a); };
const tick = () => new Promise((r) => setTimeout(r, 0));
const count = (re) => lines.filter((l) => re.test(l)).length;

// Ten swipes back, one after another; each: the pager takes the page, the screen draws, the task of the pager follows.
window.runSwipes = async (n = 10) => {
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  flushSync(() => root.render(<LedgerLook><OperationsScreen /></LedgerLook>));
  await tick(); await new Promise((r) => setTimeout(r, 700)); // the neighbours are drawn after 500 ms
  const subs = globalThis.__labSubs();
  const deck = !!deckHandle.props;
  let pos = deck ? (deckHandle.props.contentContainerStyle.width / 400 - 1) / 2 : handle.props.initialPage;
  const out = [];
  for (let i = 0; i < n; i++) {
    lines.length = 0; counts.listMounts = 0; counts.listRenders = 0; counts.rowMounts = 0;
    const t = performance.now();
    if (deck) {
      // The finger goes down, the scroll view settles one page back, JavaScript hears the end.
      flushSync(() => {
        deckHandle.props.onScrollBeginDrag();
        pos -= 1;
        deckHandle.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: pos * 400 } } });
      });
      await tick(); await tick();
    } else {
      flushSync(() => {
        handle.props.onPageScrollStateChanged({ nativeEvent: { pageScrollState: "dragging" } });
        pos -= 1;
        handle.props.onPageSelected({ nativeEvent: { position: pos } });
      });
      await tick(); await tick();
      flushSync(() => handle.props.onPageScrollStateChanged({ nativeEvent: { pageScrollState: "idle" } }));
    }
    out.push({ ms: +(performance.now() - t).toFixed(1), pageMounts: count(/operations page mount/), pageBuilt: count(/operations page built/), listMounts: counts.listMounts, listRenders: counts.listRenders, rowMounts: counts.rowMounts });
  }
  root.unmount(); el.remove();
  out.subs = subs;
  return out;
};
