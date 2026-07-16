# Design Brief — Credit Card Optimizer (PWA)

## What this product is

A personal AI advisor that answers one question brilliantly: **"Which of my credit cards should I use for this purchase?"** The user asks in natural language ("₹2500 dinner on Swiggy"), a multi-agent AI pipeline retrieves their cards' actual reward rules, computes the exact cashback for each card deterministically, and recommends the winner with the rule quoted as proof.

Positioning: premium fintech — think the polish of Cred/Jupiter meets the intelligence of an AI copilot. It must feel *trustworthy with money* and *magical with AI*, never gimmicky.

Platform: responsive web app (Next.js), installable PWA. Mobile-first — the core "which card?" moment happens at checkout, on a phone. Dark theme is the primary theme (design dark first, light as a variant). Currency is INR (₹).

---

## Screens to design

### 1. Landing / Sign-in
- Hero that communicates the value prop in one glance: pick a hero visual that shows the product doing its job (e.g., a floating phone/card fan with a live recommendation card).
- Single CTA: "Continue with Google" (that's the only auth method).
- Below the fold: a 3-step "how it works" (add your cards → ask anything → get the math-backed answer) and a short section on trust ("we compute rewards from the banks' actual T&Cs, not guesses").
- Subtle ambient motion in the hero (slow gradient shift, floating card tilt/parallax). Nothing that fights the CTA.

### 2. Auth transition
- A brief "signing you in" moment (we redirect through Google and back). Design a delightful micro-moment, not a blank spinner — e.g., the brand mark assembling, then a smooth handoff into the dashboard.

### 3. Dashboard — the core screen
This is 90% of the product. It has three jobs, in priority order:

**A. The Ask bar (primary element)**
- Large, inviting input — feels like a chat/spotlight command bar, not a form field. Placeholder cycles through example queries ("₹2000 groceries on Blinkit…", "Flight to Goa, ₹8500…").
- On submit, the bar stays anchored and the answer materializes below it.
- Support keyboard submit (Enter), a clear submit button, and a disabled/loading state.

**B. The AI pipeline moment (the signature interaction — invest here)**
While the answer streams, the UI shows the agent working through five live stages, each completing in sequence (real events from the backend, arriving seconds apart):
1. Understanding your purchase → shows extracted merchant + amount as chips when done
2. Reading your cards' reward rules → shows "8 rules found"
3. Ranking the relevant rules
4. Calculating your rewards → this is deterministic math, worth emphasizing ("no AI guessing")
5. Writing your recommendation

Design this as an elegant progress narrative: a vertical stepper / timeline with states (pending → active with animation → complete with checkmark and a result chip). Active step gets a shimmering/breathing treatment. Steps collapse or compress once the answer arrives. Must also design the failure state (a step erroring out, retry affordance).

**C. The answer (the payoff)**
- **Winner card**: a hero result — the winning credit card rendered as a beautiful card visual, the reward amount in large type ("₹250 back"), effective rate (10%), and a one-line why.
- **Comparison**: the runner-up cards below with animated horizontal reward bars (bars grow on reveal, staggered), each showing rate + ₹ amount + the actual rule excerpt in a quotable style (it's the proof — make it feel like a citation, expandable if long).
- **Recommendation text**: rendered rich text (bold, quotes) — design typographic hierarchy for it.
- Number count-up animation on the ₹ amounts.
- A "new question" affordance that gracefully clears the stage.

### 4. My Cards (wallet management)
- The user's cards as visual card objects (bank name, card name, network badge) — a horizontal carousel or fanned stack on mobile, grid on desktop.
- Add-a-card flow: browse/search the global catalog, tap to add ("I own this"). Design the catalog item, search/filter by bank, and the added-confirmation micro-animation (card flies into the wallet).
- Remove interaction with confirm (swipe-away or long-press on mobile).
- Empty state: no cards yet — this is onboarding-critical. Make it warm and directive ("Add your first card to get personalized answers").
- Note: we don't have card artwork; design a system that generates attractive gradient/pattern card visuals from bank + network (e.g., HDFC = one hue family, Visa/Mastercard/RuPay/Amex badges).

### 5. Analytics (light, v1)
- A small "insights" strip or section: total potential rewards this month, most-recommended card, recent questions history (each past query recallable with one tap).
- Design the query-history item (question → winning card → ₹ amount).

### 6. System states (design all of these)
- First-run onboarding (signed in, zero cards)
- Loading skeletons for cards/dashboard data
- Error toast/banner system (API down, LLM timeout — friendly, retry-first copy)
- Session expired → gentle re-auth prompt
- Free-tier cold start: first query after idle can take ~20–40s — the pipeline stepper absorbs this, but design step-1 copy for a long wait ("waking up the brain…")
- Offline (it's a PWA): cached shell + "you're offline" state

---

## Motion & feel

- Overall vibe: fluid, weighty, physical. Springy easing (no linear tweens), 200–400ms for UI transitions, staggered reveals for lists.
- Page transitions: soft cross-fade + slight vertical drift; no hard cuts.
- The pipeline stepper and the answer reveal are THE moments to choreograph: pipeline completes → brief beat → winner card scales/settles in with the ₹ count-up → bars stagger in → text fades up.
- Micro-interactions everywhere: button press states, input focus glow, card hover tilt (desktop), pull-to-refresh (mobile).
- Respect `prefers-reduced-motion` with a dignified static alternative.

## Visual language

- Dark-first palette: deep neutral base (not pure black), one confident accent for actions, a success/reward color for ₹ amounts (money moments should glow), restrained gradients. Avoid generic "crypto neon."
- Typography: a characterful display face for numbers/₹ amounts (tabular figures for math), clean grotesque for UI. Large numerals are a brand asset — rewards are the product.
- Depth via soft elevation and subtle borders, not heavy shadows.
- Iconography: one consistent set, outlined, 1.5px stroke.
- Design tokens: deliver color/spacing/radius/type scale as variables (we implement in CSS custom properties).

## Layout & responsive

- Mobile (~390px): single column, Ask bar prominent near top, cards as swipeable carousel, bottom padding for PWA safe areas.
- Desktop (≥1024px): max-width ~1100px centered; Ask + answer as the main column, wallet either as a right rail or a section below.
- Tablet: single column, scaled up.

## Accessibility

- WCAG AA contrast throughout (test the reward-green on dark).
- Full keyboard path: ask → read answer → manage cards.
- Focus states designed, not default.
- The pipeline stepper must have text labels (not color/animation alone) and be screen-reader announceable as steps complete.

## Technical constraints (so the design fits reality)

- Frontend is Next.js/React with plain CSS — deliver specs implementable without heavy animation libraries (CSS transitions/keyframes + small JS; Framer-Motion-level complexity is acceptable).
- The five pipeline stages stream as discrete server-sent events — the stepper advances on real events (variable timing), so animations must loop gracefully while waiting.
- Recommendation text arrives as markdown.
- Card data available per card: bank_name, card_name, network. Reward data per result: rate (%), estimated ₹, rule excerpt text, rule section title.
- No card artwork assets exist; card visuals must be generated from data (see §4).
- App icon needed: 192×192 and 512×512 PWA icons + favicon, matching the brand mark.

## Deliverables requested

1. High-fidelity screens for all of the above (mobile + desktop), dark theme primary
2. The pipeline stepper and answer-reveal choreography specified frame-by-frame (or as a prototype)
3. Component sheet: buttons, inputs, cards, chips, toasts, skeletons — all states (default/hover/active/focus/disabled/loading)
4. Design tokens (colors, type scale, spacing, radii, motion durations/easings)
5. Empty/error/loading states for every screen
6. PWA icons + brand mark
