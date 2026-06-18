# Add a LinkedIn link with icon to the TPR marketing page footer

## Goal
Add a clickable LinkedIn icon to the footer of the public marketing page so visitors can follow Andy Halse's LinkedIn (where TPR blog posts are shared).

LinkedIn URL: `https://www.linkedin.com/in/andy-halse/`

## File to change
`client/src/pages/MarketingPage.tsx` — the `<footer>` block (starts around line 4481).

## What to do

1. **Import the LinkedIn icon.** The file already imports icons from `lucide-react` (the import ends around line 88 with `} from "lucide-react";`). Add `Linkedin` to that existing import list — do not create a new import line.

2. **Add a "Follow us" LinkedIn link inside the footer's Company Info column** (the `{/* Company Info */}` block, after the address/phone `<div>` that ends around line 4511, but still inside that column's outer `<div>`). Use this markup:

   ```tsx
   <div className="mt-4">
     <a
       href="https://www.linkedin.com/in/andy-halse/"
       target="_blank"
       rel="noopener noreferrer"
       aria-label="Follow ACS on LinkedIn"
       data-testid="link-footer-linkedin"
       className="inline-flex items-center gap-2 text-slate-300 hover:text-white transition-colors text-sm"
     >
       <Linkedin className="h-5 w-5" />
       <span>Follow us on LinkedIn</span>
     </a>
   </div>
   ```

## Rules
- British spelling throughout.
- Do not change any other footer content, links, or styling.
- Keep the existing colour scheme (slate text on the dark `bg-slate-900` footer) — the classes above already match it.
- `target="_blank"` + `rel="noopener noreferrer"` so it opens in a new tab safely.

## How to verify
- Marketing page footer shows a LinkedIn icon + "Follow us on LinkedIn" under the ACS address block.
- Clicking it opens `https://www.linkedin.com/in/andy-halse/` in a new tab.
- No TypeScript/build errors (the `Linkedin` icon resolves from `lucide-react`).

## Notes
- No database change. No `npm run db:push` needed.
- This is a static front-end change to a public page.
