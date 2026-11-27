// react-native-pager-view on the page: all the pages are children of one element; the props are kept for the test to call.
import React from "react";
export const handle = (globalThis.__labPager ??= { props: null });
const PagerView = React.forwardRef(function PagerView(props, ref) {
  handle.props = props;
  React.useImperativeHandle(ref, () => ({ setPage() {}, setPageWithoutAnimation() {} }), []);
  return <div>{props.children}</div>;
});
export default PagerView;
