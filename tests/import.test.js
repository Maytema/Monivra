import { check } from "./harness.js";
import { appData } from "../js/core/state.js";
import { csvExample, csvLines, csvTemplate, csvText } from "../js/data/csv.js";
import {
  applyImport,
  guessColumns,
  guessFormats,
  guessLinks,
  MAX_CELL,
  MAX_ROWS,
  parseAmountText,
  parseDateText,
  planImport,
  readRecords,
  readTable,
  referencesOf,
  undoImport,
} from "../js/data/csv-import.js";

const HEADER = "type,date,amount,currency,from,to,category,comment,tags,to_amount,to_currency";

// The whole way a file goes before it is added: its plan, as the pages of the import work it out.
function planOf(text, change = () => {}) {
  const table = readTable(text);
  const mapping = guessColumns(table.headers);
  const formats = guessFormats(table, mapping);
  change({ table, mapping, formats });
  const records = readRecords(table, mapping, formats);
  const links = guessLinks(referencesOf(records));
  return { table, mapping, formats, records, links, plan: planImport(records, links) };
}
const counts = () => [appData.ops.length, appData.accounts.length, appData.categories.length];

check(
  "A table is read with quotes, other delimiters, line breaks, a byte mark and blank lines",
  () => {
    const table = readTable('﻿a;b;c\r\n\r\n1;"x;y";"say ""hi"""\r\n2;"two\nlines";z\r\n\r\n');
    return (
      table.delimiter === ";" &&
      table.headers.join() === "a,b,c" &&
      table.rows.length === 2 &&
      table.rows[0].cells[1] === "x;y" &&
      table.rows[0].cells[2] === 'say "hi"' &&
      table.rows[1].cells[1] === "two\nlines" &&
      table.rows[0].line === 3 &&
      table.rows[1].line === 4
    );
  },
);

check(
  "A file that is not a table is refused: empty, quote not closed, too long, too many rows",
  () => {
    const refused = (text) => {
      try {
        readTable(text);
        return false;
      } catch {
        return true;
      }
    };
    return (
      refused("") &&
      refused("   \n\n") &&
      refused('a,b\n1,"never closed') &&
      refused(`a,b\n1,${"x".repeat(MAX_CELL + 1)}`) &&
      refused(`a\n${"1\n".repeat(MAX_ROWS + 1)}`) &&
      refused("a,b\u0000\n1,2")
    );
  },
);

check("Amounts are read exactly, and a number is never read as another one", () => {
  const minor = (text, decimal = ".") => parseAmountText(text, decimal).minor;
  return (
    minor("12.50") === 1250 &&
    minor("12,5") === 1250 &&
    minor("1,234.56") === 123456 &&
    minor("1.234,56") === 123456 &&
    minor("1 234,56") === 123456 &&
    minor("1234") === 123400 &&
    minor("$ 5") === 500 &&
    minor("1,234", ".") === 123400 &&
    minor("1,234", ",") === undefined &&
    parseAmountText("(5.00)", ".").negative === true &&
    parseAmountText("-5", ".").negative === true &&
    parseAmountText("0", ".").reason !== undefined &&
    parseAmountText("1.2.3", ".").reason !== undefined &&
    minor("12.345", ",") === 1234500 &&
    parseAmountText("12.3456", ".").reason !== undefined &&
    parseAmountText("abc", ".").reason !== undefined &&
    parseAmountText("9".repeat(14), ".").reason !== undefined
  );
});

check("Dates are read in the order chosen and impossible days are refused", () => {
  return (
    parseDateText("2026-03-04", "ymd") === "2026-03-04" &&
    parseDateText("2026/3/4 10:30", "ymd") === "2026-03-04" &&
    parseDateText("04.03.2026", "dmy") === "2026-03-04" &&
    parseDateText("03/04/2026", "mdy") === "2026-03-04" &&
    parseDateText("2026-02-30", "ymd") === null &&
    parseDateText("31.04.2026", "dmy") === null &&
    parseDateText("4.3.26", "dmy") === null &&
    parseDateText("soon", "ymd") === null
  );
});

check("The columns, the order of dates and the decimal point of a file are guessed", () => {
  const own = guessColumns(HEADER.split(","));
  const russian = guessColumns(["Дата", "Сумма", "Категория", "Счёт", "Комментарий"]);
  const table = readTable('date,amount\n31.12.2026,"1,5"\n01.01.2027,"2,5"');
  const guessed = guessFormats(table, guessColumns(table.headers));
  const unsure = guessFormats(readTable("date,amount\n03/04/2026,1"), { date: 0, amount: 1 });
  return (
    Object.entries(own).every(([key, i]) => key === "account" || i >= 0) &&
    russian.date === 0 &&
    russian.amount === 1 &&
    russian.category === 2 &&
    russian.account === 3 &&
    russian.comment === 4 &&
    guessed.dateOrder === "dmy" &&
    guessed.decimal === "," &&
    !guessed.ambiguous &&
    unsure.ambiguous
  );
});

check("The example and the empty template can be read by the import", () => {
  const empty = readTable(csvTemplate());
  const known = guessColumns(empty.headers);
  const { plan, records } = planOf(csvExample());
  return (
    empty.rows.length === 0 &&
    Object.entries(known).every(([key, i]) => key === "account" || i >= 0) &&
    records.length === 6 &&
    plan.invalid.length === 0 &&
    plan.ops.length === 6 &&
    plan.created.accounts.length === 3 &&
    plan.created.categories.length === 1
  );
});

check("An import adds what the plan says, makes a backup first and can be taken back", () => {
  const before = counts();
  const backups = appData.backups.length;
  const { plan } = planOf(csvExample());
  const added = applyImport(plan);
  const after = counts();
  const grew =
    after[0] === before[0] + 6 && after[1] === before[1] + 3 && after[2] === before[2] + 1;
  const backedUp = appData.backups.length === backups + 1 && appData.backups[0].reason === "safety";
  const transfer = appData.ops.find((o) => o.comment === "Exchange");
  const exact = transfer.amount === 10000 && transfer.receive === 9200;
  undoImport(added);
  return grew && backedUp && exact && counts().join() === before.join();
});

check("A file imported twice adds its operations once", () => {
  const first = planOf(csvExample());
  applyImport(first.plan);
  const second = planOf(csvExample());
  const sameCount = counts()[0];
  return (
    second.plan.ops.length === 0 &&
    second.plan.duplicates === 6 &&
    second.plan.created.accounts.length === 0 &&
    sameCount === counts()[0]
  );
});

check("Rows that repeat inside a file are kept, but only as many as the data lacks", () => {
  const row = `expense,2026-01-02,5.00,${appData.settings.currency},Wallet,,Food,same,,,`;
  const text = [HEADER, row, row, row].join("\n");
  const first = planOf(text);
  const repeated = first.plan.ops.length === 3 && first.plan.repeated === 2;
  // One of the three is in the data already: two are added.
  appData.ops.push({ ...first.plan.ops[0], id: "__same" });
  const again = planOf(text).plan;
  return repeated && again.ops.length === 2 && again.duplicates === 1;
});

check("The file of this application imports back as the same operations", () => {
  const account = appData.accounts[0];
  appData.ops.push({
    id: "__formula",
    type: "expense",
    from: account.id,
    category: appData.categories.find((c) => c.type === "expense").id,
    amount: 777,
    date: "2026-05-05",
    comment: "=1+1",
    tags: ["x|y".replace("|", "")],
  });
  const { plan, records } = planOf(csvText(appData.ops));
  return (
    plan.invalid.length === 0 &&
    plan.duplicates === appData.ops.length &&
    records.find((r) => r.comment === "=1+1") !== undefined
  );
});

check("A row with a problem is left out with its reason and creates nothing", () => {
  const cur = appData.settings.currency;
  const bad = [
    `expense,2026-01-02,abc,${cur},Ghost,,Food,,,,`,
    `sell,2026-01-02,5,${cur},Ghost,,Food,,,,`,
    `expense,2026-01-02,5,${cur},Ghost,,,,,,`,
    `expense,2026-13-02,5,${cur},Ghost,,Food,,,,`,
    `expense,2026-01-02,5,XXX,Ghost,,Food,,,,`,
    `expense,2026-01-02,5.001,${cur},Ghost,,Food,,,,`,
    `transfer,2026-01-02,5,${cur},Ghost,Ghost,,,,,`,
    `expense,2026-01-02,5,${cur},,,Food,,,,`,
  ];
  const good = `expense,2026-01-03,5,${cur},Wallet,,Food,,,,`;
  const { plan } = planOf([HEADER, ...bad, good].join("\n"));
  return (
    plan.invalid.length === bad.length &&
    plan.invalid.every((x) => x.reason && x.line >= 2) &&
    plan.ops.length === 1 &&
    !plan.created.accounts.some((a) => a.name === "Ghost") &&
    plan.invalid[0].line === 2
  );
});

check(
  "Accounts and categories can be linked to the ones there are, and a clash of currency is told",
  () => {
    const cur = appData.settings.currency;
    const wallet = appData.accounts[0];
    const text = [HEADER, `expense,2026-01-03,5,${cur},Cash box,,Snacks,,,,`].join("\n");
    const { records, table, mapping, formats } = planOf(text);
    const refs = referencesOf(records);
    const food = appData.categories.find((c) => c.type === "expense");
    const links = guessLinks(refs);
    const proposed =
      links.accounts["Cash box"] === "new" && links.categories[refs.categories[0].key] === "new";
    links.accounts["Cash box"] = wallet.id;
    links.categories[refs.categories[0].key] = food.id;
    const plan = planImport(records, links);
    const linked =
      plan.ops[0].from === wallet.id &&
      plan.ops[0].category === food.id &&
      !plan.created.accounts.length &&
      !plan.created.categories.length;
    const other = appData.accounts.find((a) => a.currency !== cur) ?? { currency: "EUR" };
    const clash = readRecords(
      readTable(
        [
          HEADER,
          `expense,2026-01-03,5,${other.currency === cur ? "EUR" : other.currency},Cash box,,Snacks,,,,`,
        ].join("\n"),
      ),
      mapping,
      formats,
    );
    const clashPlan = planImport(clash, links);
    return (
      proposed &&
      linked &&
      table.rows.length === 1 &&
      clashPlan.invalid.length === 1 &&
      clashPlan.ops.length === 0
    );
  },
);

check("Without a type column the sign of the amount decides", () => {
  const cur = appData.settings.currency;
  const text = [
    "date,amount,currency,account,category",
    `2026-01-03,-12.5,${cur},Wallet,Food`,
    `2026-01-04,100,${cur},Wallet,Salary`,
  ].join("\n");
  const { plan } = planOf(text);
  return (
    plan.ops.length === 2 &&
    plan.ops[0].type === "expense" &&
    plan.ops[0].amount === 1250 &&
    plan.ops[0].from &&
    plan.ops[1].type === "income" &&
    plan.ops[1].to
  );
});

check("Names from a file that look like object keys are only names", () => {
  const cur = appData.settings.currency;
  const text = [HEADER, `expense,2026-01-03,5,${cur},__proto__,,constructor,,,,`].join("\n");
  const { plan } = planOf(text);
  const protoOk = Object.prototype.polluted === undefined && {}.polluted === undefined;
  return (
    protoOk &&
    plan.invalid.length === 0 &&
    plan.ops.length === 1 &&
    plan.created.accounts[0].name === "__proto__" &&
    plan.created.categories[0].name === "constructor"
  );
});

check("An import that cannot be stored changes nothing", () => {
  const before = appData;
  const [ops, accounts] = counts();
  const { plan } = planOf(csvExample());
  const original = globalThis.Storage.prototype.setItem;
  globalThis.Storage.prototype.setItem = () => {
    throw Error("full");
  };
  let thrown = false;
  try {
    applyImport(plan);
  } catch {
    thrown = true;
  } finally {
    globalThis.Storage.prototype.setItem = original;
  }
  return (
    thrown &&
    appData === before &&
    appData.ops.length === ops &&
    appData.accounts.length === accounts
  );
});

check("A list of text cells is written with formulas protected", () => {
  const text = csvLines([["=1+1", "a,b", 'say "x"']]);
  return text === `"'=1+1","a,b","say ""x"""`;
});

check("A large file is planned within seconds and every row is read once", () => {
  const cur = appData.settings.currency;
  const rows = Array.from({ length: 20000 }, (_, i) => {
    const day = String(1 + (i % 28)).padStart(2, "0");
    const month = String(1 + (i % 12)).padStart(2, "0");
    return `expense,2025-${month}-${day},${(i % 500) + 1}.${String(i % 100).padStart(2, "0")},${cur},Wallet,,Food,row ${i},,,`;
  });
  const started = Date.now();
  const { plan, records } = planOf([HEADER, ...rows].join("\n"));
  const seconds = (Date.now() - started) / 1000;
  return (
    records.length === 20000 &&
    plan.invalid.length === 0 &&
    plan.ops.length + plan.duplicates === 20000 &&
    seconds < 10
  );
});
