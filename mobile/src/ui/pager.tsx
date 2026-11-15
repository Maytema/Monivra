// The pager the screens use. The native one (native-pager.tsx, react-native-pager-view) is kept next to it: on the
// emulator its pages stayed empty after the data changed (build 96), so the hand-made one is in use until that is
// understood. Switching back is this one line.
export { PanPager as Pager, usePagerMotion, WIDE_RETENTION } from "./pan-pager.tsx";
