# Project Vision and Feature Blueprint

**Working name:** Personal Management Platform — final product name to be decided  
**Document version:** 1.3  
**Created:** October 5, 2026  
**Purpose:** Foundational product document, consolidated from the “Strengthen Tracker Project” brainstorm and refined into a coherent vision and staged delivery plan.

This document describes the intended product, its core behaviors, and its boundaries. It is a starting point for requirements, interface design, data modeling, and development planning. The full vision is larger than the first release; future features are included here so they can be added deliberately without delaying a usable product.

## 1. Product vision

> A modular personal management platform that helps people understand their money, manage obligations, organize job applications, and see upcoming commitments through one dashboard, a connected calendar, and reusable trackers.

The application should help its user answer:

- Where is my money, and what changed it?
- How much did I spend, including interest and transaction fees?
- What do I owe, what is due next, and what have I already paid?
- Which applications need attention, and what is my next interview or assessment?
- What needs my attention today, this week, or this month?
- How has my financial position, job search, or personal progress changed over time?

The defining feature is the connection between modules. A debt installment appears in the calendar, an interview links to its application, and a payment updates the account, debt history, dashboard, and reports together.

## 2. Problem and target users

Personal information is often scattered across wallet apps, bank statements, notes, spreadsheets, calendars, and job boards. Each tool shows only part of the picture. This creates forgotten deadlines, incomplete spending records, unclear debt balances, and lost application histories.

The initial target user is a recent graduate or early-career professional who is job searching, uses several financial accounts, and wants to organize adult responsibilities. The initial real-world user is the project owner. The design should still support other users and institutions without hardcoding personal details.

Users should be able to start with only the modules they need. Someone with no debt or credit card should still have a useful experience.

The completed product must support multiple users, including the project owner, their brothers, and other family members. Each person has a separate sign-in account and private personal workspace from V1. A sign-in account identifies a person; a financial account represents their bank, wallet, or cash balance. Family members use their own identities rather than sharing login credentials.

Users can also join explicitly shared expense groups when that module is released. Being family or belonging to a group does not grant access to each other's salary, private account balances, lender debts, applications, or trackers. Shared expense groups are narrower than shared personal workspaces. General shared workspaces, teams, and delegated access remain later extensions.

Disabling a module hides it from normal navigation without deleting its records; the user can restore it. Explain whether its existing deadlines remain visible and let the user control their reminders separately.

## 3. Product principles

1. **Accuracy and traceability.** Every amount should have an explainable source and history.
2. **Manual entry first.** Actual amounts entered by the user take precedence over estimates or suggested rules.
3. **Connected modules.** Share identity, dates, reminders, tags, and navigation while preserving each module’s business rules.
4. **Provider independence.** GCash, Maya, MariBank, GLoan, SLoan, SPayLater, banks, and personal lenders are configurable names, not separate application models.
5. **Progressive setup.** A user can become productive without completing every configuration screen.
6. **Clear distinctions.** Show actual versus planned, cash versus credit, and expense versus repayment.
7. **Practical scope.** Deliver a useful release before building broad customization or integrations.
8. **User control.** Support corrections, exports, notification preferences, and a replayable guide.

## 4. Product structure

| Area | Responsibilities | Connections |
| --- | --- | --- |
| Money | Accounts, transactions, expenses, fees, debts, credit cards, reconciliation, planning | Due dates, reminders, reports, activity |
| Shared expenses | Family/group bills, participant shares, amounts owed, settlements | Explicit links to private ledgers, group history, reminders |
| Career | Applications, stages, interviews, assessments, follow-ups | Calendar, reminders, reports, activity |
| Time | Agenda, calendar, recurring obligations, deadlines | Links back to source records |
| Trackers | Preset and eventually customizable trackers | Dates, status, reminders, reports where applicable |
| Shared foundation | User settings, categories, tags, history, onboarding, navigation | Used by all modules |

Use specialized finance and career records. Sharing common capabilities does not require forcing every record into a generic tracker schema. Financial balances require stricter validation than a reading list.

## 5. Dashboard

The home screen answers “What needs my attention?” before presenting detailed analytics.

Suggested sections:

- **Financial snapshot:** tracked liquid funds, expenses in the selected period, outstanding liabilities, and upcoming payments.
- **Career snapshot:** active applications, interviews, assessments, and follow-ups.
- **Upcoming agenda:** mixed deadlines ordered by date, with module filters.
- **Attention needed:** overdue obligations, incomplete records, and reconciliation differences.
- **Recent activity:** payments, transfers, application changes, and completed tracker items.
- **Quick actions:** add expense, transfer money, record payment, add application, and create event.

Every summary must explain what it includes and link to the records behind it. Available credit is never included in cash or liquid funds. Net position should be labeled “tracked net position” until all relevant assets and liabilities are included.

## 6. Money module

### 6.1 Financial accounts

An account represents a place where money is held. Initial types are cash, e-wallet, checking/bank, and savings. Investment tracking is a later extension.

Account information includes name, type, optional institution, currency, opening balance and date, calculated balance, active/archived state, and notes. Examples include Cash Wallet, GCash Wallet, Maya Wallet, Maya Savings, and MariBank.

The opening balance establishes the starting point; it is not income. Subsequent balances are derived from recorded financial movements. Archived accounts retain their history. Do not allow deletion of accounts referenced by transactions.

Begin with PHP and one currency per workspace. Preserve currency information in the design, but postpone exchange rates and cross-currency transfers. Do not sum unrelated currencies without conversion.

### 6.2 Transaction ledger

The ledger is the financial source of truth. Expense screens, account histories, and reports are views of these records rather than independent copies.

Supported financial actions should grow to include income, expense, internal transfer, borrowing, financed purchase, debt payment, credit-card purchase/payment, refund, fee, rebate, and balance adjustment.

Each action records relevant accounts or liabilities, amount, currency, effective date, category, description, optional reference, linked fees or adjustments, and creation/change history. Credit cards additionally distinguish transaction and posting dates.

#### Receiving money into a specific account

Every actual receipt of money must identify the user's receiving account. Recording the receipt updates that account's balance automatically through the ledger; the user must not need to edit the balance separately. A sender or income source identifies where the receipt came from, while the receiving account identifies where the money is now held.

Examples, using illustrative account names rather than required providers:

| Receipt | User-entered details | Result after saving |
| --- | --- | --- |
| Salary of PHP 10,000 received into BDO | Type: income; category: salary; source: employer; receiving account: user's BDO account; actual receipt date; amount: PHP 10,000 | If BDO held PHP 2,000, its balance becomes PHP 12,000. Other accounts remain unchanged. Income for the receipt period increases by PHP 10,000, and BDO's history shows the linked salary transaction. |
| Gift of PHP 500 received into GCash | Type: income; category: gift; source: another person; receiving account: user's GCash wallet; actual receipt date; amount: PHP 500 | If GCash held PHP 200, its balance becomes PHP 700. Other accounts remain unchanged. The gift appears in income reports and GCash's history. |

The user selects the actual receiving account for each receipt. Salary is not tied permanently to BDO or any particular bank. An optional saved/default salary account can prefill the form, but remains editable. If the receiving account has not been created, prompt the user to add it before posting the receipt.

Receiving money from another person does not always mean income. Ask for its meaning: a gift is income, borrowed money also creates a debt, a purchase refund offsets spending, and a transfer from another account the user owns moves existing funds. Repayment of money lent uses the later receivables workflow. All supported receipt types increase the chosen receiving account by the amount actually received, while their effects on income, spending, and liabilities follow their respective rules.

If salary is split between accounts, V1 can use separate receipts for each actual deposit, with an optional common reference and amounts totaling the actual salary received. A later split-destination form may capture them together without duplicating total income. Record the actual deposited amount; optional gross salary, deductions, and payslip tracking are future extensions and must not inflate cash received.

Before saving, show a preview such as: “GCash decreases by PHP 5,015; MariBank increases by PHP 5,000; fee expense is PHP 15.”

**Planned records do not change actual balances.** A due installment, expected salary, or recurring bill becomes an actual financial action only when the user records it as received or paid. Pending entries must be visibly excluded from posted balances.

**Transfers may finish on different dates.** V1 assumes an internal transfer has completed and records both sides together. If money has actually left the source but has not arrived at the destination, do not label it as an ordinary unposted plan or completed transfer. A later transfer workflow should represent money in transit, completion, failure, and return, with separate departure/arrival dates and explicit fee refunds. In-transit funds are shown separately from spendable account balances, and movement within owned tracked funds is not income or spending.

For manual tracking, an entry that would make a cash/wallet balance negative should show a warning and allow investigation. Do not silently discard a real transaction because older records are missing. Accounts that genuinely allow overdrafts require an explicit later policy. Negative liquid balances must never appear as available funds.

### 6.3 Expense tracking

Provide categories such as food, transport, housing, utilities, subscriptions, shopping, healthcare, education, entertainment, interest, transaction fees, and other. Users can manage categories and optional tags.

Support search, date filters, account filters, category totals, spending comparisons, and transaction details. A financed purchase counts as spending when recorded; paying its principal later does not create the same expense again.

Support splitting one purchase across expense categories in V1: a PHP 1,000 receipt might contain PHP 700 groceries and PHP 300 household supplies. Category portions must equal the purchase amount, and adding splits must not create another account deduction. Associated fees remain separately identified. Split funding across multiple payment accounts can follow later and must satisfy the same total checks.

### 6.4 Transfers and fees

Moving money between owned accounts does not create income or spending. Associated fees are expenses.

Example: transfer PHP 5,000 from GCash to MariBank with a PHP 15 fee paid from GCash:

- GCash decreases by PHP 5,015.
- MariBank increases by PHP 5,000.
- Total liquid funds decrease by PHP 15.
- Expense reports show PHP 15 in transaction fees, not PHP 5,015 in spending.

Allow multiple fee components with a label, amount, date, and the account or liability bearing the fee. Defaults can simplify entry, but users must be able to represent a fee paid separately or deducted from the received amount. The final preview must reflect the chosen treatment.

Manual fees are the default. Optional saved rules can later suggest values, but must remain editable and cannot claim to represent a provider’s current policy.

### 6.5 Debts and installment obligations

Support personal loans, installment loans, buy-now-pay-later purchases, and flexible credit obligations. Provider/product names are metadata. Their repayment rules can differ.

A debt record can include:

- Lender/provider, product name, debt type, and notes.
- Original principal, start date, and optional linked disbursement or purchase.
- Opening outstanding liability when importing an existing debt.
- Known posted interest, fees, penalties, and adjustments.
- Contractual scheduled amounts and remaining scheduled total.
- Payment frequency, due dates, installment count, and optional manual schedule.
- Actual payments and allocation details where known.
- Status: active, settled, settled early, or cancelled where appropriate.

Track overdue status from unpaid due amounts and dates; retain it independently of the overall lifecycle state.

**Outstanding principal, recognized liability, and future scheduled payable are different figures.** Future interest included in a payment schedule is not automatically a charge already owed in the ledger. If the provider does not supply a principal/interest breakdown, show that limitation instead of inventing one.

For initial debt support, prioritize user-entered provider schedules and actual amounts. Do not implement a universal interest calculator or assume every installment is equal. Use generated schedules only for clearly supported terms, with a preview and rounding adjustment.

Payments can be partial, late, extra, or allocated across multiple installments. A payment and its ledger movement must reference each other so the user does not enter the same payment twice. A partial payment leaves the remaining due amount visible.

Loan proceeds and principal may differ. If a PHP 10,000 loan pays out PHP 9,800 after a confirmed PHP 200 upfront fee, record PHP 9,800 into the receiving account, PHP 10,000 liability, and the PHP 200 fee separately. Borrowed cash is not earned income. Fees added to the debt instead of deducted from proceeds require a different preview; do not deduct them twice.

When a lender changes a schedule, preserve the old version, payments, reason, and effective date. Distinguish a corrected due date from a renegotiated agreement. V1 can support explicit manual revisions with a before/after preview; refinancing and complex restructuring are later workflows. Replacing an old loan with a new one must eventually record settlement and the new borrowing rather than erase the old debt.

### 6.6 Early settlement and adjustments

Allow the user to settle a 12-month obligation during month 6 or any other point. Capture the settlement date, actual payment, provider-confirmed payoff amount, known rebate or waiver, extra fees, and optional reference.

Illustrative case, assuming the entire PHP 6,400 is already recorded as a liability:

| Item | Liability effect | Cash effect |
| --- | ---: | ---: |
| Balance before settlement | PHP 6,400 outstanding | — |
| Settlement payment | Decrease PHP 6,000 | Decrease PHP 6,000 |
| Confirmed interest waiver | Decrease PHP 400 | No cash movement |
| Balance after settlement | PHP 0 | — |

If PHP 6,400 is merely the remaining schedule including unposted future interest, preserve the original schedule and record that PHP 400 of future charges were avoided; do not reverse an expense that was never recorded.

Once confirmed and reconciled, mark the debt settled early and cancel remaining due events and reminders. Keep the original schedule and settlement history visible. A mismatch must be resolved through an explicit charge, waiver, allocation, or correction; never silently force the balance to zero.

Distinguish:

- **Liability waiver/rebate:** reduces an amount already owed, without necessarily adding cash.
- **Cashback received:** increases a specified account when actually received.
- **Purchase refund:** reverses or reduces the original spending and updates the relevant account/liability.
- **Expected cashback:** remains pending until received.
- **Correction:** fixes a record with a reason and retained history.

The same benefit must not be recorded both as a debt reduction and as cash received unless both actually occurred.

Allow partial refunds and multiple refund events linked to one purchase. Show gross spending, refunds, and net spending separately. The default actual-period report records a refund when it occurs, even if the purchase was in a previous period; an optional purchase-level effective-cost view can combine the linked records. Define cashback as either a linked spending offset or separately labeled reward income, based on its meaning, and apply that choice consistently. Never treat the same cashback as both.

### 6.7 Credit cards

Credit cards are liability accounts with their own billing workflow. They are part of the full vision and a dedicated later release.

Track issuer/name, credit limit, outstanding posted balance, available credit estimate, statement cycles, statement balance, remaining statement amount due, minimum due, due date, payments, fees, interest, refunds, and optional installment plans.

Keep these concepts distinct:

- **Transaction date:** when a purchase occurred.
- **Posting date:** when the provider posted it.
- **Statement period/date:** which billing cycle includes it.
- **Outstanding balance:** all recognized unpaid card activity.
- **Statement balance:** the fixed balance recorded for a closed cycle.
- **Remaining statement amount due:** that cycle’s amount still unpaid after applicable payments and credits.

Purchases increase spending and card liability. Card payments reduce cash and liability without repeating the purchase expense. Interest and fees are separate expenses. Refunds reduce liability or create a card credit and link to the original purchase when possible.

Use manually verified statement values initially. Do not assume that payment allocation, interest, minimum payment, or available-credit rules are identical across issuers. Clearly label app-calculated values as estimates where provider behavior can differ.

Utilization can be shown as outstanding balance / credit limit × 100, with the balance date identified. Handle a missing/zero limit without dividing by zero. Aggregate utilization uses total eligible balances divided by total eligible limits, not the average of card percentages. Card overpayments should appear as credits rather than negative debt.

### 6.8 Reconciliation and corrections

Let users compare an app balance against an actual account or provider statement at a chosen date. Show the difference and allow investigation of missing entries or duplicates.

If the user chooses a balance adjustment, require an amount, date, and reason. Show adjustments separately in reports; an unexplained correction is not automatically income or expense.

Posted financial records should be corrected with traceable revisions or reversals. A simple audit trail is sufficient initially; a complex event-sourcing system is unnecessary. Backdated corrections must update affected balances and reports consistently.

### 6.9 Planning and recurring obligations

Later planning features include category budgets, expected cash flow, recurring income/bills, subscriptions, and savings goals or sinking funds.

Recurring definitions create expected occurrences. Completing one records or links an actual transaction; merely reaching its due date must not assume it was paid. Support skipped occurrences and changes to one occurrence versus future occurrences.

A savings goal reserves part of tracked money conceptually. It must not create a second asset or duplicate the account balance. Show goal allocations separately from physical account balances and prevent allocating the same funds beyond the allowed total.

Cash-flow projections should identify their assumptions and expected dates. They remain separate from actual reports.

For monthly recurrence on the 29th, 30th, or 31st, offer an explicit rule such as the last valid day in shorter months. Do not automatically move a provider due date for weekends or holidays without a confirmed rule. Users should see the next few occurrences before saving a recurrence.

### 6.10 Optional future financial extensions

Money lent to another person is a receivable, distinct from money owed to a lender. A future lending tracker should record cash given, outstanding receivable, repayments, and any explicit write-off. Repayment of lent principal is not earned income. Exclude untracked or uncertain receivables from available cash, and identify whether they are included in tracked net position.

Other future extensions can include employer reimbursements and manually tracked noncash assets. Each needs its own reporting rules before inclusion. Group shared expenses are a required completed-product module described below.

### 6.11 Shared expenses and settlements: Splitwise / Settle Up reference

Build a shared-expense and settlement system inspired by **Splitwise** and **Settle Up**: record who paid, split costs among participants, show who owes or is owed money, and record repayments. This is a separate debt-management workflow from lender loans, interest-bearing installments, and credit-card statements.

Product references: [Splitwise](https://secure.splitwise.com/), [Settle Up](https://settleup.io/), and [Splitwise's debt simplification explanation](https://kb.splitwise.com/balances-and-expenses/what-is-simplify-debts). These identify the inspiration; the requirements below describe this project's intended behavior rather than promise feature parity with either service.

#### Groups and privacy

- Create groups such as Family Household, Brothers, Vacation, or Shared Apartment. A two-person group can cover a one-to-one shared bill.
- Invite registered users through a controlled invitation they accept. Group membership does not expose unrelated private data.
- Optionally add a nonregistered participant by display name. They have no private ledger or automatic notifications; their entries are explicitly marked as manually recorded. Linking them to a real user later requires acceptance and balance review, not a name-only identity match.
- Define owner and member roles. Owners manage membership/settings; members record and review permitted group activity. Group owners cannot inspect private accounts or act as platform administrators.
- Members see group expense and settlement history, with this visibility explained on joining. Shared receipts and comments must contain information appropriate for the group.
- Leaving/removing a member preserves history and does not forgive balances. Define read-only historical access for former members and prevent new activity under their membership. Archive completed groups rather than erase history.

#### Bills and allocations

A shared expense includes group, description, date, currency, total, payer contributions, selected participants, each person's share, category, notes, optional receipt, creator, and change history.

Start with one payer and equal or exact custom splits. Later add multiple payers, percentages, weighted shares, and itemized allocations. The payer need not consume a share, and not every group member must participate in every bill.

Total paid and total allocated must each equal the expense total. Use exact centavos and preview rounding: PHP 100 divided three ways becomes PHP 33.34, PHP 33.33, and PHP 33.33 with an identified recipient of the extra centavo. Start with PHP-only groups. Bill fees can be shared or assigned explicitly.

Show amounts paid, shares consumed, settlements, and remaining net position per person. Group net balances must sum to zero. Distinguish category splits within one purchase from participant splits across people.

#### Family example and private financial integration

You pay PHP 1,200 from GCash for dinner with two brothers, split equally:

1. Your share is PHP 400; each brother's share is PHP 400.
2. When you explicitly link the bill to your GCash account, cash decreases by PHP 1,200, personal spending is PHP 400, and a group receivable of PHP 800 is recorded.
3. Each brother has a PHP 400 group payable. If they accept/post their allocation into their own ledger, personal spending increases by PHP 400 but cash remains unchanged until payment.
4. When one brother pays you PHP 400 and the settlement is confirmed and linked, his chosen payment account decreases by PHP 400 and your chosen receiving account increases by PHP 400. His payable and your receivable decrease; neither person records another dinner expense or salary/gift income.
5. The other brother still owes PHP 400. If he pays PHP 150, his remaining balance is PHP 250.

Group records never reveal personal account balances or bank details. Each user privately selects their own accounts. Adding a group bill must not automatically write into another user's ledger: they accept their allocation or use the group module independently of personal tracking. Reports disclose pending/unlinked allocations instead of implying complete personal coverage.

Link an existing private purchase/payment rather than deducting it again. If the full bill was previously personal spending, conversion to a shared bill explicitly reclassifies others' shares into receivables with a preview and history. Group payables/receivables must not be duplicated as standalone personal loans. Cash advanced for the group differs from one's own spending, and receivables are not spendable cash.

#### Settlements and disputes

A settlement records payer, recipient, amount, date, group, optional reference, allocations, and state: proposed, confirmed, disputed, or reversed. A suggested settlement is not a payment. The application records payments made elsewhere; it does not execute bank/wallet transfers.

For registered participants, reported payments remain pending until the recipient confirms receipt. Pending/disputed settlements do not reduce confirmed group balances. The payer can record cash actually sent privately before confirmation, held pending allocation so confirmation does not deduct it again. The recipient records actual receipt when appropriate. Manual confirmation involving nonregistered participants must identify who confirmed it and its verification limitation.

Allow partial repayments. Overpayments preview the resulting reverse balance or advance instead of silently zeroing the debt. A settlement transfer fee is the payer's own expense unless a separately agreed group allocation shares it.

Initially only the expense creator revises their bill; owners can flag disputes or propose corrections rather than silently rewriting others' entries. Edits retain before/after values and notify affected registered members. Changes to settled bills require explicit corrections. Disputed amounts remain visible, with automatic settlement prompts paused for those amounts.

A shared purchase refund reverses the applicable participant shares. If participants already settled, the correction can create amounts owed back; show those balances rather than erase prior payments.

#### Optional settlement simplification and improvements

Later, offer fewer-payment settlement suggestions within an agreed group. For example, if A owes B PHP 300 and B owes C PHP 300, suggest A paying C PHP 300 while preserving all three net positions. Explain the calculation and obtain involved members' agreement before applying redirected allocations.

Suggestions do not rewrite original bills. Keep the settlement allocations that discharge intermediate obligations. Never simplify across unrelated groups, currencies, private loans, or disputed records. Do not promise the mathematically fewest payments unless the chosen algorithm guarantees it.

Prioritize explainable balances, payment confirmation, private ledger linking, explicit fee allocation, contextual tutorials, group reports, and member-controlled reminders. The dashboard distinguishes lender debt, card balances, group payables, and group receivables. Family membership does not imply collective ownership of all money.

## 7. Financial accuracy rules and examples

These are product acceptance rules to preserve through later implementation:

| Action | Spending effect | Cash/liquid-fund effect | Liability effect |
| --- | --- | --- | --- |
| Receive salary PHP 25,000 | None; income PHP 25,000 | +25,000 | None |
| Spend PHP 250 from wallet | +250 | −250 | None |
| Transfer PHP 5,000 with PHP 15 fee | +15 | −15 overall | None |
| Borrow PHP 10,000 into bank | None; borrowing is not earned income | +10,000 | +10,000 |
| Buy PHP 6,000 using credit | +6,000 | No immediate cash movement | +6,000 |
| Pay PHP 1,000 principal plus PHP 100 newly recorded interest and PHP 10 fee | +110 | −1,110 | −1,000 net |
| Repay PHP 1,100 of liability whose interest was already recorded, plus PHP 10 fee | +10 | −1,110 | −1,100 |

Debt-payment summaries may include principal and interest for visibility, but report totals must not add that entire payment to expenses again. Report labels should make overlap explicit.

Use exact monetary arithmetic, such as integer centavos or fixed-decimal values, with defined rounding. Save all parts of a financial action together or none of them. Repeated submissions must not create duplicate transfers or payments. Validate ownership of every linked account, debt, and transaction.

An existing loan imported at setup contributes an opening liability, not new income, spending, or borrowing during the reporting period. Historical installments already paid must not become new payments or reminders.

## 8. Career module: job applications

Store company, role, posting URL, source, application date, location, work arrangement, optional salary range/currency, technologies, contact details, resume version, notes, and next action/date. Saved opportunities should be distinct from submitted applications.

Suggested stages: Saved, Applied, Screening, Interview, Technical Assessment, Final Interview, Offer, and Accepted. Rejected and Withdrawn are terminal outcomes. Allow skipped stages, repeated interviews, and changes supported by history; companies do not all use one fixed pipeline.

Provide a searchable table and, later, a board view. Each application has a timeline of submissions, responses, stage changes, interviews, assessments, follow-ups, and outcomes. Stage history retains the event date and the time it was entered.

Interviews and assessments include scheduled time, location/link, preparation notes, and completion outcome. Follow-up suggestions should be configurable. “No response” is a dated observation, not an automatic rejection.

Store a user-entered snapshot of the role description or key requirements because a posting URL can expire. Resume versions should identify the exact version used, not only the latest resume. Treat a later application to the same company/role as a separate attempt when appropriate; offer a duplicate warning without assuming it is an error. Explicitly support declining an offer, an expired offer, and an employer-cancelled opening as distinct outcomes. Save actual dates rather than infer them from the current stage.

Analytics can include applications submitted, responses, applications reaching interviews, offers, rejections, time in stage, and results by source. Separate the number of interview events from the number of applications interviewed.

Conversion reports must define the cohort: for example, applications submitted in September that have received a response as of October 5. Do not divide this month’s offers by this month’s interviews if they belong to different applications. Use “not applicable” for an empty denominator.

## 9. Calendar, timeline, and reminders

### Calendar and agenda

Combine debt due dates, card due dates, bills, interviews, assessments, follow-ups, tracker deadlines, and manually created personal events. Start with an agenda, then add month/week views and filters.

Each generated event links to its source. Rescheduling an interview or installment updates its calendar representation without creating a duplicate. Editing a generated event routes through the source workflow. Completed, cancelled, and overdue events have clear states.

Treat all-day due dates as dates, not midnight timestamps that shift across time zones. Timed events use the user’s timezone, initially Asia/Manila. History timelines show what happened; the calendar primarily shows what is scheduled.

### Reminders

Allow per-event reminders, optional module defaults, and settings such as seven days before, one day before, or on the due date. Begin with in-app due/overdue indicators. Scheduled email or push delivery belongs to a later phase with explicit opt-in and delivery status.

Support dismissing, snoozing, and disabling reminders. Source changes must reschedule or cancel reminders. Retried deliveries must not duplicate notifications. An overdue debt reminder stops when the relevant unpaid obligation is resolved.

Notification settings should include timezone, quiet hours for external delivery, and whether amounts or company names may appear on a device notification. Dismissing a reminder does not mark a debt paid or an interview completed. Calendar conflicts may be flagged for timed events, but the application must not reschedule them automatically.

External calendar integration is future work. Define its permissions, synchronization direction, conflict handling, and deletion behavior before implementation.

## 10. Generic tracker templates

Templates extend the platform to learning, books, personal tasks, goals, and other structured activities. A template defines fields; a tracker is a user’s instance of that template; entries contain its records.

Begin with preset templates before building a general template editor. Initial field types can be text, number, date, checkbox, and single-select status. Templates can mark fields required and identify a primary title, status, and deadline field for shared views.

Examples:

| Template | Example fields | Behavior |
| --- | --- | --- |
| Learning | Topic, technology, status, started/completed dates, notes | Progress and deadline view |
| Books | Title, author, rating, finished, completion date | Reading list and completed count |
| Personal tasks | Title, priority, status, due date | Calendar and reminders |
| Habits, later | Habit, frequency, target, dated check-ins | Needs actual check-in history for streaks |

Financial subscriptions belong to recurring obligations. A template may link to them later, but must not maintain a competing financial balance. Likewise, the specialized application tracker remains authoritative for job pipelines.

User-created templates, custom fields, richer relations, and template sharing are later extensions. Editing a template must preserve existing entries or provide an explicit migration; removing a field must not silently discard data. Arbitrary formulas, scripting, and a Notion-style page builder are outside the initial scope.

## 11. Reports

Use one period-based reporting system for **weekly, monthly, quarterly, yearly, and custom date ranges**. Initially use calendar quarters, a configurable week start, and the user’s timezone.

### Financial reports

Include income, recognized expenses, category breakdowns, fees/interest/penalties, refunds/rebates, external cash inflows/outflows, borrowing, debt payments, opening/closing tracked liquid funds, liability changes, and tracked net position. Later add budget comparisons, card utilization, savings-goal progress, and forecasts.

Separate spending from cash flow: a card purchase affects spending today but cash later; borrowing affects cash but is not income. Internal transfers are shown for reference and excluded from consolidated cash-flow totals.

Reconciliation identity for tracked liquid funds:

`Closing funds = Opening funds + External cash inflows − External cash outflows + Explicit balance adjustments`

Internal transfers cancel in the combined total. Fees remain external outflows. “Income minus expenses” must not be labeled cash flow when financed purchases, borrowing, or principal repayments are present.

Illustrative cash-flow report, with categories deliberately separated:

| Item | Amount |
| --- | ---: |
| Opening liquid funds | PHP 24,500 |
| Salary received | +PHP 30,000 |
| Cash spending excluding debt costs and fees below | −PHP 12,400 |
| Debt principal repaid | −PHP 4,500 |
| Debt interest paid and newly recognized | −PHP 500 |
| Transaction fees | −PHP 185 |
| Net cash change | +PHP 12,415 |
| Closing liquid funds | PHP 36,915 |

In this example, recognized expenses total PHP 13,085; principal repayment is excluded. Actual reports must also account for any credit purchases, borrowing, noncash changes, and adjustments present.

### Career and tracker reports

Summarize application activity, cohort conversion rates, upcoming actions, completed learning topics, and eligible tracker counts. A yearly personal review can combine financial trends, career milestones, and goals without pretending unrelated metrics share one scoring system.

Show date range, filters, currency, data coverage, calculation definitions, and an “as of” time. Missing history should be disclosed. Link totals to detail records. Start with on-screen reports and CSV export; printable/PDF reports can follow.

## 12. Onboarding and tutorial experience

The finished application should teach users how to use it, beginning with their goal rather than a tour of every button.

### First-use setup

1. **Choose a starting goal.** Track money, organize job applications, or both. Explain that other modules can be enabled later.
2. **Confirm preferences.** Choose timezone, currency, week start, and optional reminder settings.
3. **Add the first account, if using Money.** Enter its current balance and the date that balance represents. Explain why this is an opening balance rather than income.
4. **Record one real transaction.** Enter an expense or income and inspect the before/after balance. Offer a transfer-with-fee example as the next lesson.
5. **Add existing debt, optionally.** Enter remaining liability, known schedule, and next unpaid due date. Do not require full historical reconstruction.
6. **Add a credit card, when supported and applicable.** Explain outstanding versus statement balance and capture the latest verified statement.
7. **Add one job application, if using Career.** Record company, role, stage, and the next action. Add an interview or follow-up date.
8. **Review the agenda.** Show how records automatically produce deadlines and how to open the original record.
9. **Choose reminders.** Explain the difference between in-app alerts and optional external notifications.
10. **Review the dashboard and first report.** Explain that reports become more useful as actual records accumulate.
11. **Explore optional trackers and planning tools.** Introduce these only after the core workflow is understood.

When shared expenses are released, add a guided flow: create/join a group → review privacy → record a bill → choose payer/participants → preview shares → review balances → record/confirm settlement → optionally link your own account. Joining a group never requires sharing the personal workspace.

Users can skip optional steps, save progress, and resume later. Career-only users bypass financial setup. Features not yet released must not appear as required onboarding steps.

### Ongoing guidance

- A “Getting started” checklist remains available until completed or dismissed.
- Empty states show the next useful action and a short example.
- Contextual help explains fees, transfers, partial payments, statements, and reconciliation.
- A Help/Guide area provides short task-based instructions and a replayable tour.
- An optional demo workspace uses isolated sample data, clearly labeled, with a safe reset that affects only demo records.
- Destructive or consequential actions explain their effect before submission, especially settlement and financial corrections.

### Suggested routine

**Daily:** record spending, update applications, and review upcoming commitments.  
**Weekly:** reconcile accounts, review follow-ups, and check the weekly report.  
**Monthly:** verify obligations/statements and review financial and career trends.  
**Quarterly/yearly:** review progress and adjust goals using the available history.

## 13. Main screens

Primary navigation: Dashboard, Money, Career, Calendar, Trackers, Reports, and Help/Settings. Group related pages inside modules to avoid an oversized sidebar.

Shared Expenses is a Money submodule with a group list, group details, bill entry, member balances, settlement history, invitations, and group settings. Group reports show total bills, individual shares, advances, confirmed repayments, and remaining balances; personal reports include only that user's posted private-ledger effects. Group and personal totals must not be summed as though they were separate spending.

Money pages include accounts, ledger, transaction detail/entry, debts and schedules, reconciliation, and later cards, budgets, goals, and recurring obligations. Career pages include the application list, application details/timeline, and analytics. Reports share consistent period and filter controls.

Prioritize a responsive interface suitable for entering an expense or updating an application on a phone. Use readable labels, keyboard-accessible forms, visible validation, and status indicators that do not rely only on color.

Include visible saving/saved/failed states and preserve recoverable form input after an error. The initial product is an online web application. If a connection fails, show that an action has not been confirmed; do not imply it is safely stored. Offline entry, device synchronization, and installation as a PWA are optional later work with explicit conflict and duplicate handling.

## 14. Scope and delivery sequence

The full vision is a roadmap, not a commitment to implement everything before launching.

| Stage | Deliverable | Release boundary |
| --- | --- | --- |
| First usable slice | Sign-in, settings, accounts, income/expense/transfer with fees, account history, basic application list/stages, agenda, short onboarding | Reliable daily tracking for money and job search |
| V1: coherent core | Debts with manual schedules, partial payments and explicit settlement/adjustments, reconciliation, connected dashboard, period reports for all requested intervals, in-app due indicators, history, CSV export | Complete core workflows with financial accuracy and user separation |
| V2: financial maturity | Credit cards/statements, recurring obligations, budgets, savings goals, forecasts, richer career analytics, scheduled opted-in notifications | Card and planning workflows verified with realistic cases |
| V2 companion release: family shared expenses | Accepted invitations, equal/custom splits, one payer, balances, partial settlements, confirmation/history, private ledger links | Family users complete a shared bill and repayment without exposing private data or duplicating spending |
| V3: adaptable trackers | Preset trackers, then user-created templates/custom fields, richer tracker reporting, calendar integration | Existing records survive customization and synchronization changes |
| Later, selectively | Receipt OCR, suggested categorization, import integrations, investments, multiple currencies, shared workspaces, annual-review exports | Added only for a demonstrated user need and supportable accuracy |

Tutorials and contextual guidance evolve with each release. They are part of the product, not a final task after all features are built.

Initially defer automatic provider fee lookup, bank connections, payment execution, automatic loan settlement calculations, credit scoring, AI financial recommendations, collaborative editing, and a fully general no-code builder. The app records and organizes information; executing bank payments is a separate future product decision.

Additional release boundaries: V1 includes separate sign-in accounts/private workspaces for multiple users, category splits, loan net-disbursement entry, manual schedule revisions, recovery, and account/data lifecycle controls. V2 can add supporting-file uploads, CSV imports, and portable workspace export/restore. The shared-expense release includes the group receivables/payables needed for its ledger integration; general standalone lending, multiple payers, richer split methods, and settlement simplification follow later. Transfers in transit, refinancing, split payment sources, and offline synchronization remain later features. Core refund/correction rules apply when the corresponding transaction type is released. Shared expenses are required in the completed product, even though staged after V1.

## 15. Conceptual model and engineering boundaries

Potential concepts, to refine in a separate data-model document:

- **Shared:** User, Preferences, Category, Tag, Activity, Reminder.
- **Group expenses:** ExpenseGroup, Membership, Invitation, Participant, SharedExpense, PayerContribution, ParticipantShare, GroupSettlement, SettlementAllocation, PrivateLedgerLink, Dispute.
- **Money:** Account, FinancialAction, LedgerEntry, Adjustment, Reconciliation.
- **Debt:** Debt, ScheduledInstallment, PaymentAllocation, Settlement.
- **Cards:** CreditAccount, Statement, StatementEntry, PaymentAllocation.
- **Planning:** RecurringObligation, ExpectedOccurrence, Budget, SavingsGoal, GoalAllocation.
- **Career:** JobApplication, StageHistory, ApplicationEvent.
- **Time:** PersonalEvent and calendar projections from source records.
- **Trackers:** TrackerTemplate, FieldDefinition, Tracker, TrackerEntry.

A debt payment is one financial action linked to its allocations, not two separate records both deducted from cash. The calendar projects source dates rather than independently owning another copy of each deadline. Financial history and general activity history serve related but distinct purposes.

Begin with one application divided into clear modules and one transactional database. A modular monolith is sufficient; microservices are unnecessary for this scope. Select the implementation stack in a later decision based on existing skills, deployment constraints, and target roles rather than adding unfamiliar tools to every layer.

## 16. Quality, privacy, and trust

- Isolate each user’s data and validate access to linked records, reports, and exports.
- Validate group membership and role permissions separately from private-record ownership, including files, notification recipients, exports, and invitations. Changes to group membership must revoke inappropriate access.
- Use secure authentication and session handling; never collect bank passwords, wallet PINs, or full card credentials for manual tracking.
- Protect sensitive data in transport and storage; keep private financial/contact data out of ordinary logs and public demo data.
- Retain an explainable correction history while supporting intentional user data deletion under a defined retention policy.
- Back up data and verify restoration; allow practical exports and clear explanations of their coverage.
- Validate amounts, required fields, dates, currencies, allocation totals, and duplicate requests.
- Handle missing provider details visibly rather than guessing.
- Use confirmations for consequential actions and clear recovery paths for ordinary mistakes.

### Account lifecycle and data ownership

Support registration, sign-in, sign-out, and a secure recovery path appropriate to the selected sign-in method. Users should be able to update their profile and revoke active sessions. Authentication details can be chosen later, but losing access must have a defined recovery experience.

Separate archiving from deletion. Archived applications and trackers retain their history. Financial corrections retain linked evidence; ordinary record removal must not leave orphaned calendar events or reminders. Whole-workspace deletion requires an explicit scope preview, confirmation, and a stated policy covering retained backups and eventual expiry. Do not promise immediate removal from every backup if that is not how the product works.

### Imports, exports, and restoration

V1 CSV exports should clearly state which records and fields they contain. A report export is not a complete backup. A later portable workspace export should cover the supported records, relationships, template definitions, and version information needed for restoration, with attachment handling clearly stated.

CSV import should begin with supported formats and a preview showing field mappings, date/currency interpretation, totals, invalid rows, and suspected duplicates. Do not guess ambiguous date formats or overwrite existing data silently. Show imported, skipped, and failed counts; retrying the same import must not duplicate confirmed records. Starting with opening balances and importing history also requires a cutoff rule so past transactions are not counted twice.

Restoring a workspace must preview whether it creates a separate workspace or replaces existing data. User-controlled restoration and service disaster recovery are different workflows, both requiring verification.

### Supporting records and attachments

V1 can store notes and reference links. Later allow receipts, provider statements, settlement confirmations, resume versions, and assessment documents to attach to their source record. Restrict file types/sizes, enforce private access, and define retention/export behavior. Do not expose a private file through a public link by default. Uploaded files supply evidence; they do not automatically change balances or application stages.

### Operational expectations

Define measurable performance and storage limits before launch, using a realistic multi-year personal dataset. Large histories need search, filtering, and pagination. Expose actionable failure messages and a support/feedback route. Report generation and reminder failures must be detectable without logging sensitive contents. Agree on backup frequency and recovery expectations before storing real user data.

## 17. Acceptance scenarios

Before considering the coherent V1 complete, verify that a user can:

1. Start with two accounts, record a transfer with a fee, and see consistent balances and fee-only spending.
2. Record income and expenses, then reconcile the app with an actual balance using an explainable correction.
3. Import an existing debt without duplicating historical borrowing or payments.
4. Record partial and full debt payments without double-counting principal as spending.
5. Settle a debt early, preserve its schedule/history, handle a confirmed waiver appropriately, and remove future unpaid reminders.
6. Track an application through multiple interviews and create calendar events without duplicate source records.
7. View weekly, monthly, quarterly, and yearly reports using the same definitions and inspect supporting details.
8. Complete or skip onboarding, resume it, and replay relevant help without creating unintended data.
9. Correct a backdated entry and see affected balances and reports update together.
10. Access only their own records, including when attempting to reference another user’s account or application.

11. Split a purchase between categories while preserving one financial deduction and correct report totals.
12. Record loan proceeds net of an upfront fee without labeling borrowing as income or duplicating the fee.
13. Revise a debt schedule while retaining previous terms and payment history and updating future reminders.
14. Recover access through the supported sign-in recovery workflow and revoke an existing session.
15. Disable and re-enable a module without losing its records, and review the stated scope before workspace deletion.
16. Encounter a failed save without receiving a false success message or duplicating the action on retry.
17. Record PHP 10,000 salary into a selected BDO account with an opening balance of PHP 2,000 and see PHP 12,000 in that account, PHP 10,000 additional period income, and no changes to other accounts.
18. Record a PHP 500 gift into a selected GCash wallet with PHP 200 and see PHP 700 there, with a linked gift income record. Recording borrowed money instead must increase that wallet and the debt without increasing earned/gift income.

For the credit-card release, additionally verify purchase, statement closure, partial payment, refund, fee, overpayment, and installment behavior. For generic trackers, verify field validation and preservation of existing entries after template changes.

For later imports and portability, verify ambiguous-date handling, duplicate detection, historical balance cutoffs, and restoration of relationships. For supported refunds, verify that a later-period partial refund changes that period's refund totals while preserving the original purchase history.

For the family shared-expense release, verify:

1. Two family users have independent logins; neither can read the other's private data even when they share a group.
2. The PHP 1,200 dinner example produces PHP 400 shares, PHP 800 receivable for the payer, and consistent cash/spending without duplicate ledger records.
3. Partial, pending, confirmed, disputed, reversed, and overpaid settlements preserve explainable balances.
4. Nonregistered participants have clearly marked manual history and cannot be silently merged into a real user's identity.
5. Rounding, refunds, corrected settled bills, and leaving a group preserve history and zero-sum group net balances.
6. When simplification is released, suggestions preserve individual net positions and original bills and do not apply without agreement.

## 18. Success and portfolio value

Product success means the owner can use the application in daily life, explain balances and reports, identify next actions, and keep using it without relying on scattered notes for the same workflows. Measure onboarding completion, repeat usage, reconciliation differences, and whether due items are resolved; set numeric targets after an initial usage period.

The portfolio should demonstrate coherent business rules, relational data modeling, transactional consistency, authorization, validation, date handling, reporting, and useful interface design. A small deployed product with realistic demonstration data and verified workflows is more useful than a long list of unfinished modules.

Build in focused sessions alongside job applications. Each session should end with a concrete result: a workflow, a corrected rule, a reviewed screen, or a meaningful verification. Defer a feature when it prevents the next usable release.

## 19. Decisions to make next

1. Choose the first usable slice and its exact user stories.
2. Define report terminology and the treatment of known versus unposted interest.
3. Decide which debt types and schedule behaviors V1 supports explicitly.
4. Design account, transaction, debt-payment, application, and agenda screens.
5. Create the data model and financial invariants before implementing balances.
6. Select the stack, hosting, authentication approach, and backup strategy.
7. Create a development backlog with acceptance criteria and a small release boundary.

### Remaining product decisions

The blueprint can be used as a foundation now, but these choices should be resolved before their affected workflows are built:

| Decision | Proposed starting position | What must be confirmed |
| --- | --- | --- |
| Expense recognition and reports | Record spending at purchase/charge; report actual cash movement separately | Detailed rules for interest recognition, cashback, and corrections |
| Debt coverage | Manual provider amounts/schedules with known allocations; explicitly show unknown breakdowns | Supported debt types and handling of payments without a breakdown |
| Financial changes | Traceable corrections with reasons | Which posted fields can be revised directly versus reversed |
| Reminder delivery | In-app indicators first; external delivery opt-in later | Channels, overdue cadence, quiet hours, and delivery expectations |
| Historical setup/import | Opening balances as of a chosen cutoff date | Whether earlier history is imported and how it avoids duplication |
| Account/data lifecycle | Separate sign-in and private workspace per family user; explicit group sharing only | Recovery method, deletion retention, backup/restore scope, preservation or anonymization of shared history on user deletion |
| Shared expenses | One payer, equal/exact splits, confirmed settlements, explicit private-ledger linking | Invitation/role policies, historical access, disputes, and private-ledger correction behavior when group records change |
| Uploads and growth | Notes/links first, private uploads later | Supported formats, file limits, dataset targets, and costs |

These are open design choices, not promises that every option will be supported. Record their final decisions in the relevant requirements before implementation.

The intended result is one connected personal workspace that grows with the user—from job searching and everyday spending to managing credit, recurring responsibilities, and long-term goals.
