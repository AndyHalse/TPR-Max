---
name: TPR Max tooltip UX principle
description: Add hover tooltips to all interactive elements on every page as we go through testing — ongoing requirement from the product owner.
---

## The rule
Every interactive element on every page must have a helpful hover tooltip. This is an ongoing, platform-wide requirement. As each page is visited during testing, add tooltips proactively.

**Why:** The owner explicitly stated the platform must be "as easy and logical to use as possible." Tooltips are a primary tool for this — they explain what each button, tab, and action does without cluttering the UI.

## How to apply
- Use `<Tooltip>`, `<TooltipTrigger asChild>`, `<TooltipContent>` from `@/components/ui/tooltip` (Radix UI).
- Wrap each section with `<TooltipProvider delayDuration={400}>` — one provider per logical block (header, tab nav, etc.). Never use a bare HTML `title=` attribute — it renders inconsistently.
- Tab navigation buttons: describe what the tab contains and what the user can do there.
- Action buttons (Add, Upload, Scan, etc.): one sentence explaining the action and its effect.
- Status badges / indicators: explain what the status means and what action is required.
- Filter controls: explain what the filter does.
- Three-dot / kebab menus: tooltip on the trigger saying "More options".

## Pages with tooltips already added
- `/contractors` — ContractorTabNav (all 9 tabs), header Scan QR button, F10 overdue badge.

## Pattern example
```tsx
<TooltipProvider delayDuration={400}>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button onClick={...}>Upload</Button>
    </TooltipTrigger>
    <TooltipContent side="bottom">
      Upload a new RAMS document for this contractor
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```
