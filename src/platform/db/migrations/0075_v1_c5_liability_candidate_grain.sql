/* C5 nested plans showed an intermediate 300,000-posting journal join
 * rescanned per debt in the deferred component-cap validator. Materialize
 * the exact owned liability candidates before joining posted journals.
 * Preserve all components (including NULL), signed amounts, current schedule
 * guards, RLS and deferred trigger coverage. No financial evidence changes. */
CREATE OR REPLACE FUNCTION finance.validate_payment_workspace_state()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  w uuid := NEW.workspace_id;
  v_payment record;
  pool record;
  v_total numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM core.workspace WHERE id = w) THEN
    RAISE EXCEPTION 'payment integrity scope unavailable' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM finance.debt_payment p JOIN finance.financial_action a
    ON a.workspace_id = p.workspace_id AND a.id = p.action_id
    JOIN finance.action_revision r ON r.workspace_id = a.workspace_id AND r.id = a.current_revision_id
    LEFT JOIN finance.debt_payment_revision v ON v.workspace_id = r.workspace_id AND v.action_revision_id = r.id
    WHERE p.workspace_id = w AND (r.action_kind NOT IN ('debt_payment','debt_settlement')
      OR (r.change_kind <> 'void' AND (v.id IS NULL OR v.payment_id <> p.id OR v.debt_id <> p.debt_id)))) THEN
    RAISE EXCEPTION 'logical payment current revision identity mismatch' USING ERRCODE = '23514';
  END IF;
  -- A later classification cannot survive replacement/void of its source pool
  -- unless dependent facts are atomically corrected as well.
  IF EXISTS (SELECT 1 FROM finance.payment_reclassification c
    JOIN finance.financial_action a ON a.workspace_id = c.workspace_id AND a.current_revision_id = c.action_revision_id
    JOIN finance.action_revision r ON r.workspace_id = a.workspace_id AND r.id = a.current_revision_id AND r.change_kind <> 'void'
    JOIN finance.payment_component s ON s.workspace_id = c.workspace_id AND s.id = c.source_component_id
    JOIN finance.debt_payment_revision v ON v.workspace_id = s.workspace_id AND v.id = s.payment_revision_id
    JOIN finance.financial_action pa ON pa.workspace_id = v.workspace_id AND pa.id = v.action_id
    JOIN finance.action_revision pr ON pr.workspace_id = pa.workspace_id AND pr.id = pa.current_revision_id
    WHERE c.workspace_id = w AND (pr.id <> v.action_revision_id OR pr.change_kind = 'void' OR r.action_kind <> 'payment_reclassification')) THEN
    RAISE EXCEPTION 'reclassification source must remain the current payment revision' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM finance.payment_reclassification c
    JOIN finance.financial_action a ON a.workspace_id = c.workspace_id AND a.current_revision_id = c.action_revision_id
    JOIN finance.action_revision r ON r.workspace_id = a.workspace_id AND r.id = a.current_revision_id AND r.change_kind <> 'void'
    JOIN finance.payment_component s ON s.workspace_id = c.workspace_id AND s.id = c.source_component_id
    WHERE c.workspace_id = w GROUP BY s.id, s.amount_minor
    HAVING sum(c.amount_minor::numeric) > s.amount_minor) THEN
    RAISE EXCEPTION 'clearing component cannot be reclassified twice' USING ERRCODE = '23514';
  END IF;
  -- Nonvoid current payment revisions supply source pools exactly once.
  FOR v_payment IN SELECT v.*, d.current_schedule_version_id AS target_id, ts.version_no AS target_no,
      ss.version_no AS source_no FROM finance.debt_payment_revision v
    JOIN finance.financial_action a ON a.workspace_id = v.workspace_id AND a.current_revision_id = v.action_revision_id
    JOIN finance.action_revision r ON r.workspace_id = a.workspace_id AND r.id = a.current_revision_id AND r.change_kind <> 'void'
    JOIN finance.debt d ON d.workspace_id = v.workspace_id AND d.id = v.debt_id
    JOIN finance.debt_schedule_version ts ON ts.workspace_id = d.workspace_id AND ts.id = d.current_schedule_version_id
    JOIN finance.debt_schedule_version ss ON ss.workspace_id = v.workspace_id AND ss.id = v.paid_against_schedule_version_id
    WHERE v.workspace_id = w LOOP
    IF v_payment.source_no > v_payment.target_no THEN
      RAISE EXCEPTION 'payment schedule cannot follow current schedule' USING ERRCODE = '23514';
    END IF;
    IF v_payment.source_no = v_payment.target_no THEN
      IF EXISTS (SELECT 1 FROM finance.schedule_allocation_map WHERE workspace_id = w
        AND target_schedule_version_id = v_payment.target_id AND payment_revision_id = v_payment.id) THEN
        RAISE EXCEPTION 'direct and mapped allocation paths cannot overlap' USING ERRCODE = '23514';
      END IF;
    ELSE
      FOR pool IN SELECT id, amount_minor FROM finance.payment_due_allocation
        WHERE workspace_id = w AND payment_revision_id = v_payment.id
        UNION ALL SELECT NULL::uuid, v_payment.unapplied_contractual_minor LOOP
        SELECT COALESCE(sum(amount_minor::numeric),0) INTO v_total FROM finance.schedule_allocation_map
          WHERE workspace_id = w AND target_schedule_version_id = v_payment.target_id AND payment_revision_id = v_payment.id
            AND source_allocation_id IS NOT DISTINCT FROM pool.id;
        IF v_total <> pool.amount_minor THEN
          RAISE EXCEPTION 'schedule mappings must exhaust each original source pool exactly' USING ERRCODE = '23514';
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM finance.schedule_allocation_map m
    JOIN finance.debt d ON d.workspace_id = m.workspace_id AND d.current_schedule_version_id = m.target_schedule_version_id
    JOIN finance.debt_payment_revision v ON v.workspace_id = m.workspace_id AND v.id = m.payment_revision_id
    JOIN finance.financial_action a ON a.workspace_id = v.workspace_id AND a.id = v.action_id
    JOIN finance.action_revision r ON r.workspace_id = a.workspace_id AND r.id = a.current_revision_id
    WHERE m.workspace_id = w AND (a.current_revision_id <> v.action_revision_id OR r.change_kind = 'void')) THEN
    RAISE EXCEPTION 'current schedule maps cannot retain superseded payment pools' USING ERRCODE = '23514';
  END IF;
  -- Grain: one current payment revision; aggregate each allocation path
  -- independently before joining one row per current installment.
  IF EXISTS (
    WITH current_payments AS MATERIALIZED (
      SELECT v.id, v.paid_against_schedule_version_id
      FROM finance.debt_payment_revision v
      JOIN finance.financial_action a ON a.workspace_id=v.workspace_id
        AND a.current_revision_id=v.action_revision_id
      JOIN finance.action_revision r ON r.workspace_id=a.workspace_id
        AND r.id=a.current_revision_id AND r.change_kind<>'void'
      WHERE v.workspace_id=w
    ), direct_satisfaction AS (
      SELECT x.installment_id, v.paid_against_schedule_version_id AS schedule_version_id,
        sum(x.amount_minor::numeric) AS amount
      FROM finance.payment_due_allocation x
      JOIN current_payments v ON v.id=x.payment_revision_id
      WHERE x.workspace_id=w
      GROUP BY x.installment_id, v.paid_against_schedule_version_id
    ), mapped_satisfaction AS (
      SELECT m.target_installment_id, sum(m.amount_minor::numeric) AS amount
      FROM finance.schedule_allocation_map m
      JOIN current_payments v ON v.id=m.payment_revision_id
      WHERE m.workspace_id=w
      GROUP BY m.target_installment_id
    )
    SELECT 1 FROM finance.scheduled_installment i
    JOIN finance.debt d ON d.workspace_id=i.workspace_id
      AND d.current_schedule_version_id=i.schedule_version_id
    LEFT JOIN direct_satisfaction ds ON ds.installment_id=i.id
      AND ds.schedule_version_id=i.schedule_version_id
    LEFT JOIN mapped_satisfaction ms ON ms.target_installment_id=i.id
    WHERE i.workspace_id=w AND (
      i.opening_satisfied_minor::numeric+COALESCE(ds.amount,0)+COALESCE(ms.amount,0)>i.contractual_minor
      OR (i.disposition='cancelled'
        AND NOT EXISTS (SELECT 1 FROM finance.debt_settlement st
          WHERE st.workspace_id=i.workspace_id AND st.debt_id=i.debt_id
            AND st.closing_schedule_version_id=i.schedule_version_id)
        AND EXISTS (SELECT 1 FROM finance.schedule_allocation_map m
          WHERE m.workspace_id=w AND m.target_installment_id=i.id))
    )
  ) THEN
    RAISE EXCEPTION 'current installment cannot be over-satisfied or allocated when cancelled' USING ERRCODE='23514';
  END IF;
  -- Recognized liability reductions may consume only recognized components;
  -- excess is advance/clearing, never a silently negative debt.
  IF EXISTS (
    WITH liability_postings AS MATERIALIZED (
      SELECT x.workspace_id,x.journal_id,x.liability_component,x.amount_minor,d.id AS debt_id
      FROM finance.posting x JOIN finance.debt d
        ON d.workspace_id=x.workspace_id AND d.liability_ledger_account_id=x.ledger_account_id
      WHERE x.workspace_id=w
    )
    SELECT 1 FROM liability_postings x JOIN finance.journal j
      ON j.workspace_id=x.workspace_id AND j.id=x.journal_id AND j.state='posted'
    GROUP BY x.debt_id,x.liability_component HAVING sum(x.amount_minor::numeric)>0
  ) THEN
    RAISE EXCEPTION 'payment cannot reduce more than recognized liability component' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM finance.debt d WHERE d.workspace_id = w AND d.lifecycle <> 'active' AND (
    EXISTS (SELECT 1 FROM finance.posting x JOIN finance.journal j ON j.workspace_id = x.workspace_id AND j.id = x.journal_id
      WHERE x.workspace_id = w AND x.ledger_account_id = d.clearing_ledger_account_id AND j.state = 'posted'
      GROUP BY x.ledger_account_id HAVING sum(x.amount_minor::numeric) <> 0)
    OR EXISTS (SELECT 1 FROM finance.debt_payment_revision v JOIN finance.financial_action a
      ON a.workspace_id = v.workspace_id AND a.current_revision_id = v.action_revision_id
      JOIN finance.action_revision r ON r.workspace_id = a.workspace_id AND r.id = a.current_revision_id AND r.change_kind <> 'void'
      WHERE v.workspace_id = w AND v.debt_id = d.id AND (
        (v.paid_against_schedule_version_id = d.current_schedule_version_id AND v.unapplied_contractual_minor > 0)
        OR EXISTS (SELECT 1 FROM finance.schedule_allocation_map m WHERE m.workspace_id = w
          AND m.payment_revision_id = v.id AND m.target_schedule_version_id = d.current_schedule_version_id AND m.target_kind = 'unapplied' AND NOT EXISTS (SELECT 1 FROM finance.debt_settlement st WHERE st.workspace_id=m.workspace_id AND st.debt_id=m.debt_id AND st.closing_schedule_version_id=m.target_schedule_version_id AND st.resolved_unapplied_minor>0 AND length(trim(st.unapplied_resolution_note))>0)))))) THEN
    RAISE EXCEPTION 'debt cannot close with unresolved clearing or unapplied contractual allocation' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
