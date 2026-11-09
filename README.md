# Table for Two — Solo & Couples Restaurant Finder

Responsive web app with Solo and Couples mode, location and radius search, cuisine/price/service filters, individual votes, mutual matches, random dinner picks, menu links, and restaurant-linked photos when data is available.

## Live hosting on Vercel

1. Upload this directory as a GitHub repository.
2. In Vercel, create a new project and import the repository.
3. Select **Other** as the framework preset and deploy (no API keys or build commands required).
4. Open the deployed HTTPS URL. Live searches use `/api/geocode` and `/api/restaurants` so the browser no longer needs to contact Nominatim or Overpass directly.

## Local test

Run `npm start`, then open `http://localhost:8080`. This provides the same server-side API endpoints as Vercel.

## Limitations

- Restaurant search currently uses the free OpenStreetMap + Nominatim + Overpass network, with fallback Overpass servers and short-lived server caches. This addresses browser CORS / preview restrictions, **but cannot guarantee the third-party directory is always available**.
- OpenStreetMap listings often lack prices, food photos, or explicit menus; the app displays official listing-linked assets when present and links to clearly labeled menu/food image searches otherwise.
- Couples voting works with two profiles on one device or separate devices via share/import codes. **There is no automatic device sync or account system.** Persistent shared rooms would require a database and authentication.
- For consistently rich menu/photo coverage, integrate a licensed Places data provider and required API keys/billing, subject to their attribution and photo usage terms. Don't scrape food photos from Google or Yelp.

No paid services or API keys are included.

## November 2026 reliability update

- Production restaurant requests now finish or fail in a bounded period and try two independent Overpass instances concurrently.
- Demo restaurants and the demo button were removed, including old fictional listings persisted in browser storage.
- If the free upstream directory is overloaded, the app shows an error and preserves prior real results.

## Search responsiveness (November 2026)
- Total client-side search deadline: 8.5 seconds, including geocoding. The Find button always resets.
- Default Addison, TX search skips redundant geocoding.
- Backend requests public directory servers in parallel with a 6.9-second deadline.
- When free listings fail, show an external Google Maps restaurant-search link instead of synthetic/demo listings.
- A managed Places API with a server-side key is recommended for reliably fast listings, menus and food photos.

## Google Places API setup (November 2026)
1. Create a Google Cloud project and enable billing.
2. Enable **Places API (New)** and **Geocoding API**.
3. Create a server-side key with API restrictions for those services, configure Google Cloud usage quotas and billing alerts.
4. In Vercel for `table-for-two`, create the **encrypted** `GOOGLE_PLACES_API_KEY` variable for Production and Preview; redeploy.
5. The key must never go in GitHub, frontend HTML or chat messages.

The app now uses Google Places Nearby Search, not public Overpass/Nominatim. Search requires an API key and returns an explicit setup error immediately if missing. The browser has an 8-second hard search deadline. One search returns at most 20 restaurants, and additional fields/photos may incur charges. Photo resource names are not persisted to localStorage. The old offline service worker is unregistered to prevent stale caching.
