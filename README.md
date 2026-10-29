# Handoff: Poppa's Calligraphy Site

## Overview
A brochure/e-commerce site for a handmade calligraphy and carved-paper-art business run by a father-daughter(-in-law) pair, "Poppa" (Bob) and "Momma" (Gail). Four pages built: Home, Shop, Commissions, Contact.

## About the Design Files
The files in this bundle (`Home.dc.html`, `Shop.dc.html`, `Commissions.dc.html`, `Contact.dc.html`) are **design references built as HTML prototypes** — they show intended layout, copy, and interaction, not production code to copy directly. They currently run on a proprietary component runtime (`support.js`, `<x-import>`, `<image-slot>` custom element) that only works in this design tool — **do not ship these files as-is**. The task is to **recreate these designs in the target codebase's actual stack** (React, Vue, plain HTML/CSS, etc. — whatever the project already uses, or the best choice if none exists yet), using the CSS design tokens and component classes described below.

## Fidelity
**High-fidelity.** Final copy, layout, spacing, and a real design system (tokens + component classes) are already defined in `ds/styles.css`. Recreate pixel-for-pixel where practical; image placeholders (see Assets) are the one exception — those need real photography.

## Design System
All four pages link `ds/styles.css`, an editorial/book-like system:
- **Fonts**: Cormorant Garamond (headings) + Lora (body), loaded from Google Fonts.
- **Color**: near-white ground `--color-bg` (#f3f2f2), ink text `--color-text` (#201f1d), single accent gold/brown `--color-accent` (#b68235), each with a 100–900 tonal ramp (`--color-accent-100`…`--color-accent-900`, same pattern for neutral).
- **Spacing/radius**: `--space-1` through `--space-8`, `--radius-sm/md/lg` — use these, not hardcoded px.
- **Components** (CSS classes, see `ds/styles.css` for full rules): `.btn`/`.btn-primary`/`.btn-secondary` (outlined, never filled), `.card`/`.card-title`/`.card-body`/`.card-meta`, `.tag`/`.tag-outline`/`.tag-neutral`, `.nav`/`.nav-brand`, `.plate` (image mat wrapper), `.hr` (hairline rule), `.field`/`.input` (forms).
- Full rationale in `design-system-readme.md` (do/don't list, states, etc).

**Key visual rule**: buttons are outlined, not solid-filled. Cards are bordered, not shadowed. Color is used as stroke/accent, not as fill. Keep this discipline when recreating in the target stack.

## Screens / Views

### 1. Home (`Home.dc.html`)
**Purpose**: Entry point — establish the craft/family story, drive to Shop and Commissions.
**Layout** (top to bottom, single column, `max-width:1180px` centered, nav full-bleed):
1. **Nav bar** (`.nav`): brand wordmark left, links (Home/Shop▾/Commissions/About/Contact) center-right, cart icon far right.
2. **Hero**: full-bleed section, `78vh` min `520px` tall, background image (currently `image-slot` placeholder — intended as a photo or video of Poppa at his desk) with a left-to-right dark gradient overlay, white kicker/headline/subcopy/two CTAs ("Explore the Shop" primary, "Request a Commission" secondary) left-aligned.
3. **Featured Originals**: kicker + h2, 4-column grid of `.card`s, each a square `.plate` image, title, "One of a Kind" `.tag-outline`.
4. **Shop by Category**: h2, 3×2 grid of image tiles linking to Shop anchors (`#writing-tools`, `#inks`, `#finished-art`, `#carved-paper`, `#kits`, `#stationery`).
5. **Commission Callout**: horizontal `.card` — image left, kicker/h3/copy/primary CTA right, linking to Contact.
6. **About Teaser**: 2-column, image left (workshop/Poppa & Momma), copy right with "Read their story →" link.
7. **Instagram strip**: kicker "@poppascalligraphy", 6-column grid of square image placeholders (intended as a live Instagram embed).
8. **Footer**: copyright + social icons.

### 2. Shop (`Shop.dc.html`)
**Purpose**: Single browsable catalog, filtered by sidebar category links (all categories on one page, anchor-linked, not paginated routes).
**Layout**: 220px sticky sidebar (category list, anchors) + main content column.
Sections in order, each `id`-anchored and matching the sidebar links:
- **Writing Instruments & Tools** (`#writing-tools`): Turned Dip Pen Holder ($38), Nib & Pen Storage Box ($52) — standard product cards with price + "Add to Cart".
- **Inks & Materials** (`#inks`): Handmade Walnut Ink ($16), tagged "Bottled in recycled jars" (`.tag-neutral`).
- **Finished Art & Paper Goods** (`#finished-art`): Custom Monogram Piece, Quote Piece, Recipe Cards & Bookplates — each tagged "One of a Kind" (`.tag-outline`) and using a **"Request a Similar Commission" secondary-button link to Contact instead of Add to Cart** (these are one-of-a-kind originals, not shoppable stock).
- **Carved Paper Art** (`#carved-paper`): two originals, same one-of-a-kind + commission-request pattern.
- **Kits & Experiences** (`#kits`): Beginner Calligraphy Kit ($45), Workshop-in-a-Box ($68, includes video) — standard Add to Cart.
- **Stationery** (`#stationery`): Note Cards & Envelopes ($14/set of 8), Paper Bookmarks ($6) — standard Add to Cart.
**Key distinction to preserve**: originals (Finished Art, Carved Paper) never get "Add to Cart" — they route to the Contact/commission flow. Everything else is standard e-commerce.

### 3. Commissions (`Commissions.dc.html`)
**Purpose**: Explain what kinds of commission work are offered, funnel to the Contact form (there is intentionally no separate commission-request form — it reuses Contact).
**Layout**:
1. Header: kicker "Made to Order", h1 "Commissions", intro copy.
2. 3-column grid of 5 `.card`s: Monograms & Name Pieces, Quotes & Keepsakes, Carved Paper Art, Recipe Cards & Bookplates, "Something Else in Mind?" (open-ended catch-all). **Note: wedding suites were deliberately excluded — do not add a wedding-suite card.**
3. CTA card (centered, bordered): "Tell Poppa what you're picturing" + "Go to the Contact Form" primary button linking to Contact.

### 4. Contact (`Contact.dc.html`)
**Purpose**: General contact + the de facto commission-request intake + FAQ.
**Layout**: 2-column below a header (kicker "We'd Love to Hear From You", h1 "Contact").
- **Left**: form (Name, Email, Message — `.field`/`.input`), "Send Message" primary button, social icons row below.
- **Right**: FAQ using native `<details>`/`<summary>` accordions (first one open by default) — Shipping, Care instructions, Commission timelines. Custom `+`/`–` marker via CSS `::after`.

## Interactions & Behavior
- Nav links are plain anchor navigation between the 4 pages (`Home.dc.html`, `Shop.dc.html`, `Commissions.dc.html`, `Contact.dc.html`); "About" is referenced in nav/copy but not yet built.
- Shop sidebar links are same-page anchor scrolls (`#id`), not route changes.
- FAQ accordions: native `<details>` open/close, no JS.
- No client-side cart logic implemented — "Add to Cart" buttons are visual only in this prototype.
- Forms have no submit handler (`onsubmit="return false"`) — wire up real submission logic in the target app.
- Hover states throughout should use the design system's accent-ramp hover/focus rules (see design-system-readme.md "Interaction states") — don't rely on browser defaults.

## State Management
Minimal for this prototype — mostly static content pages. Target implementation will need:
- Cart state (items, quantities) for Shop's shoppable categories only (exclude one-of-a-kind originals).
- Contact/commission form state + submission (occasion, size, budget, reference-photo upload — per the original site map, though the current Contact form only has Name/Email/Message; the fuller commission-intake fields should be added to this same form when building for real).
- Instagram feed: intended to be a **live embed/API pull** of the last 4–6 posts, not static images — integrate the real Instagram Graph API or an embed widget.

## Design Tokens
See `ds/styles.css` for the authoritative source. Key values:
- Colors: `--color-bg: #f3f2f2`, `--color-text: #201f1d`, `--color-accent: #b68235` (plus 100–900 ramps for accent and neutral).
- Fonts: `--font-heading` = Cormorant Garamond, `--font-body` = Lora; heading weight caps at semibold (`--font-heading-weight`).
- Spacing scale: `--space-1` … `--space-8` (1.15× density).
- Radius: `--radius-sm/md/lg` (4px base).
- Shadows: `--shadow-sm/md/lg` (very subtle — "elevation is a whisper").

## Assets
All product/scene photography is currently **placeholder** (`<image-slot>` drag-and-drop placeholders in the prototype, each with a descriptive label e.g. "Poppa at his writing desk, pen in hand", "Walnut ink in recycled jar"). None of these are final assets — real photography/video needs to be shot and dropped in per the placeholder's stated subject. Search each file for `placeholder="..."` to get the full shot list.

## Files
- `Home.dc.html`, `Shop.dc.html`, `Commissions.dc.html`, `Contact.dc.html` — the four page prototypes.
- `ds/styles.css` — the full design-system stylesheet (tokens + component classes).
- `design-system-readme.md` — design system rationale, do/don't guidance, full component reference.
- `image-slot.js` — the prototype's placeholder-image web component; not needed in the rebuild, included for reference only (shows where/what images go).

## Shop: Inventory & Checkout
Standard shop items (currently Bob's Ink Shop) are sold through Stripe Checkout, with stock kept in a Google Sheet. Commission originals are separate: a request form plus a Stripe Payment Link sent by hand, which these functions ignore.

- `netlify/functions/get-inventory.mjs` reads the sheet's **Master Inventory** tab; the Ink Shop page (`js/shop.js`) shows live price and stock for each card marked `data-sku`.
- **Cart:** "Add to Cart" stores items in the browser (`js/cart.js`, localStorage with an in-memory fallback if storage is blocked); every page's nav shows the cart count. `cart.html` (`js/cart-page.js`) re-checks the cart against the sheet on load (prices updated, quantities capped to stock, sold-out items removed with a message) and sends all items to checkout at once.
- `netlify/functions/create-checkout.mjs` starts one Stripe Checkout Session for the whole cart, re-reading the sheet so the price charged is always the sheet's current price and every item's stock is checked. If anything can't be sold as asked, it creates nothing and lists every problem so the cart can fix them.
- `netlify/functions/stripe-webhook.mjs` handles `checkout.session.completed`: it logs an `ORDER TO SHIP` line (buyer, email, address, items) and subtracts what was bought from **Quantity** on the **Easy Edit** tab.
- Environment variables are listed and explained in `.env.example`; set them in Netlify, never in the repo.

**TODO: Shipping price and countries still to be decided before going live.** Checkout currently collects a US-only shipping address and charges nothing for shipping (see the TODO in `create-checkout.mjs`).

### Before going live
- [ ] Decide the shipping price and which countries to ship to, then update `create-checkout.mjs` (remove its TODO and this one).
- [ ] Switch Stripe from test to live keys: set `STRIPE_SECRET_KEY` to the live `sk_live_…` key in Netlify.
- [ ] Create the live-mode webhook endpoint in Stripe (`https://<site>/.netlify/functions/stripe-webhook`, event `checkout.session.completed`) and set `STRIPE_WEBHOOK_SECRET` to its live signing secret. Test-mode and live-mode secrets are different.
- [ ] Re-check the inventory Google Sheet is shared with the service account email (`GOOGLE_SERVICE_ACCOUNT_EMAIL`) as an **Editor**, so the webhook can update stock.
