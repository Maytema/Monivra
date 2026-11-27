// Until when a press is still taken for the end of a swipe of a pager (ui/pressable.tsx ignores it then). Every
// state the pager reports moves it a little ahead (0.4 s while swiping or settling, 0.15 s after it stopped). Not a
// "swiping" flag: the pager's states reach JavaScript out of order ("idle" before "settling"), and such a flag stayed
// up for 1.5 s after a swipe — every tap in that time was dropped (the first tap on Expenses/Incomes after swiping a
// period "did nothing", the second worked). A plain value, so nothing draws when it changes.
const pagerMotion = { until: 0 };
export const pagerBusy = (): boolean => Date.now() < pagerMotion.until;
export function pagerState(state: string): void {
  pagerMotion.until = Math.max(pagerMotion.until, Date.now() + (state === "idle" ? 150 : 400));
}
