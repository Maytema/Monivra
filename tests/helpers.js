import { TODAY } from "../js/core/constants.js";
import { appData } from "../js/core/state.js";

export const addAccount = (fields) => {
  const a = {
    id: "__t" + appData.accounts.length,
    name: "T",
    color: "#a000b8",
    type: "Regular",
    currency: appData.settings.currency,
    opening: 0,
    include: true,
    archived: false,
    goal: 0,
    limit: 0,
    debt: "Owe me",
    ...fields,
  };
  appData.accounts.push(a);
  return a;
};

export const transfer = (from, to, amount) =>
  appData.ops.push({
    id: "__o" + appData.ops.length,
    type: "transfer",
    from: from.id,
    to: to.id,
    amount,
    receive: amount,
    date: TODAY,
    tags: [],
    comment: "",
  });
