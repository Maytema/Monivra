# Credit card model

Monivra is a personal-finance notebook, **not a bank ledger**. A card here is a regular account with
a limit. This page records what was researched, the models compared and why one was chosen.

## Sources (accessed 2026-11-09)

| Source | What it supports |
|---|---|
| https://www.usbank.com/credit-cards/credit-card-insider/credit-card-basics/what-does-available-credit-mean.html | Available credit = limit − current balance. Payments raise it; pending items may lower it before they post. |
| https://www.capitalone.com/help-center/credit-cards/credit-balance-or-overpayment-refund/ | A *credit balance* (negative balance) arises when payments or refunds exceed what is owed. It can be spent against; the issuer refunds it after some billing cycles or on request. Wording differs inside the page itself. |
| https://www.consumerfinance.gov/eregulations/1026-56/2013-12125 (Regulation Z §1026.56) | A card may exceed its limit only if the issuer allows it; a fee for it needs the cardholder's opt-in, one fee per cycle. Going over is therefore a real, issuer-specific state, not impossible. |
| https://support.ynab.com/en_us/credit-cards-with-a-positive-balance-an-overview-By_H6uzJo.md | A personal-finance app treats a card with a positive balance "like a checking account"; refunds and overpayments become ordinary money, and debt tracking resumes when the balance turns negative. |

Issuers differ: when a credit balance is refunded, whether over-limit spending is declined or allowed,
and how pending items count. None of this is a universal rule, so Monivra does not copy one issuer.

## Models compared

1. **Net ledger (chosen).** One stored number `B` (opening + incoming − outgoing, as before).
   Derived on demand: own money `max(0,B)`; credit used `min(max(0,−B), L)`; over limit
   `max(0,−B−L)`; available `max(0,L+B)`; utilization `max(0,−B)/L`, which may pass 100 %.
2. **Two buckets** (own sub-balance + credit sub-balance with a repayment order). Needs stored state
   per account and a rule for what an incoming amount fills first. Editing or deleting an old
   operation then depends on order unless every later operation is replayed. Needs a migration
   that would have to reinterpret old balances. Rejected.
3. **Separate cash account + card account.** Cleanest accounting, but forces the person to manage
   two accounts and to say which one each payment uses; contradicts "no manual allocation".
   Still possible by hand and fully supported (a transfer between them). Rejected as the default.

## Why the net ledger

- Matches YNAB and the issuer pages above: a positive balance is spendable money, a negative balance
  is what is owed, available = limit + balance.
- Own money and used credit can never coexist: money paid in repays used credit first, automatically
  and deterministically, because it is the same number.
- No new stored fields, so **no migration**; old data, backups, CSV imports and op references mean
  exactly what they meant. Changing or deleting any old operation recomputes the parts identically
  to a full replay, in any order (tested in all 24 orders).
- Limit changes and limit 0 move no money: lowering the limit below usage shows over-limit debt;
  limit 0 is a plain account.

## Plain-language rules

- Money that comes in repays used credit first, then becomes your own funds.
- Spending uses your own funds first, then credit, up to the limit.
- Spending past the limit is allowed (negative balances are allowed); it shows as "Over limit by …".
- A refund or a reversed charge is incoming money and follows the same rule; there is no separate
  "correction" type, so deleting the original spend afterwards gives the same result as never
  having made it.

## Not modelled (by design)

Interest, fees, statement cycles, grace periods, pending vs posted items and issuer refund of credit
balances. Over-limit fees under Reg Z are issuer charges; enter them as expenses if they apply.
