---
name: Equipment Register uuid/text type mismatch
description: contractor_equipment.id is uuid; contractor_documents.equipment_id is text; silent empty-list bug caused by type mismatch in subqueries.
---

## The Rule
In `server/routes/contractorEquipment.ts`, every subquery comparing `contractor_documents.equipment_id` to `contractor_equipment.id` must cast the uuid side: `e.id::text`.

**Why:** `contractor_equipment.id` is a `uuid` column; `contractor_documents.equipment_id` is a `text` column. PostgreSQL raises "operator does not exist: text = uuid" which is caught by `msg.includes('does not exist')` in the catch block and silently returns `[]`. Equipment saves correctly (POST works) but never appears (GET always returns empty).

**How to apply:** Any time you join `contractor_documents` to `contractor_equipment` on the id column, always write `d.equipment_id = e.id::text`, never `d.equipment_id = e.id`.

## Also: Missing tables on older schemas
`c_b37b4622` and any schema created before the equipment feature shipped may lack `contractor_equipment` and `equipment_certification_types` tables. The `ensureEquipmentTables()` function added to `contractorEquipment.ts` self-heals this — it runs once per customerId per server lifetime via a module-level `Set`.
