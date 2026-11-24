// "N scheduled payments were added to the operations. Tap to view." (js/screens/due-payments.js
// postedNoticeHtml): on the lists of accounts and operations while the person has not seen what was posted;
// a tap shows them among the operations, the cross only dismisses.
import { appStore, usePosted, useT } from "../ui/app-context.tsx";
import { HintBanner } from "../ui/hint-banner.tsx";
import { showOperations } from "./reveal.ts";

export function PostedBanner() {
  const posted = usePosted();
  const t = useT();
  if (!posted.length) return null;
  const text = t.tc("{n} scheduled payment was added to the operations. Tap to view.", "{n} scheduled payments were added to the operations. Tap to view.", posted.length);
  return (
    <HintBanner
      id="posted"
      icon="bell"
      text={text}
      onClose={() => appStore().forgetPosted()}
      onPress={() => {
        const ids = posted;
        appStore().forgetPosted();
        showOperations(ids);
      }}
    />
  );
}
