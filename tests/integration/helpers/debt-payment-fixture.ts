import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getAuthPool, getDomainPool } from "@/platform/db/pools";

export type ActionFixture = {
  actionId: string;
  revisionId: string;
  receiptId: string;
  journalId: string;
  revisionNo: number;
};
export type PaymentFixture = ActionFixture & {
  paymentId: string;
  paymentRevisionId: string;
  componentIds: string[];
  allocationId: string | null;
};
export type DebtFixture = {
  userId: string;
  workspaceId: string;
  debtId: string;
  liabilityId: string;
  clearingId: string;
  expenseId: string;
  cashId: string;
  accountId: string;
  scheduleId: string;
  installmentId: string;
  obligationId: string;
};
export type ComponentInput = {
  disposition: string;
  amount: string;
  evidenceAmount?: string;
  ledgerId?: string;
  liabilityComponent?: string;
  fee?: boolean;
};

export async function ledger(client: PoolClient, w: string, kind: string) {
  const id = randomUUID();
  await client.query(
    `INSERT INTO finance.ledger_account (id,workspace_id,code,name,kind,currency) VALUES ($1::uuid,$2,$1::uuid::text,'Fixture',$3,'PHP')`,
    [id, w, kind],
  );
  return id;
}

export async function action(
  client: PoolClient,
  f: DebtFixture,
  kind: string,
  previous?: ActionFixture,
  changeKind = "replace",
  effectiveDate = "2026-10-08",
): Promise<ActionFixture> {
  const ids = {
    actionId: previous?.actionId ?? randomUUID(),
    revisionId: randomUUID(),
    receiptId: randomUUID(),
    journalId: randomUUID(),
    revisionNo: (previous?.revisionNo ?? 0) + 1,
  };
  await client.query(
    `INSERT INTO core.command_receipt (id,workspace_id,client_command_id,command_type,payload_hash) VALUES ($1,$2,$3,$4,$5)`,
    [
      ids.receiptId,
      f.workspaceId,
      randomUUID(),
      "finance." + kind,
      Buffer.alloc(32, 7),
    ],
  );
  if (!previous)
    await client.query(
      `INSERT INTO finance.financial_action (id,workspace_id,original_command_receipt_id,current_revision_id,description,recorded_by_user_id,actor_kind) VALUES ($1,$2,$3,$4,'Fixture',$5,'user')`,
      [ids.actionId, f.workspaceId, ids.receiptId, ids.revisionId, f.userId],
    );
  await client.query(
    `INSERT INTO finance.action_revision (id,workspace_id,action_id,revision_no,previous_revision_id,command_receipt_id,change_kind,action_kind,primary_effective_date,currency,reason,recorded_by_user_id,actor_kind) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PHP',$10,$11,'user')`,
    [
      ids.revisionId,
      f.workspaceId,
      ids.actionId,
      ids.revisionNo,
      previous?.revisionId ?? null,
      ids.receiptId,
      previous ? changeKind : "create",
      kind,
      kind === "opening_debt" ? "2026-09-30" : effectiveDate,
      previous ? "Provider correction" : null,
      f.userId,
    ],
  );
  if (previous) {
    const journals = await client.query<{ id: string; effective_date: string }>(
      `SELECT id,effective_date::text FROM finance.journal WHERE workspace_id=$1 AND action_revision_id=$2 AND role='economic' ORDER BY sequence_no`,
      [f.workspaceId, previous.revisionId],
    );
    let sequence = 1;
    for (const original of journals.rows) {
      const reversalId = randomUUID();
      await client.query(
        `INSERT INTO finance.journal (id,workspace_id,action_id,action_revision_id,sequence_no,effective_date,currency,role,reverses_journal_id) VALUES ($1,$2,$3,$4,$5,$6,'PHP','reversal',$7)`,
        [
          reversalId,
          f.workspaceId,
          ids.actionId,
          ids.revisionId,
          sequence++,
          original.effective_date,
          original.id,
        ],
      );
      await client.query(
        `INSERT INTO finance.posting (workspace_id,action_id,action_revision_id,journal_id,ledger_account_id,currency,line_no,amount_minor,category_id,expense_class,income_class,cash_flow_kind,cash_flow_direction,liability_component,reverses_posting_id,memo) SELECT workspace_id,$1,$2,$3,ledger_account_id,currency,line_no,-amount_minor,category_id,expense_class,income_class,cash_flow_kind,cash_flow_direction,liability_component,id,memo FROM finance.posting WHERE workspace_id=$4 AND journal_id=$5`,
        [ids.actionId, ids.revisionId, reversalId, f.workspaceId, original.id],
      );
      await client.query(
        `UPDATE finance.journal SET state='posted',finalized_at=clock_timestamp() WHERE id=$1 AND workspace_id=$2`,
        [reversalId, f.workspaceId],
      );
    }
    if (changeKind !== "void")
      await journal(client, f, ids, sequence, effectiveDate);
    await client.query(
      `UPDATE finance.financial_action SET current_revision_id=$1 WHERE workspace_id=$2 AND id=$3`,
      [ids.revisionId, f.workspaceId, ids.actionId],
    );
  } else
    await journal(
      client,
      f,
      ids,
      1,
      kind === "opening_debt" ? "2026-09-30" : effectiveDate,
    );
  return ids;
}

async function journal(
  client: PoolClient,
  f: DebtFixture,
  a: ActionFixture,
  sequence: number,
  effectiveDate = "2026-10-08",
) {
  await client.query(
    `INSERT INTO finance.journal (id,workspace_id,action_id,action_revision_id,sequence_no,effective_date,currency,role) VALUES ($1,$2,$3,$4,$5,$6,'PHP','economic')`,
    [
      a.journalId,
      f.workspaceId,
      a.actionId,
      a.revisionId,
      sequence,
      effectiveDate,
    ],
  );
}

export async function post(
  client: PoolClient,
  f: DebtFixture,
  a: ActionFixture,
  input: {
    ledgerId: string;
    amount: string;
    line: number;
    flow?: string | undefined;
    expense?: string | undefined;
    component?: string | undefined;
  },
) {
  const id = randomUUID();
  await client.query(
    `INSERT INTO finance.posting (id,workspace_id,action_id,action_revision_id,journal_id,ledger_account_id,currency,line_no,amount_minor,expense_class,cash_flow_kind,cash_flow_direction,liability_component) VALUES ($1,$2,$3,$4,$5,$6,'PHP',$7,$8,$9,$10,$11,$12)`,
    [
      id,
      f.workspaceId,
      a.actionId,
      a.revisionId,
      a.journalId,
      input.ledgerId,
      input.line,
      input.amount,
      input.expense ?? "none",
      input.flow ?? "none",
      input.flow ? "out" : "none",
      input.component ?? null,
    ],
  );
  return id;
}

export async function finish(
  client: PoolClient,
  f: DebtFixture,
  a: ActionFixture,
  isVoid = false,
) {
  if (!isVoid)
    await client.query(
      `UPDATE finance.journal SET state='posted',finalized_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
      [f.workspaceId, a.journalId],
    );
  await client.query(
    `UPDATE finance.action_revision SET state='posted',finalized_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
    [f.workspaceId, a.revisionId],
  );
  await client.query(
    `INSERT INTO audit.private_revision (workspace_id,command_receipt_id,subject_kind,subject_id,subject_version,operation,after_json,recorded_by_user_id,actor_kind) VALUES ($1,$2,'financial_action',$3,$4,$5,'{}',$6,'user')`,
    [
      f.workspaceId,
      a.receiptId,
      a.actionId,
      a.revisionNo,
      isVoid ? "void" : a.revisionNo === 1 ? "create" : "replace",
      f.userId,
    ],
  );
  await client.query(
    `UPDATE core.command_receipt SET state='completed',completed_at=clock_timestamp(),result_json=$1 WHERE workspace_id=$2 AND id=$3`,
    [
      JSON.stringify({ actionId: a.actionId, actionRevisionId: a.revisionId }),
      f.workspaceId,
      a.receiptId,
    ],
  );
  await client.query(
    `UPDATE core.workspace SET financial_revision=financial_revision+1 WHERE id=$1`,
    [f.workspaceId],
  );
}

export async function link(
  client: PoolClient,
  f: DebtFixture,
  a: ActionFixture,
  purpose: string,
) {
  await client.query(
    `INSERT INTO finance.debt_action_link (workspace_id,action_id,action_revision_id,debt_id,purpose) VALUES ($1,$2,$3,$4,$5)`,
    [f.workspaceId, a.actionId, a.revisionId, f.debtId, purpose],
  );
}

export async function payment(
  client: PoolClient,
  f: DebtFixture,
  input: {
    actual?: string;
    contractual?: string;
    external?: string;
    unapplied?: string;
    due?: string;
    certainty?: string;
    components?: readonly ComponentInput[];
    previous?: PaymentFixture;
    accountId?: string;
    scheduleId?: string;
    installmentId?: string;
    componentPostingId?: string;
    omitAudit?: boolean;
  } = {},
): Promise<PaymentFixture> {
  const contractual = input.contractual ?? "400";
  const external = input.external ?? "0";
  const a = await action(client, f, "debt_payment", input.previous);
  const p = {
    ...a,
    paymentId: input.previous?.paymentId ?? randomUUID(),
    paymentRevisionId: randomUUID(),
    componentIds: [] as string[],
    allocationId: null as string | null,
  };
  if (!input.previous)
    await client.query(
      `INSERT INTO finance.debt_payment (id,workspace_id,debt_id,action_id,recorded_by_user_id,actor_kind) VALUES ($1,$2,$3,$4,$5,'user')`,
      [p.paymentId, f.workspaceId, f.debtId, a.actionId, f.userId],
    );
  await client.query(
    `INSERT INTO finance.debt_payment_revision (id,workspace_id,action_id,action_revision_id,payment_id,debt_id,paid_against_schedule_version_id,paying_account_id,actual_paid_minor,contractual_minor,external_fee_minor,unapplied_contractual_minor,allocation_certainty) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      p.paymentRevisionId,
      f.workspaceId,
      a.actionId,
      a.revisionId,
      p.paymentId,
      f.debtId,
      input.scheduleId ?? f.scheduleId,
      input.accountId ?? f.accountId,
      input.actual ?? (BigInt(contractual) + BigInt(external)).toString(),
      contractual,
      external,
      input.unapplied ?? "0",
      input.certainty ?? "confirmed_total",
    ],
  );
  await link(client, f, a, "payment");
  let line = 1;
  if (BigInt(contractual) > 0n)
    await post(client, f, a, {
      ledgerId: f.cashId,
      amount: (-BigInt(contractual)).toString(),
      line: line++,
      flow: "debt_payment",
    });
  if (BigInt(external) > 0n)
    await post(client, f, a, {
      ledgerId: f.cashId,
      amount: (-BigInt(external)).toString(),
      line: line++,
      flow: "fee",
    });
  const components = input.components ?? [
    { disposition: "liability_reduction", amount: contractual },
  ];
  for (const c of [
    ...components,
    ...(BigInt(external) > 0n
      ? [{ disposition: "external_fee", amount: external, fee: true }]
      : []),
  ]) {
    const postingId = await post(client, f, a, {
      ledgerId:
        c.ledgerId ??
        (c.disposition === "liability_reduction"
          ? f.liabilityId
          : ["clearing", "advance"].includes(c.disposition)
            ? f.clearingId
            : f.expenseId),
      amount: c.amount,
      line: line++,
      expense: [
        "new_interest",
        "new_fee",
        "new_penalty",
        "external_fee",
      ].includes(c.disposition)
        ? "gross"
        : undefined,
      component:
        c.disposition === "liability_reduction"
          ? (c.liabilityComponent ?? "unclassified")
          : undefined,
    });
    let feeId: string | null = null;
    if (c.fee) {
      feeId = randomUUID();
      await client.query(
        `INSERT INTO finance.fee_component (id,workspace_id,action_id,action_revision_id,label,amount_minor,effective_date,bearing_ledger_account_id,expense_posting_id,treatment) VALUES ($1,$2,$3,$4,'Fixture fee',$5,'2026-10-08',$6,$7,'source_additional')`,
        [
          feeId,
          f.workspaceId,
          a.actionId,
          a.revisionId,
          c.amount,
          f.cashId,
          postingId,
        ],
      );
    }
    const id = randomUUID();
    p.componentIds.push(id);
    await client.query(
      `INSERT INTO finance.payment_component (id,workspace_id,debt_id,payment_revision_id,posting_id,disposition,amount_minor,fee_component_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        f.workspaceId,
        f.debtId,
        p.paymentRevisionId,
        input.componentPostingId ?? postingId,
        c.disposition,
        c.evidenceAmount ?? c.amount,
        feeId,
      ],
    );
  }
  const due =
    input.due ??
    (BigInt(contractual) - BigInt(input.unapplied ?? "0")).toString();
  if (BigInt(due) > 0n) {
    p.allocationId = randomUUID();
    await client.query(
      `INSERT INTO finance.payment_due_allocation (id,workspace_id,debt_id,payment_revision_id,schedule_version_id,installment_id,amount_minor) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        p.allocationId,
        f.workspaceId,
        f.debtId,
        p.paymentRevisionId,
        input.scheduleId ?? f.scheduleId,
        input.installmentId ?? f.installmentId,
        due,
      ],
    );
  }
  if (input.omitAudit) {
    await client.query(
      `UPDATE finance.journal SET state='posted',finalized_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
      [f.workspaceId, a.journalId],
    );
    await client.query(
      `UPDATE finance.action_revision SET state='posted',finalized_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
      [f.workspaceId, a.revisionId],
    );
    await client.query(
      `UPDATE core.command_receipt SET state='completed',completed_at=clock_timestamp(),result_json='{}' WHERE workspace_id=$1 AND id=$2`,
      [f.workspaceId, a.receiptId],
    );
  } else await finish(client, f, a);
  return p;
}

export async function reclassify(
  client: PoolClient,
  f: DebtFixture,
  p: PaymentFixture,
  input: {
    amount?: string;
    sourceId?: string;
    paymentId?: string | undefined;
    cash?: boolean;
    previous?: ActionFixture;
    effectiveDate?: string;
  } = {},
) {
  const a = await action(
    client,
    f,
    "payment_reclassification",
    input.previous,
    "replace",
    input.effectiveDate,
  );
  await link(client, f, a, "reclassification");
  const amount = input.amount ?? "200";
  const creditId = await post(client, f, a, {
    ledgerId: input.cash ? f.cashId : f.clearingId,
    amount: (-BigInt(amount)).toString(),
    line: 1,
    flow: input.cash ? "debt_payment" : undefined,
  });
  await post(client, f, a, {
    ledgerId: f.liabilityId,
    amount,
    line: 2,
    component: "unclassified",
  });
  await client.query(
    `INSERT INTO finance.payment_reclassification (workspace_id,action_id,action_revision_id,debt_id,payment_id,source_component_id,clearing_credit_posting_id,amount_minor,reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Provider confirmed allocation')`,
    [
      f.workspaceId,
      a.actionId,
      a.revisionId,
      f.debtId,
      input.paymentId ?? p.paymentId,
      input.sourceId ?? p.componentIds[0],
      creditId,
      amount,
    ],
  );
  await finish(client, f, a);
  return a;
}

export async function schedule(
  client: PoolClient,
  f: DebtFixture,
  input: {
    previousId?: string;
    version?: number;
    empty?: boolean;
    total?: string;
    opening?: string;
    kind?: string;
  } = {},
) {
  const scheduleId = randomUUID(),
    installmentId = randomUUID();
  await client.query(
    `INSERT INTO finance.debt_schedule_version (id,workspace_id,debt_id,version_no,previous_version_id,effective_date,revision_kind,reason,frequency,recorded_by_user_id,actor_kind) VALUES ($1,$2,$3,$4,$5,'2026-10-08',$6,'Provider schedule','manual',$7,'user')`,
    [
      scheduleId,
      f.workspaceId,
      f.debtId,
      input.version ?? 1,
      input.previousId ?? null,
      input.kind ?? (input.previousId ? "renegotiation" : "initial"),
      f.userId,
    ],
  );
  if (!input.empty)
    await client.query(
      `INSERT INTO finance.scheduled_installment (id,workspace_id,debt_id,schedule_version_id,obligation_id,sequence_no,due_date,contractual_minor,opening_satisfied_minor) VALUES ($1,$2,$3,$4,$5,1,'2026-10-20',$6,$7)`,
      [
        installmentId,
        f.workspaceId,
        f.debtId,
        scheduleId,
        f.obligationId,
        input.total ?? "1000",
        input.opening ?? "0",
      ],
    );
  await client.query(
    `UPDATE finance.debt SET current_schedule_version_id=$1 WHERE workspace_id=$2 AND id=$3`,
    [scheduleId, f.workspaceId, f.debtId],
  );
  return { scheduleId, installmentId };
}

export async function finalizeSchedule(
  client: PoolClient,
  f: DebtFixture,
  id: string,
) {
  await client.query(
    `UPDATE finance.debt_schedule_version SET state='finalized',finalized_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
    [f.workspaceId, id],
  );
}

export async function mapPool(
  client: PoolClient,
  f: DebtFixture,
  p: PaymentFixture,
  target: { scheduleId: string; installmentId?: string },
  amount: string,
  sourceId: string | null = p.allocationId,
) {
  await client.query(
    `INSERT INTO finance.schedule_allocation_map (workspace_id,debt_id,target_schedule_version_id,payment_revision_id,source_allocation_id,source_kind,target_installment_id,target_kind,amount_minor) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      f.workspaceId,
      f.debtId,
      target.scheduleId,
      p.paymentRevisionId,
      sourceId,
      sourceId ? "allocation" : "unapplied",
      target.installmentId ?? null,
      target.installmentId ? "installment" : "unapplied",
      amount,
    ],
  );
}

export async function fixture(
  client: PoolClient,
  identity: { userId: string; workspaceId: string },
  empty = false,
  openingSatisfied = "0",
): Promise<DebtFixture> {
  const f = {
    ...identity,
    debtId: randomUUID(),
    liabilityId: await ledger(client, identity.workspaceId, "debt_liability"),
    clearingId: await ledger(
      client,
      identity.workspaceId,
      "payment_clearing_asset",
    ),
    expenseId: await ledger(client, identity.workspaceId, "expense"),
    cashId: await ledger(client, identity.workspaceId, "cash_asset"),
    accountId: randomUUID(),
    scheduleId: "",
    installmentId: "",
    obligationId: randomUUID(),
  };
  await client.query(
    `INSERT INTO finance.financial_account (id,workspace_id,ledger_account_id,name,account_type,currency,opening_cutoff_date) VALUES ($1,$2,$3,'Fixture cash','checking','PHP','2026-09-30')`,
    [f.accountId, f.workspaceId, f.cashId],
  );
  await client.query(
    `INSERT INTO finance.debt (id,workspace_id,name,lender_name,debt_type,currency,liability_ledger_account_id,clearing_ledger_account_id,start_date,opening_cutoff_date,breakdown_status,recorded_by_user_id,actor_kind) VALUES ($1,$2,'Fixture debt','Provider','personal_loan','PHP',$3,$4,'2026-01-01','2026-09-30','unknown',$5,'user')`,
    [f.debtId, f.workspaceId, f.liabilityId, f.clearingId, f.userId],
  );
  await client.query(
    `INSERT INTO finance.debt_obligation (id,workspace_id,debt_id,recorded_by_user_id,actor_kind) VALUES ($1,$2,$3,$4,'user')`,
    [f.obligationId, f.workspaceId, f.debtId, f.userId],
  );
  Object.assign(
    f,
    await schedule(client, f, { empty, opening: openingSatisfied }),
  );
  await finalizeSchedule(client, f, f.scheduleId);
  const opening = await action(client, f, "opening_debt");
  await link(client, f, opening, "opening");
  await post(client, f, opening, {
    ledgerId: await ledger(client, f.workspaceId, "opening_equity"),
    amount: "1000",
    line: 1,
  });
  await post(client, f, opening, {
    ledgerId: f.liabilityId,
    amount: "-1000",
    line: 2,
    component: "unclassified",
  });
  await finish(client, f, opening);
  return f;
}

export async function scoped(
  client: PoolClient,
  identity: { userId: string; workspaceId: string },
) {
  await client.query(
    `SELECT set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)`,
    [identity.userId, identity.workspaceId],
  );
}

export async function withFixture(
  run: (client: PoolClient, f: DebtFixture) => Promise<void>,
  empty = false,
) {
  const identity = { userId: randomUUID(), workspaceId: randomUUID() };
  await getAuthPool().query(
    `INSERT INTO auth."user" (id,name,email,email_verified) VALUES ($1,'Payment fixture',$2,true)`,
    [identity.userId, identity.userId + "@example.test"],
  );
  const client = await getDomainPool().connect();
  try {
    await client.query("BEGIN");
    await scoped(client, identity);
    await client.query(
      `INSERT INTO core.user_profile (user_id,display_name) VALUES ($1,'Payment fixture')`,
      [identity.userId],
    );
    await client.query(
      `INSERT INTO core.workspace (id,owner_user_id) VALUES ($1,$2)`,
      [identity.workspaceId, identity.userId],
    );
    await client.query(
      `INSERT INTO core.workspace_preference (workspace_id) VALUES ($1)`,
      [identity.workspaceId],
    );
    const debt = await fixture(client, identity, empty);
    // Establish the already-verified D6a opening before testing later commands.
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    await run(client, debt);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await getAuthPool().query(`DELETE FROM auth."user" WHERE id=$1`, [
      identity.userId,
    ]);
  }
}
