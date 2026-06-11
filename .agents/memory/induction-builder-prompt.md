---
name: Induction Builder prompt conflict
description: Why the induction AI produces CDM-only content instead of a proper Welcome-first induction
---

## The rule
`cdmMandatoryBlock` must say "cover these topics **across** your scenes" — never "each topic requires its own dedicated slide".

## Why
The old wording said "MUST include a dedicated slide for EACH of the following TEN topics — do NOT combine them." This overrode the Step 3 scene structure. The AI obeyed the stricter CDM block and filled all 7 scenes with CDM/compliance content, never producing a Welcome scene. The user saw 7 visually identical compliance slides and reported "only 1 slide".

## How to apply
- `cdmMandatoryBlock` = topics to weave across scenes 2–7, explicitly NOT extra slides.
- Step 3 scene structure must say "SCENE 1 MUST ALWAYS BE WELCOME" in capital letters.
- JSON example must show scene[0] = Welcome with a concrete filled-in example.
- Server-side guard in `generateInductionScript` (after AI response is parsed):
  - If `scene[0].title` doesn't start with "Welcome", find + move the Welcome scene to front.
  - If no Welcome scene exists at all, inject a default one.
- `calculateOptimalTokens` is capped at 8192 (raised from 6000) so longer content fits.
