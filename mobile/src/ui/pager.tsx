// The pager the screens use: the platform's own (native-pager.tsx, ViewPager2). The hand-made one (pan-pager.tsx)
// follows the finger on the JavaScript thread and is kept only for what it shares (the motion context).
export { Pager, usePageReady, usePagerMotion, WIDE_RETENTION } from "./native-pager.tsx";
