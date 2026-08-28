# herdr keys

Static trainer for stock Herdr 0.8.2 key chords and CLI commands. Learn uses spaced repetition and XP unlocks. Test checks every learned drill without hints. Race is a 60 second sprint with shareable results. Progress stays in `localStorage`; the URL hash carries a portable save.

## Local

Serve `public/`:

```bash
python3 -m http.server 4173 --directory public
```

Then open http://localhost:4173.

## Test and checks

```bash
npm test
npm run lint
npm run complexity
npm run check
```

## Deploy (Cloudflare Workers static assets)

```bash
npx wrangler@latest deploy
```

This uses Workers Static Assets at [lernrherdr.dev](https://lernrherdr.dev). The `*.workers.dev` address remains available as a fallback.

## Notes

- Quiz content follows `herdr --default-config` defaults, not personal config overrides.
- Prefix key means Ctrl+B, release, then the action key.
- Footer credits [@claytonlz](https://x.com/claytonlz) and [labountylabs.com](https://labountylabs.com).
