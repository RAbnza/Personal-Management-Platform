# V1 CSV export contract

Schema version **1**, calculation definition **`v1-reports-signed-cohort-1`**. These are owner-scoped record/report snapshots, **not a complete workspace backup or a restoration format**. No attachments, passwords, sessions, full audit archive, or future modules are exported. CSV import is not released.

## Requests and periods

Authenticated `GET /api/v1/exports/{kind}.csv`, where kind is `transactions`, `debt-schedules`, `debt-payments`, `applications`, or `report`. Reports use `/api/v1/reports/financial`, `/career`, and `/contributions`; on-screen views live under `/reports`.

All use the same server-side period service: `period=week|month|quarter|year|custom`. Standard periods optionally accept `anchorDate=YYYY-MM-DD`; the default anchor is workspace today. Weeks honor workspace week start; quarters and years are calendar periods. Custom ranges require `startDate` and `endDate`, inclusive, at most 366 days. Mixing an anchor with custom dates, supplying custom dates with a standard period, reversed ranges, invalid/duplicate/unknown parameters, and client ownership parameters are rejected. `asOfDate` is an optional Career effective-observation cutoff, no later than workspace today; it does not filter financial effective dates or reconstruct past database knowledge.

Each export reads authoritative sources in a scoped read-only REPEATABLE READ transaction. SQL statement timeout is 10 seconds; preparation is capped at 30 seconds, 10,000 data rows and 10 MiB including metadata. Oversize/failure requests return a problem response before any successful download. CSV is generated with streaming `csv-stringify`, bounded before response, then streamed to the browser in chunks. No CSV object/file is retained on the server. A subsequent request creates a fresh snapshot and may observe a different revision.

## Format and repeated manifest columns

UTF-8 with BOM, quoted fields, CRLF records. Null values are empty fields, distinct from supplied zero. UUIDs identify sources. Calendar dates are ISO `YYYY-MM-DD`; recorded/generated instants are ISO UTC. Monetary columns ending `_minor` are exact signed integer **centavos**, never floating point. `_decimal` columns have exactly two decimal places and are derived with integer arithmetic. Parse exact monetary fields as decimal strings/integers, not JavaScript Number or spreadsheet floating point.

The first row has `record_type=manifest`, including when there are no records. Manifest values repeat on every data row. `row_count` excludes the manifest. Empty data columns on the manifest are intentional.

| Column | Meaning |
| --- | --- |
| `export_run_id`, `export_kind`, `schema_version`, `definition_version` | Export identity, selected contents and calculation/schema versions |
| `period_start`, `period_end_inclusive`, `period_end_exclusive` | Shared calendar-date boundaries; queries use `[start, end_exclusive)` |
| `as_of_date`, `date_basis`, `filters_json` | Career cutoff, source date semantics, validated period/scope filters |
| `currency`, `timezone`, `generated_at`, `financial_revision` | Snapshot currency, workspace timezone, generation instant and financial source revision |
| `row_count`, `coverage_json` | Data row count and financial coverage/opening cutoffs; unsupplied history remains unknown |
| `scope`, `text_sanitization` | Contents limitations, numeric/text interpretation and retention |

Untrusted text beginning with a spreadsheet formula marker (`=`, `+`, `-`, `@`, tab or carriage return) is apostrophe-prefixed by `csv-stringify`. Quotes, commas, newlines and Unicode are otherwise preserved. Only allowlisted numeric columns containing validated numeric strings bypass formula escaping, so negative money stays exact. Interpret the apostrophe in those text fields as spreadsheet sanitization, not original source text.

Completed preparation creates immutable owner-scoped `ops.export_run` provenance linked to a completed command receipt, with filters, generated timestamp, financial revision, row count and coverage. It does **not** increment the financial revision or post money. The history window is 30 days; the next prepared export prunes expired provenance in that workspace. Inactive workspaces can retain older metadata until their next export; there is no background purge promise. “Completed/prepared” confirms generation, not receipt by the browser. Files are not retained for redownload. Command/audit retention remains the existing core policy.

## Contents and query grains

### Transactions / postings

`record_type=posting`, **one immutable posted posting per row**, selected by journal effective date. Columns: `posting_id`, `action_id`, `action_revision_id`, `journal_id`, `ledger_account_id`, `effective_date`, `amount_minor`, `ledger_kind`, `ledger_name`, `description`, `category_id`, `category`, `journal_role`, `revision_no`, `action_kind`, `expense_class`, `income_class`, `cash_flow_kind`, `cash_flow_direction`, `liability_component`, `classification_posting_id`, `classification_revision_id`, `source_amount_minor`, `charge_kind`, `payment_disposition`, `debt_linked`, `waiver`, `transfer_source`. Classification/source columns identify original economic meaning on reversal rows; `charge_kind` identifies fee/interest/penalty costs, and separate payment/waiver flags preserve the principal and liability lenses.

Original, reversal and replacement evidence is included. Sum signed classified postings; reversal classifications are inherited from original evidence. Journal/posting rows are not additional business actions. Income is the negative signed total of non-`none` income postings; net spending is the signed total of expense-class postings; gross and eligible refund/rebate/waiver offsets are separate. Cash totals use signed cash direction, internal transfers consolidate to zero, principal is not spending, baseline/adjustment is not income, and clearing is not spendable cash. Amounts across cash, expense and liability lenses must not be added into one total.

### Debt schedules

`record_type=schedule_entry`, **one supplied installment in one finalized schedule version**, selected by due date. Columns: `installment_id`, `debt_id`, `debt_name`, `obligation_id`, `schedule_version_id`, `version_no`, `is_current_version`, `revision_kind`, `due_date`, `contractual_minor`, `opening_satisfied_minor`, `known_principal_minor`, `known_interest_minor`, `known_fee_minor`, `breakdown_complete`, `disposition`, `cancellation_reason`, `current_payment_satisfied_minor`, `current_remaining_minor`.

Historical versions are preserved; do not sum versions as independent obligations. The two current satisfaction/remaining fields apply only to current-version entries, using current nonvoid direct and mapped payment allocations. Later payments never change opening satisfaction. Missing known components stay blank. Debts with no supplied due dates have no installment rows; the Financial report discloses that missing schedule coverage. This export is due-date evidence, not a historical-as-known schedule reconstruction.

### Debt payments

`record_type=payment_revision`, **one posted payment revision**, selected by primary payment effective date. Columns: `payment_revision_id`, `payment_id`, `action_id`, `action_revision_id`, `debt_id`, `debt_name`, `paying_account_id`, `revision_no`, `change_kind`, `is_current_revision`, `payment_date`, `paid_against_schedule_version_id`, `actual_paid_minor`, `contractual_minor`, `external_fee_minor`, `unapplied_contractual_minor`, `allocation_certainty`, `accounting_components_json`, `direct_allocations_json`, `historical_maps_json`.

The three JSON columns retain separate accounting, contractual and mapping meanings. Each monetary JSON value is also an exact integer string. Historical revisions/maps are evidence, not additional payments. External fees are excluded from contractual due satisfaction. Use transaction postings for actual signed cash/correction totals; use current payment revisions and current maps for current contractual satisfaction. Clearing classification actions appear in transaction evidence and do not create another cash payment.

### Application history

Submitted-date cohort within the period, through `as_of_date`, including archived attempts; saved opportunities are excluded. `record_type=stage_observation` means **one immutable stage-history row**, including superseded evidence through the effective cutoff. `record_type=event_revision` means **one recorded event audit revision for a cohort attempt**, including all currently known event versions; these are not additional interviews or applications.

Columns: `source_id`, `application_id`, `company_name`, `role_title`, `source_name`, `applied_date`, `effective_date`, `source_version`, `stage`, `outcome`, `supersedes_history_id`, `superseded`, `reason`, `recorded_at`, `event_snapshot_json`. The event JSON carries `event_id`, `operation`, `before`, `after`; dated provider responses/offers are explicit observations, never inferred from stages. Current cohort calculations exclude superseded history, use effective date/order, retain repeated visits and open-stage calendar duration through cutoff. Event counts are separately based on selected event dates, including other cohorts; this cohort-history CSV intentionally does not claim to export all workspace events. As-of is effective observation time under today's corrected snapshot, not “what the database knew then.”

### Report aggregates

Financial metric rows contain `record_type=financial_metric`, `metric`, `label`, `amount_minor`, `amount_decimal`. The on-screen metric dictionary defines income, gross spending, offsets/net, fees/interest/penalties, cash movements, borrowing, debt payments/principal, liability increases/reductions/waivers, clearing, baseline, reconciliation adjustments and limited tracked net position. Each metric drills into the same signed posting predicate. Category/flow/component/owned-ledger detail filters are allowlisted; ledger filters support balance contributions only, preserving the documented consolidated transfer boundary. Detail totals include all matching records while pages contain at most 100 rows.

`record_type=scheduled_payable` exports current schedule remaining for selected due dates, separate from recognized liability and labeled as current allocation knowledge. Career `career_metric` rows use `metric`, `count_value`; `career_rate` uses `metric`, `numerator`, `denominator`, `label`. Cohort numerator/denominator use the same submitted attempts; no denominator is blank/not applicable, not zero percent. Event-date counts are separate from applications reaching an interview. Every on-screen summary links to contributing records. Charts use approximate coordinates for display; tables, drilldowns and CSV strings are authoritative.
