# WhenFree — CLAUDE.md

## What this project is
A scheduling web app (like When2meet/Doodle) where a host creates an event, shares a link, and invitees mark their availability on a time grid. The app finds the best overlapping slot.

## File structure
- `index.html` — HTML structure only (views, forms, buttons)
- `style.css` — All CSS (design tokens, layout, components)
- `app.js` — All JavaScript (Supabase, auth, routing, grid logic)

No build step. No framework. Plain HTML/CSS/JS served as a static site.

## Hosting
- **Frontend**: GitHub Pages (serves `index.html` from `main` branch)
- **Database + Auth**: Supabase (hosted Postgres with RLS)

## Database (Supabase)
Two tables:

**`events`**
- `id` (text, primary key) — `evt_<timestamp>`
- `name`, `description`, `date_from`, `date_to`, `time_start`, `time_end`
- `user_id` (uuid, references auth.users)
- `created_at`

**`responses`**
- `id` (uuid, auto)
- `event_id` (text, references events, cascade delete)
- `name` (text) — respondent's display name
- `slots` (text[]) — array of `"YYYY-MM-DD|HH:MM"` keys
- `user_id` (uuid, nullable — guests don't need an account)
- `created_at`

## Key conventions
- Time slot keys are formatted as `"YYYY-MM-DD|HH:MM"` (built by `buildSlotKey()`)
- The `mapEvent()` function maps Supabase column names to the internal `evt` object shape
- All views are single-page — routing is done via `location.hash` (`#respond/<id>`, `#dashboard/<id>`)
- Auth is required to create events; guests can respond without an account

## External dependencies (CDN)
- `@supabase/supabase-js@2`
- `@emailjs/browser@4` (email notifications — keys not yet configured)

## Known limitations
- The "Find Best Time" Claude API call is made directly from the browser and will fail due to CORS in production — it falls back gracefully to a plain text message
- EmailJS keys (`EMAILJS_PUBLIC_KEY`, `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`) are placeholders in `app.js` and need to be filled in
