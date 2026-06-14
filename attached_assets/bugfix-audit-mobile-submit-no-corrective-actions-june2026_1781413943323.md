# Fix — Audits: failed items on a mobile-completed inspection raise no corrective actions (verified against live codebase 14 June 2026)

## The problem (read this first)

The Audit & Inspection module has two ways to complete an audit:

1. **On the desktop**, an admin opens an audit, hits "Conduct", marks each item, and submits. This goes through the authenticated route `POST /api/audits/records/:id/submit`.
2. **On a phone**, you send the inspector a mobile link (the "Send mobile link" / "Open Inspection on Mobile" email). They mark each item on site and submit. This goes through the public route `POST /api/audits/public/:token/submit`.

Here's the bug. When an audit is submitted **on the desktop**, every failed item automatically raises a corrective action (a CAPA) so the failure gets tracked and closed off. You can see this in `server/routes/auditEngine.ts:727`–`748` — it loops the failed items, skips any already raised, and inserts the rest. That's why the Actions tab shows a red count and nothing slips through.

When the **same audit is submitted from the mobile link**, none of that happens. The public submit handler (`server/routes/auditEngine.ts:110`–`144`) just scores the audit, marks it completed, and stops. It never creates corrective actions.

So the failures vanish. The inspector in the field marks three items as "Fail", submits, sees the red "Audit Failed" screen — and back in the office the Actions tab is empty. The manager thinks everything's handled. Nothing is assigned, nothing is chased, nothing is closed.

This matters because the mobile link **is** the main way this feature is meant to be used — you send the audit to the person actually walking the site. The whole point of the module is that a fail turns into a tracked action automatically. On the path customers will use most, it doesn't.

**Scope:** one file, `server/routes/auditEngine.ts`. One handler (the public submit). Don't touch the desktop submit, the scoring logic, or the mobile front-end. Run `npm run check` when done.

---

## The fix — mirror the desktop's auto-action logic in the public submit

In `server/routes/auditEngine.ts`, find the public submit handler:

```ts
  app.post('/api/audits/public/:token/submit', auditPublicRateLimit, async (req, res) => {
```

It currently ends like this:

```ts
      const passThreshold = template?.passScore ?? 80;
      const passed = hasCriticalFail ? false : score >= passThreshold;
      const [updated] = await custDb.update(isolatedSchema.auditRecords)
        .set({ status: 'completed', overallScore: score, passed, conductedAt: new Date(), summary: summary || null, updatedAt: new Date() })
        .where(eq(isolatedSchema.auditRecords.id, record.id))
        .returning();
      return res.json({ record: updated, overallScore: score, passed, passCount, failCount, naCount: items.filter((i: any) => i.response === 'na').length });
```

Change it so that, after the record is marked completed, failed items raise corrective actions — exactly the way the desktop submit already does. Replace the block above with:

```ts
      const passThreshold = template?.passScore ?? 80;
      const passed = hasCriticalFail ? false : score >= passThreshold;
      const [updated] = await custDb.update(isolatedSchema.auditRecords)
        .set({ status: 'completed', overallScore: score, passed, conductedAt: new Date(), summary: summary || null, updatedAt: new Date() })
        .where(eq(isolatedSchema.auditRecords.id, record.id))
        .returning();

      // Auto-create corrective actions for failed items (skip any already raised).
      // Mirrors the authenticated submit handler so mobile-completed audits behave
      // the same as desktop ones.
      let autoActionsCreated = 0;
      const failedItems = items.filter((i: any) => i.response === 'fail');
      if (failedItems.length > 0) {
        const existingActions = await custDb.select().from(isolatedSchema.auditCorrectiveActions)
          .where(eq(isolatedSchema.auditCorrectiveActions.auditId, record.id));
        const existingItemIds = new Set(existingActions.map((a: any) => a.auditItemId).filter(Boolean));
        const newActions = failedItems
          .filter((item: any) => !existingItemIds.has(item.id))
          .map((item: any) => ({
            auditId: record.id,
            auditItemId: item.id,
            title: `Failed: ${item.question}`,
            description: item.note || null,
            priority: (item.isCritical ? 'high' : 'medium') as 'high' | 'medium',
            status: 'open' as const,
          }));
        if (newActions.length > 0) {
          await custDb.insert(isolatedSchema.auditCorrectiveActions).values(newActions);
          autoActionsCreated = newActions.length;
        }
      }

      const naCount = items.filter((i: any) => i.response === 'na').length;
      return res.json({ record: updated, overallScore: score, passed, passCount, failCount, naCount, autoActionsCreated });
```

That's the whole change. The dedupe check (`existingItemIds`) means re-submitting the same audit won't pile up duplicate actions, same as the desktop side.

---

## How to test when done

1. `npm run check` passes with no new type errors.
2. Schedule an audit against a template that has a few checklist items (the "Fire Safety Inspection" UK template is ideal — it has critical items).
3. On the audit record, click the mail icon to generate a mobile link (or use "Copy Link Only").
4. Open that link, mark **two items as Fail** (one of them a Critical item), mark the rest Pass, and submit.
5. Back in the main app, open the **Actions tab**. You should now see **two open corrective actions** — one tagged High priority (the critical fail) and one Medium. Before this fix the tab would be empty.
6. Re-open the same mobile link and submit again — confirm **no duplicate** actions are created.
7. Sanity check the desktop path still works: conduct a different audit from the desktop, fail an item, confirm it still raises an action exactly as before.
