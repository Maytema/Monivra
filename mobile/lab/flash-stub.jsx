// FlashList on the page: draws the first rows (a window), counts what is mounted and laid out.
import React, { useEffect, useLayoutEffect } from "react";
export const counts = (globalThis.__labCounts ??= { listMounts: 0, listRenders: 0, rowMounts: 0 });
const WINDOW = 15;
function Cell({ item, index, renderItem }) {
  useLayoutEffect(() => { counts.rowMounts++; }, []);
  return renderItem({ item, index });
}
export const FlashList = React.forwardRef(function FlashList({ data, renderItem, onLoad, ListHeaderComponent, ListFooterComponent, keyExtractor }, ref) {
  counts.listRenders++;
  useLayoutEffect(() => { counts.listMounts++; }, []);
  useEffect(() => { onLoad?.({ elapsedTimeInMs: 0 }); }, []);
  React.useImperativeHandle(ref, () => ({ scrollToOffset() {}, scrollToIndex() {}, scrollToTop() {} }), []);
  const key = (it, i) => i; // cells are recycled by place: a new item in a cell is an update, not a mount
  return (
    <div>
      {ListHeaderComponent ? (typeof ListHeaderComponent === "function" ? <ListHeaderComponent /> : ListHeaderComponent) : null}
      {(data ?? []).slice(0, WINDOW).map((item, i) => <Cell key={key(item, i)} item={item} index={i} renderItem={renderItem} />)}
      {ListFooterComponent ? (typeof ListFooterComponent === "function" ? <ListFooterComponent /> : ListFooterComponent) : null}
    </div>
  );
});
