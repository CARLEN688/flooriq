# FloorIQ

End-to-end AI platform for flooring stores: quoting, blueprint takeoff, orders,
install scheduling, inventory & purchasing, and an AI product spec assistant.
Standalone Next.js + Supabase.

## Full flow (all wired & build-verified — 12 routes)
1. **Sign up / sign in** (`/login`) — Supabase Auth; profile auto-created.
2. **Onboarding** (`/onboarding`) — create store, become admin, default rules seeded.
3. **Customers & jobs** (`/jobs`) — builder/retail customers and jobs.
4. **Takeoff** (`/takeoff`) — upload a blueprint, set scale, draw rooms OR **AI-detect
   rooms** (vision model), assign products from a colour-coded palette, generate quote.
5. **Rules** (`/rules`) — estimators edit material/labour/margin and waste % per pattern.
6. **Quotes** (`/quotes`) — Draft/Sent/Won/Lost pipeline, PDF, convert won → order.
7. **Orders** (`/orders`) — sequential order numbers, fulfilment status.
8. **Schedule** (`/schedule`) — installs auto-spawn from orders; assign crews + dates;
   manage crews and capacity.
9. **Inventory** (`/inventory`) — stock levels with low-stock flags; **one-click PO**
   generated from low stock at the cheapest supplier; PO detail + status.
10. **Assistant** (`/assistant`) — AI product spec Q&A grounded in your own catalog
    (RAG over pgvector), with cited sources. "Sync catalog" indexes products.

## Backend (project fygheddwnskcmdqdeuxl, ca-central-1)
- Tables + multi-store RLS across quoting, orders, scheduling, inventory, purchasing
- Edge functions: `quote-calc`, `room-detect` (vision), `spec-assistant` (RAG)
- Auth-guarded RPCs: create_store_and_join, set_quote_status, convert_quote_to_order,
  schedule_install, create_po_from_low_stock
- Triggers: auto-profile on signup, auto-install on order, updated_at maintenance

## Enable the AI features (optional)
`room-detect` and `spec-assistant` need an OpenAI key. Until set, both degrade
gracefully (manual takeoff + a clear "not configured" note). To enable:
```bash
supabase secrets set OPENAI_API_KEY=sk-... --project-ref fygheddwnskcmdqdeuxl
```
Then open `/assistant` and click **Sync catalog** once to index your products.
Vision uses gpt-4o-mini; embeddings use text-embedding-3-small.

## Run locally
```bash
cp .env.local.example .env.local   # pre-filled for the flooriq project
npm install
npm run dev                        # http://localhost:3000
```

## Demo data already seeded
Demo store has products, pricing/waste rules, 2 suppliers, inventory (2 items low),
and 2 crews — so Inventory, PO generation, and Schedule all have live data to show.

## Next candidates
- Crew capacity-aware auto-scheduling (suggest the best crew/date by sqft/day).
- Receiving a PO auto-increments inventory on hand.
- Branded server-rendered PDFs; email quote/PO to the customer/supplier.
- Manager dashboard: win rate, margin, throughput, install calendar view.
