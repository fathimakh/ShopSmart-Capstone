# ShopSmart: MERN + AI Shopping Assistant

**Full Stack Development V8 capstone project, "MERN + AI (Full Stack Completion)"** · by **Fathima K H**

ShopSmart is an online store that understands a shopping request written as a normal
sentence. It began as a front-end mini project and is now a full MERN application: a
**React 18 + Vite** client talking to a **Node.js + Express 5 + MongoDB** REST API with
**JWT authentication** and **customer and admin roles**, real **orders with stock
reservation**, **reviews with verified purchases**, a recorded **weekly price history with a
regression forecast**, **Google Gemini on the server** for natural language search and review
summaries, **TF-IDF recommendations** in the browser, and an **admin panel** for the
dashboard, products, orders and accounts.

| | |
|---|---|
| **Live website** | Added after the first deploy |
| **Live API** | Added after the first deploy |
| **Repository** | Added after the first push to GitHub (planned name: fathimakh/ShopSmart-Capstone) |
| **Demo shopper** | `demo@shopsmart.dev` / `Demo@1234` (16 demo orders) |
| **Demo admin** | `admin@shopsmart.dev` / `Admin@1234` |

The sign in page has **Demo Shopper** and **Store Admin** buttons that sign in with these
accounts in one click. Every visitor shares them, so the API refuses to change their
password, sign them out of every device, change their role or delete them. The API is set
up for Render's free plan, which sleeps after 15 minutes without traffic. The first request
after that takes about a minute; the site waits up to 60 seconds and shows "Waking up the
server" meanwhile.

![Home page](docs/screenshots/01-home.jpg)

## From mini project to capstone

The mini project (the first 32 commits of this repository, August 2026) was a front-end
only React app. The browser fetched the DummyJSON catalogue, kept the cart, wishlist and
placed orders in local storage, called Gemini directly with a key built into the JavaScript
bundle, and rebuilt each product's price history from its discount. It was hosted on Netlify
as a static site.

The capstone keeps the React front end, moves it into `client/`, and puts a real server
behind it in `server/`:

| Area | Mini project | Capstone |
|---|---|---|
| Accounts | None | Sign up and sign in with JWT, customer and admin roles, an account page with the saved delivery address, password change and "sign out of every device" |
| Catalogue | Fetched from DummyJSON by the browser | 194 products in MongoDB, seeded from a saved DummyJSON snapshot (`server/data/catalogue.json`), served by `GET /api/products` and edited by admins |
| Cart, wishlist, recently viewed | Local storage | Saved to the account through `/api/lists` and merged with a guest's lists at sign in. Guests still use local storage |
| Checkout and orders | Kept in local storage; the status moved on by date | `POST /api/orders` prices every line from the database, reserves the stock and numbers the order from `SS100001`. Shoppers cancel while it is processing; admins ship, deliver or cancel it, and every step is kept in its history |
| Reviews | Three read-only catalogue reviews per product | 582 imported reviews plus reviews shoppers write, edit and delete (one per product), a verified purchase badge from delivered orders, and a rating that blends both |
| Price history | Rebuilt in the browser from the discount | Twelve weekly prices stored per product by the seed, a new point on every admin price change, and the forecast worked out on the server |
| Gemini | Called from the browser, key visible in the bundle | Called only by the server (`server/services/gemini.js`). The key never reaches the browser. AI review summaries are new |
| Admin | None | `/admin`: dashboard, products, orders and accounts, behind the admin role in the API and in the UI |
| Tests | None | 149 API tests (`node:test` + supertest) and 243 client tests (Vitest + Testing Library) |
| Hosting | Netlify static site | Render web service for the API, Render static site for the client, MongoDB Atlas, all described in [`render.yaml`](render.yaml) |

## What it does

**Shoppers** browse 194 products in 24 categories. The home page shows the day's biggest
discounts, category tiles, the AI search box and "Recommended for you". Category pages and
the shop grid have keyword search, price, rating and brand filters shown as removable chips,
and sort orders for price, rating, popularity, newest and discount. A product page has the
gallery, specifications, stock, the price outlook, reviews with the AI summary, and similar
products. Shoppers can compare up to four products, keep a wishlist, and fill a cart that
shows the discount savings and free delivery over $150. Checkout needs an account and has
three steps: delivery (filled in from the account), payment (card, UPI or cash on delivery)
and review. The order page shows a progress timeline, allows cancelling while the order is
processing, and has a buy again button. The assistant page is a chat that turns a sentence
into filters and keeps refining across turns.

**Admins** see a dashboard with revenue, orders waiting to ship, product and account counts,
sales for the last 14 days (counted in the store's time zone), orders by status, low stock,
bestsellers and the latest orders. They add, edit and delete products (with the recorded
price history and forecast beside the form), search and filter every order, move an order to
its next allowed status with an optional note, and search accounts, change a role or delete
an account. The API enforces the admin role on every admin endpoint; the UI shows a shopper
who opens `/admin` a "store admins only" panel.

## AI features

Two features use **Google Gemini** (`gemini-2.5-flash`) on the server. Two more are
classic techniques written by hand, with no Gemini call: TF-IDF recommendations in the
browser and a least squares price forecast on the server.

### 1. Natural language search (Gemini)

The assistant page (`/assistant`) and the AI search box on the home page take a request such
as "gift for my wife who loves perfume, up to 150" and turn it into the shop's filters.

1. The client asks `GET /api/ai/status` whether Gemini is set up (the answer is cached for
   five minutes).
2. It sends the message, and the earlier turn for a follow-up such as "show cheaper
   options", to `POST /api/ai/search`.
3. The server (`server/services/aiSearch.js`) sends Gemini the message with the real
   category slugs and brand names from the database. The request uses Gemini's
   [structured output](https://ai.google.dev/gemini-api/docs/structured-output): the reply
   must be JSON that follows a response schema, and the category and brand fields are enums
   of those lists. Temperature is 0.1, thinking is turned off on the 2.5 Flash models to
   keep the reply quick, and the server waits at most 9 seconds (`GEMINI_TIMEOUT_MS`).
4. A schema guides the model but does not bind it, so `toSearchResult` checks the reply field
   by field. Unknown categories and brands are dropped, prices must be positive and are
   swapped when reversed, the rating must be above 0 and at most 5, the sort key must be one
   the shop supports, keywords are cleaned and capped at 8, and the summary at 300
   characters. A reply without the agreed shape is a `502 AI_FAILED`.
5. The client matches the filters against the catalogue it loaded, applies them, and ranks
   the matches by TF-IDF relevance to the keywords.

**Fallback.** The rule-based parser from the mini project (`client/src/utils/nlpSearch.js`)
answers on the device when the server has no key, Gemini is busy or over its quota (`503`),
too slow (`504`) or gives an unusable reply (`502`), the visitor hits the rate limit
(`429`), the network fails, or the reply has no filters and no keywords. It reads price
phrases, ratings, discounts, sort wording, brands and everyday product words, and
`mergeWithPrevious` keeps follow-ups working. Every answer says which engine read it, and
why the device stepped in.

### 2. Review summaries (Gemini)

`GET /api/products/:id/review-summary` (`server/services/reviewSummary.js`) gives Gemini the
newest 50 reviews of a product and asks for a verdict of one or two sentences with up to four
pros and four cons. The reply has its own response schema and is checked by
`toReviewSummary` (verdict at most 400 characters, each point at most 120). The summary is
cached on the product with a SHA-256 fingerprint of the reviews it read, so Gemini is asked
again only after a review is added, edited or deleted. Requests for the same product that
arrive while a summary is being written share that one call. Without a key the client does
not ask at all: the product page shows a quiet line saying the summary is not available, and
the reviews are unaffected.

### Keeping the key and the quota safe

- `GEMINI_API_KEY` is read only by `server/config/env.js` and sent to Google in the
  `x-goog-api-key` header, not in the URL, so it never appears in a log line. The client has
  no key and no Gemini code.
- The system prompts tell the model to treat the shopper's message and the reviews as text
  to read, never as instructions.

| Limit | Setting | Local default | `render.yaml` |
|---|---|---|---|
| AI searches per visitor address per 15 minutes | `AI_RATE_LIMIT_MAX` | 60 | 60 |
| New review summaries per visitor address per 15 minutes (counted apart from search; cached summaries do not count) | `AI_RATE_LIMIT_MAX` | 60 | 60 |
| New review summaries per day for the whole server, from midnight UTC | `AI_SUMMARY_DAILY_MAX` | 100 | 50 |

The daily cap keeps product browsing, or a script walking every product page, from using up
the key's daily quota that AI search also needs.

### 3. Recommendations (TF-IDF, in the browser)

`client/src/utils/textIndex.js` builds a TF-IDF vector for every product from its title
(weight 3), brand, category and tags (weight 2) and description (weight 1).
`client/src/utils/recommend.js` uses it twice:

- **Similar products** on the product page: cosine similarity between two products, plus a
  boost for the same category and the same brand, and a small one for a close price that
  only applies to products that are already related.
- **Recommended for you** on the home page: the products in the cart (weight 3), the
  wishlist (weight 2) and the recently viewed list (weight 1) are merged into one taste
  profile, recent ones counting more, and the closest products not seen yet are shown. For a
  signed in shopper those lists come from the account.

The same index ranks the assistant's matches by relevance to its keywords, so a rare word
counts for more than a common one. It all runs over the catalogue the client has already
loaded, with no server call.

### 4. Price drop forecast (least squares regression, on the server)

`server/services/pricePredict.js` reads a product's recorded prices: twelve weekly prices
from the seed plus a point for every admin price change (the latest 26 are kept). A price
holds until the next change, so each week without one counts as a week at that price. A
least squares line is fitted through the last twelve weeks against time and carried two
weeks forward, kept within 40% of today's price. R squared becomes the confidence. The
verdict is "likely to drop" or "likely to rise" when the confidence is at least 35 and the
change at least 2%, otherwise "holding steady". With fewer than three points, or less than
three weeks of history, the page says there is not enough history yet. The product page
draws the recorded prices with the dashed forecast, and the admin product page lists them.

## Architecture

```mermaid
flowchart LR
    subgraph Browser["React 18 SPA (Vite) - client/"]
        UI["Pages and components<br/>React Router 6"] --> CTX["Contexts<br/>Auth, Catalog, Shop"]
        CTX --> HTTP["services/http.js<br/>fetch, VITE_API_URL, Bearer token"]
        UI --> LOCAL["On-device helpers<br/>TF-IDF recommendations<br/>rule-based query parser"]
        CTX --> LS[("localStorage<br/>token, guest lists, chat")]
    end
    HTTP -->|"HTTPS + JSON<br/>Authorization: Bearer JWT"| API
    subgraph Server["Express 5 API - server/"]
        API["routes and middleware<br/>helmet, CORS, rate limits,<br/>sanitizeBody, protect, authorize, validateBody"] --> C["controllers"]
        C --> M[("MongoDB<br/>users, products, orders,<br/>reviews, counters")]
        C --> AI["services/gemini.js<br/>aiSearch, reviewSummary"]
        C --> PP["services/pricePredict.js<br/>least squares forecast"]
    end
    AI -->|"generateContent<br/>JSON response schema"| G["Google Gemini API<br/>gemini-2.5-flash"]
```

- The client loads the whole catalogue once (`GET /api/products?limit=0`) and filters,
  searches and sorts it in the browser, so browsing stays instant. The API supports the same
  filters, sorting and paging, which the admin tables use.
- Everything personal (the session, saved lists, orders, reviews) and everything that
  decides money or stock goes through the API.
- In development the client calls `/api` on its own origin and the Vite dev server passes the
  request to Express, so no CORS setup is needed. In production the client is built with
  `VITE_API_URL`, and the API accepts browser requests only from the origins in `CLIENT_URL`.
- On Render the API is a Node web service and the client a static site, both built from this
  repository by [`render.yaml`](render.yaml), with the database on MongoDB Atlas.

## Repository structure

One repository with both apps, each with its own `package.json`, `.env.example` and tests.

```
ShopSmart-Capstone/
├── client/                      React 18 + Vite storefront and admin panel
│   ├── src/
│   │   ├── components/          one folder per component, JSX and CSS together; admin/ for the admin panel
│   │   ├── context/             AuthContext, CatalogContext, ShopContext
│   │   ├── hooks/               the assistant conversation, admin data loading, debounce, route focus
│   │   ├── pages/               shop, checkout, orders and account pages; admin/ for the admin pages
│   │   ├── services/            http.js (the one API client), products, orders, reviews, AI, admin
│   │   ├── utils/               filters, nlpSearch, textIndex, recommend, priceChart, checkout validation
│   │   ├── styles/, test/       shared browse styles, test setup and fakes
│   │   └── App.jsx, main.jsx, index.css
│   ├── public/                  favicon and the Netlify _redirects file
│   ├── vite.config.js           dev server on port 3000, the /api proxy, Vitest settings
│   ├── netlify.toml, vercel.json   SPA rewrites kept from the mini project
│   └── .env.example
├── server/                      Node.js + Express 5 + MongoDB API
│   ├── index.js, app.js         start-up and the Express app
│   ├── config/                  env.js (settings and start-up checks), db.js
│   ├── routes/, controllers/    auth, products, reviews, lists, orders, AI, admin, users
│   ├── middleware/              auth (protect, authorize), rate limits, body sanitising, validation, errors
│   ├── models/                  User, Product, Order, Review, Counter
│   ├── validators/              request rules for each area
│   ├── services/                gemini.js, aiSearch.js, reviewSummary.js, pricePredict.js
│   ├── utils/                   ApiError, token signing, the demo account lock, query reading
│   ├── scripts/                 seed.js, demoOrders.js, buildCatalogueSnapshot.js
│   ├── data/catalogue.json      the 194 product snapshot the seed loads
│   ├── tests/                   node:test + supertest suites
│   └── .env.example
├── docs/
│   ├── API.md                   endpoints, objects, error codes and server settings
│   └── screenshots/
├── render.yaml                  Render Blueprint: API web service + static site
├── .nvmrc                       Node.js 22
└── LICENSE                      MIT
```

## Run it locally

Requirements: **Node.js 22** (the version in `.nvmrc`), npm, and **MongoDB** (Docker, a local
install or Atlas). Clone the repository and open a terminal in its folder.

```bash
# 1. MongoDB on port 27017 (skip if one is already running)
docker run -d --name shopsmart-mongo -p 27017:27017 mongo:7

# 2. API on http://localhost:5050
cd server
npm ci
cp .env.example .env     # works as it is on your own machine
npm run seed             # 194 products, 582 reviews, the two demo accounts and 16 demo orders
npm run dev

# 3. Web app on http://localhost:3000 (a second terminal, from the repository folder)
cd client
npm ci
npm run dev
```

The client needs no env file in development: it calls `/api` and Vite forwards it to
`http://localhost:5050`. Copy `client/.env.example` to `client/.env.local` only to point that
proxy somewhere else or to build for a separately hosted API. `http://localhost:5050/api/health`
answers with `"status":"ok"`, `"db":"connected"` and `"ai":false`.

The `JWT_SECRET` in `.env.example` is fine on your own machine; a production server refuses
it. To make a real one:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

For the Gemini features, put a key from [Google AI Studio](https://aistudio.google.com/apikey)
in `server/.env` as `GEMINI_API_KEY` and restart the API; `/api/health` then says
`"ai":true`. Without it everything else works, AI search answers on the device and the review
summary is hidden.

| Folder | Script | What it does |
|---|---|---|
| `server` | `npm run dev` | API with nodemon, restarts on changes |
| `server` | `npm start` | API without nodemon (what Render runs) |
| `server` | `npm run seed` | Replaces products and reviews, refreshes the demo orders, keeps every other account and order |
| `server` | `npm run seed -- --fresh` | Also removes every account and order first; order numbers start again at `SS100001` |
| `server` | `npm run snapshot` | Downloads the DummyJSON catalogue again into `data/catalogue.json` (needs internet) |
| `server` | `npm test` | API tests |
| `client` | `npm run dev` | Vite dev server on port 3000 |
| `client` | `npm run build` | Production build into `client/dist` |
| `client` | `npm run preview` | Serves the build on port 4173, with the same `/api` proxy |
| `client` | `npm test` | Client tests (`npm run test:watch` to keep them running) |

### Demo data

- The seed gives `demo@shopsmart.dev` 16 orders placed over the last 13 days: 8 delivered,
  3 shipped, 2 processing and 3 cancelled, paid by card, UPI and cash on delivery, delivered
  to Kochi plus one gift order to Thrissur. Revenue is $1,444.41 from the 13 orders that were
  not cancelled.
- The order dates are counted back from the moment the seed runs, and the times of day follow
  the clock at that moment, so some orders show night-time hours. A few weeks later they drop
  out of the dashboard's 14-day chart. Running `npm run seed` again before a demo dates them
  back from the new run and keeps every other account and order. It also replaces the
  products and reviews, so reviews written by visitors and admin product edits are lost.
- After a seed, a product's stock is the catalogue's shelf count minus the units in
  processing and shipped orders. Delivered units count as sold but not against the stock
  (they have already left the shelf), and cancelled orders hold nothing. Kiwi, for example,
  shows 95 in stock and 7 sold. Orders placed afterwards take their units off the stock at
  checkout, and a cancel puts them back.
- The demo shopper can write a verified purchase review of a product from a delivered demo
  order, for example product 52, the Carbon Steel Wok. A product that is only in shipped
  orders gets no badge.

## Environment variables

Real `.env` files are git-ignored. The tables show the local value from `.env.example` and
the value [`render.yaml`](render.yaml) gives the hosted services. Full details:
[`docs/API.md`, section 7](docs/API.md#7-server-configuration).

**Server** (`server/.env`)

| Variable | Value (local, then Render) | Meaning |
|---|---|---|
| `NODE_ENV` | Local: `development`<br>Render: `production` | `development` logs requests and adds a stack trace to `500` answers. `production` turns on the start-up checks below |
| `PORT` | Local: `5050`<br>Render: set by Render | HTTP port |
| `MONGO_URI` | Local: `mongodb://127.0.0.1:27017/shopsmart`<br>Render: asked for at creation | MongoDB connection string with the database name |
| `JWT_SECRET` | Local: an example value<br>Render: generated by Render | Signs the tokens. In production the server will not start with fewer than 32 characters or the example value |
| `JWT_EXPIRES_IN` | Local: `7d`<br>Render: `7d` | Token lifetime |
| `CLIENT_URL` | Local: `http://localhost:3000`<br>Render: asked for at creation | Allowed browser origins, comma separated. In production it is required and each entry must be a bare origin such as `https://shopsmart-capstone-web.onrender.com` (no path, no trailing slash, lower case). In development any localhost port is allowed too |
| `AUTH_RATE_LIMIT_MAX` | Local: `50`<br>Render: `100` | Sign in, sign up and password change attempts per visitor address per 15 minutes |
| `AI_RATE_LIMIT_MAX` | Local: `60`<br>Render: `60` | AI searches, and separately new review summaries, per visitor address per 15 minutes |
| `AI_SUMMARY_DAILY_MAX` | Local: `100`<br>Render: `50` | New review summaries per day for the whole server |
| `GEMINI_API_KEY` | Local: empty<br>Render: asked for at creation, may stay empty | Google Gemini key. Without it the AI endpoints answer `503 AI_UNAVAILABLE` |
| `GEMINI_MODEL` | Local: `gemini-2.5-flash`<br>Render: `gemini-2.5-flash` | Gemini model |
| `GEMINI_TIMEOUT_MS` | Local: `9000`<br>Render: `9000` | How long to wait for Gemini before `504 AI_TIMEOUT` |
| `STORE_TIMEZONE` | Local: `Asia/Kolkata`<br>Render: `Asia/Kolkata` | Time zone of the dashboard's daily sales |
| `DEMO_ACCOUNT_EMAILS` | Local: not set, which means the seeded admin and `demo@shopsmart.dev`<br>Render: the same two, listed | Shared demo accounts the API locks against password change, sign out everywhere, role change and deletion. An empty value turns the lock off |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Local: `admin@shopsmart.dev`, `Admin@1234`<br>Render: not set, as the seed runs from a local machine | The admin account `npm run seed` creates. Keep these values: the sign in page's Store Admin button uses them |
| `TEST_MONGO_BASE_URI` | Local: not set, which means `mongodb://127.0.0.1:27017`<br>Render: not set | The MongoDB `npm test` uses. Never taken from `MONGO_URI` |

**Client** (`client/.env.local`, or the static site's environment)

| Variable | Development | Render | Meaning |
|---|---|---|---|
| `VITE_API_URL` | empty (the client calls `/api` through the Vite proxy) | asked for at creation: `https://shopsmart-capstone-api.onrender.com/api` | The API's address, ending in `/api`. Vite writes it into the bundle, so a change needs a new build |
| `API_PROXY_TARGET` | `http://localhost:5050` | not used | Where the dev server and `npm run preview` forward `/api`. Never part of the bundle |

## Testing and verification

| Check | Command | Result |
|---|---|---|
| API tests (`node:test` + supertest against a real MongoDB, Gemini stubbed) | `cd server && npm test` | **149 / 149 passing** in 12 files |
| Client tests (Vitest + Testing Library in jsdom) | `cd client && npm test` | **243 / 243 passing** in 47 files |
| Client production build | `cd client && npm run build` | builds without warnings |
| Browser run with Playwright (the screenshots below) | scripts kept outside the repository | no console errors or warnings, no failed API requests |
| Layout at 375, 768 and 1920 px (19 shop, shopper and admin pages) | Playwright | no horizontal scrolling, no console errors or warnings |

The API tests need a MongoDB at `mongodb://127.0.0.1:27017`, or `TEST_MONGO_BASE_URI` for one
elsewhere. Each file creates and drops its own `shopsmart_test_*` database, so the
development data is never touched, and Gemini is replaced by a stub, so no test calls Google.
They cover:

- **Auth:** sign up, sign in, the session check, profile and password changes, signing out
  on one or every device, and each `401` code (expired, invalid, revoked, deleted account).
- **Products and reviews:** search, filters, sorting and paging; admin create, edit and
  delete and the role check; one review per account, the blended rating, verified purchases
  and who may delete a review.
- **Orders:** server-side prices and totals, the delivery fee, stock reservation and
  `409 OUT_OF_STOCK`, cancelling, the admin status steps, and order lookups that never reveal
  another shopper's order.
- **AI:** the status endpoint, Gemini replies that are checked and cleaned, follow-ups,
  every failure code, the review summary cache, one shared call for simultaneous requests,
  the daily cap, and the summary allowance kept apart from search.
- **Price history:** the forecast maths, quiet weeks, and new points from admin price changes.
- **Admin and accounts:** the dashboard figures, role changes, deletion and the demo account
  lock.
- **Security and configuration:** NoSQL injection attempts, malformed ids, deeply nested and
  oversized bodies, CORS, security headers, and the production start-up checks.
- **Seed and demo data:** repeat runs, `--fresh`, the demo orders' totals and history, and
  stock and sold counts for every product matching what real checkouts produce.

The client tests cover the three contexts (session, catalogue, saved lists); the assistant,
cart, checkout, compare, login, orders, product and wishlist pages; the admin dashboard,
products, product edit, orders and accounts pages and the admin forms; components such as
the product card, reviews, review summary, price outlook and protected route; the API
client; and the utilities, among them the filters, the on-device parser, the TF-IDF
recommendations, checkout validation and the price chart.

Checked in a browser with Playwright against a freshly seeded database:

- A guest browses, filters a category, compares four phones, asks the assistant (answered on
  the device, as no Gemini key is set), fills a cart, signs in with the Demo Shopper button
  from checkout, and places order `SS100017` by card. The order page, order history and
  account page follow.
- The demo shopper opening `/admin` gets the "store admins only" panel.
- The admin opens the dashboard, products, a product's edit page, the orders list and the
  accounts list, and ships `SS100017` with a courier note.
- The commands under "Run it locally" were run in a clean copy of the repository against a
  scratch database: install, seed, both dev servers, the `/api` proxy and the client build.
- A Render-like run: `npm ci` without dev dependencies and `npm start` with
  `NODE_ENV=production` (the `CLIENT_URL` origin passes CORS, any other origin gets
  `403 CORS_ORIGIN_DENIED`), and the built client served with the same rewrite as the static
  site, where a deep link such as `/admin/orders/SS100011` reloads correctly. A real Render
  deploy has not been done yet.

## API

The full reference is [`docs/API.md`](docs/API.md): every endpoint with its fields, answers
and error codes, the objects, the rate limits and the server settings. Every endpoint lives
under `/api`. Success answers have `success: true`; errors have
`{ success: false, message, code }`, plus `errors` with one entry per invalid field.

| Area | Endpoints | Access |
|---|---|---|
| Health | `GET /api/health` | Public |
| Accounts | `POST /api/auth/register`, `POST /api/auth/login`, `GET` and `PATCH /api/auth/me`, `PATCH /api/auth/password`, `POST /api/auth/logout` | Public for sign up and sign in, then signed in |
| Products | `GET /api/products`, `GET /api/products/categories`, `GET /api/products/:id` | Public |
| Product editing | `POST /api/products`, `PUT /api/products/:id`, `DELETE /api/products/:id` | Admin |
| Price history | `GET /api/products/:id/price-history` | Public |
| Reviews | `GET`, `POST /api/products/:id/reviews`, `DELETE /api/products/:id/reviews/:reviewId`, `GET /api/products/:id/review-summary` | Reading is public; writing needs an account; authors and admins delete |
| AI search | `GET /api/ai/status`, `POST /api/ai/search` | Public, rate limited |
| Saved lists | `GET /api/lists`, `PUT /api/lists/cart`, `/wishlist`, `/viewed`, `POST /api/lists/merge` | Signed in |
| Orders | `POST /api/orders`, `GET /api/orders/mine`, `GET /api/orders/:ref`, `PATCH /api/orders/:ref/cancel` | Signed in (own orders) |
| Order management | `GET /api/orders`, `PATCH /api/orders/:ref/status` | Admin |
| Dashboard and accounts | `GET /api/admin/summary`, `GET /api/users`, `PATCH /api/users/:id`, `DELETE /api/users/:id` | Admin |

## Deployment

Prepared for **Render** with **MongoDB Atlas**: [`render.yaml`](render.yaml) is a
[Render Blueprint](https://render.com/docs/blueprint-spec) for two free services from this
repository, the API (`shopsmart-capstone-api`, a Node web service from `server/`) and the
client (`shopsmart-capstone-web`, a static site from `client/`). Both pin Node.js 22 with
`NODE_VERSION`.

1. **MongoDB Atlas** ([getting started](https://www.mongodb.com/docs/atlas/getting-started/)).
   Create a free cluster and a database user. Under network access allow `0.0.0.0/0`, because
   a free Render service has no fixed outgoing address. Copy the connection string and add the
   database name:
   `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/shopsmart?retryWrites=true&w=majority`.
   Special characters in the password must be URL-encoded.
2. **Push this repository to GitHub**, then in the Render dashboard choose
   **New → Blueprint** and pick the repository. Render asks once, while it creates the
   services, for the values marked `sync: false`:

   | Service | Variable | Value |
   |---|---|---|
   | `shopsmart-capstone-api` | `MONGO_URI` | the Atlas connection string |
   | `shopsmart-capstone-api` | `CLIENT_URL` | `https://shopsmart-capstone-web.onrender.com` |
   | `shopsmart-capstone-api` | `GEMINI_API_KEY` | a Google AI Studio key, or empty for now |
   | `shopsmart-capstone-web` | `VITE_API_URL` | `https://shopsmart-capstone-api.onrender.com/api` |

   `JWT_SECRET` is generated by Render; every other setting is fixed in `render.yaml`.
3. **Check the real addresses.** Render adds a suffix to a service name that is already
   taken, so compare each service's URL with the two values above. If one differs, correct
   `CLIENT_URL` on the API or `VITE_API_URL` on the site under the service's **Environment**
   page and save with **Save, rebuild, and deploy**. The site needs that new build, because
   Vite writes `VITE_API_URL` into the bundle. `CLIENT_URL` must be the bare origin (no path,
   no trailing slash); if it is missing or is not an origin, the API refuses to start and the
   deploy log says why.
4. **Seed Atlas once from your own computer.** Free services have no shell, no one-off jobs
   and no pre-deploy command, so the seed cannot run on Render:

   ```bash
   cd server
   npm ci
   cp .env.example .env    # skip if server/.env already exists; the seed needs JWT_SECRET from it
   MONGO_URI="<the Atlas connection string>" npm run seed
   ```

   On Windows PowerShell the last line is `$env:MONGO_URI="<the Atlas connection string>"; npm run seed`.
   The output lists 194 products, 582 reviews, 16 demo orders and both accounts. Keep
   `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `server/.env` at `admin@shopsmart.dev` and
   `Admin@1234`, which the Store Admin button uses. Run the same command again before a demo
   to bring the demo orders back into the dashboard's two-week chart.
5. **Check it.** `https://<api>.onrender.com/api/health` should answer `"db":"connected"`.
   Open the site and sign in with both demo buttons. Then put the two live URLs and the
   repository link in the table at the top of this README.
6. **Gemini key, later.** Add `GEMINI_API_KEY` on the API's Environment page and save with
   **Save and deploy**. `/api/health` then says `"ai":true`, and the client picks it up within
   five minutes with no rebuild. Until then AI search answers on the device and the review
   summary is hidden.

**Redeploying.** Both services have `autoDeployTrigger: commit`, so every push to the
linked branch rebuilds and deploys them. A service can also be deployed by hand from its
Deploys page (**Manual Deploy → Deploy latest commit**). After an environment change, Render's
save menu offers **Save, rebuild, and deploy** (needed for the static site) or **Save and
deploy** (enough for the API).

**Cold start.** A [free web service](https://render.com/docs/free) spins down after 15
minutes without traffic and takes about a minute to start again. The client gives the first
requests of a visit (the catalogue, the session check, sign in and sign up) up to 60 seconds,
shows "Waking up the server" once the catalogue takes more than 5 seconds, and retries the
session check when the browser comes back online. Opening `/api/health` a minute before a demo
wakes it up.

`client/netlify.toml`, `client/public/_redirects` and `client/vercel.json` are SPA rewrite
files kept from the mini project, for hosting the client on Netlify or Vercel instead.
`VITE_API_URL` must then be set there, and `CLIENT_URL` must list that site's origin. Only the
Render setup has been checked.

## Security notes

- **Passwords** are hashed with bcrypt (10 salt rounds) and never returned by the API.
- **Sessions** are JWTs signed with `JWT_SECRET`, sent only in the `Authorization: Bearer`
  header (no cookies) and valid for 7 days. Each account has a token version that goes up on
  a password change and on "sign out of every device", which ends every older token. The
  client keeps the token in local storage and ends the session on any `401` session code.
- **Roles** are read from the database on every request, not from the token, so a role change
  takes effect at once. `authorize('admin')` guards every admin endpoint; the client's
  `ProtectedRoute requiredRole="admin"` only decides what the UI shows.
- **Demo accounts** listed in `DEMO_ACCOUNT_EMAILS` cannot have their password changed, be
  signed out everywhere, change role or be deleted (`403 DEMO_ACCOUNT_LOCKED`), so one visitor
  cannot lock the next one out.
- **Validation:** every body is checked by declarative rules (`server/validators/`) that
  report all invalid fields at once. Keys starting with `$` or containing a dot are removed
  before validation, which blocks NoSQL operator injection. Bodies are limited to 1 MB and 32
  levels of nesting, and malformed ids answer `400` rather than reaching the database.
- **Money and stock** are decided by the server: orders send product ids and quantities only,
  and stock is reserved with an update that only succeeds while enough units are left.
- **No card numbers are stored.** For a card the client sends only the last four digits; the
  full number and the CVV never leave the page. No payment is taken.
- **Rate limits** per visitor address: sign in, sign up and password change share one budget
  (`AUTH_RATE_LIMIT_MAX`), and AI search and review summaries have their own.
- **CORS** allows only the `CLIENT_URL` origins in production. Helmet sets the security
  headers. `500` answers carry a generic message, with a stack trace only in development.
- **Start-up checks:** in production the server will not start with a short or example
  `JWT_SECRET`, or without a valid `CLIENT_URL`.
- **Orders of other shoppers** answer `404`, the same as a missing order, so order numbers
  cannot be probed.

## Capstone requirements → where they are met

| Requirement | Where it is met |
|---|---|
| Upgrade the mini project to a full MERN stack with AI | This repository continues the mini project's history: React client in `client/`, Express + MongoDB API in `server/`. See "From mini project to capstone" |
| Backend with Node.js, Express and MongoDB | `server/app.js`, `server/routes/`, `server/controllers/`, Mongoose models in `server/models/` |
| Authentication | JWT (`server/utils/generateToken.js`, `server/middleware/auth.js`), bcrypt (`server/models/user.js`), sign in and sign up pages, `client/src/context/AuthContext.jsx` |
| Authorisation and business logic | Admin role (`authorize('admin')`, `ProtectedRoute`), checkout pricing and stock reservation (`createOrder` in `server/controllers/orderController.js`), status steps, one review per product with verified purchases and a blended rating, the demo account lock |
| Backend CRUD, tested | Products, orders, reviews, saved lists and accounts; 149 API tests in `server/tests/` |
| Frontend consumes the API | `client/src/services/http.js` and the services beside it: catalogue, session, lists, orders, reviews, price history, AI and admin |
| At least one AI tool, matched to the domain | Google Gemini API: natural language product search and review summaries (`server/services/`). Also TF-IDF recommendations and a regression price forecast |
| A working, visible AI feature | Assistant page, AI search box, review summary panel, "Recommended for you", "Similar products", price outlook. Gemini needs `GEMINI_API_KEY` on the server; without it the on-device parser answers, so the search always responds |
| Deploy both frontend and backend | `render.yaml`: API web service + static site, with MongoDB Atlas. Live links are added at the top after the first deploy |
| Fully documented deployment process | "Deployment" above, the comments in `render.yaml`, both `.env.example` files |
| Public GitHub repository with consistent commits | Every change is its own commit with a plain message, starting from the mini project's 32. The repository is pushed to GitHub before the first deploy |
| Responsive UI, accessible design, clean code | Checked at 375, 768 and 1920 px; bottom navigation on phones; skip link, focus moved to each new page, labelled fields, named icon buttons; one folder per component, a single API client, shared validation rules |
| Documentation for submission | This README, [`docs/API.md`](docs/API.md), the screenshots, the demo accounts |
| *Module 5 rubric:* MERN integration workflow | Vite proxy in development; `VITE_API_URL` and `CLIENT_URL` in production; see "Architecture" |
| *Module 5 rubric:* CRUD, JWT and role-based access | Admin product CRUD, orders, reviews, accounts; JWT with revocation; customer and admin roles |
| *Module 5 rubric:* React components and hooks | `client/src/components/`, `client/src/hooks/`, three contexts |
| *Module 5 rubric:* API integration with error handling | `client/src/services/http.js`: timeouts (20 s, 60 s for the first requests of a visit), errors carrying the server's code and field messages, requests cancelled when a page closes |
| *Module 5 rubric:* login, protected routes, token handling | The token is checked with `GET /api/auth/me` on start; `ProtectedRoute` sends guests to sign in and back; a dead session signs out with a notice |
| *Module 5 rubric:* environment variables (Vite + Node) | `client/.env.example`, `server/.env.example`, `render.yaml` |
| *Module 5 rubric:* errors, loading states, token validation | Skeletons, retry notices, the wake-up notice, field errors from the server, the session check on start |
| *Module 5 rubric:* GitHub and deployment | Repository history and `render.yaml`; live links after the first deploy |

## Known limitations

- **Gemini needs a key.** None is configured yet. Until `GEMINI_API_KEY` is set on the server,
  AI search answers with the on-device parser (and says so) and the review summary is hidden.
  Google's [rate limit page](https://ai.google.dev/gemini-api/docs/rate-limits) sends readers
  to AI Studio for a key's actual limits, so `AI_SUMMARY_DAILY_MAX=50` in `render.yaml` is a
  cautious guess to check once a key exists.
- **Not deployed yet.** The Render build and start were simulated locally; the live links and
  the repository link are added after the first deploy.
- **Free plan cold start.** The first visit after 15 quiet minutes waits about a minute.
- **In-memory counters.** The rate limits and the daily summary cap are counted in the
  server's memory, so they start again when the free service restarts after sleeping.
- **Saved lists are last write wins.** Each change sends the whole list. The client reads the
  lists again when its tab regains focus, but two devices editing the same list at the same
  moment keep whichever saved last.
- **No transactions.** Checkout does not use MongoDB transactions, which a single local
  MongoDB server does not offer. It reserves stock line by line and puts back what it
  reserved if a later line fails.
- **Generated price history.** The catalogue has no past prices, so the seed generates twelve
  weekly prices per product from its discount. Admin price changes add real points from then
  on.
- **Demo data ages.** Demo order dates are relative to the seed run, and reseeding replaces
  products and reviews (see "Demo data").
- **No payment provider.** Checkout records the payment method; nothing is charged.
- **Images from DummyJSON.** Product images are still loaded from DummyJSON's CDN.
- **Dependency advisories** (`npm audit`, 17 Nov 2026). Client: 7 entries. Two are runtime:
  `react-router` and `react-router-dom` 6 (moderate), for an open redirect through a
  backslash in `<Link>` and `useNavigate`, and for server-side rendering, which this app does
  not use. The fix is the breaking move to React Router 7. The other five are development
  tools only: Vitest and its `tinypool` (critical), Vite (high), `esbuild` and
  `@vitest/mocker` (moderate); their fixes are breaking Vitest and Vite upgrades. Server:
  none in runtime dependencies (`npm audit --omit=dev`), two moderate through `nodemon`, a
  development tool.

## Screenshots

Taken with Playwright on 17 Nov 2026 against a freshly seeded database, at 1280 × 800 unless
noted. Some are crops of the page below the sticky header. Gemini was not configured, so the
assistant and the review summary show their on-device and no-key states.

**Shopping**

| | |
|---|---|
| ![Home page](docs/screenshots/01-home.jpg) Home: the day's biggest discounts, delivery promises and category tiles | ![Category with filters](docs/screenshots/02-category-filters.jpg) Smartphones filtered by brand, price and rating, with the active filters as chips |
| ![Product page](docs/screenshots/03-product.jpg) Product page with the price outlook: recorded weekly prices and the two-week forecast | ![Reviews](docs/screenshots/04-product-reviews.jpg) Reviews with the star breakdown, the note shown instead of the AI summary without a key, and similar products |
| ![Compare](docs/screenshots/05-compare.jpg) Four phones compared, lowest price and best rated flagged | ![Assistant](docs/screenshots/06-assistant.jpg) The assistant answering on the device, as Gemini is not set up (1280 × 900) |
| ![Cart](docs/screenshots/07-cart.jpg) A guest's cart with savings and free delivery | ![Sign in](docs/screenshots/08-sign-in.jpg) Sign in with the one-click demo accounts |

**Checkout and orders**

| | |
|---|---|
| ![Checkout delivery](docs/screenshots/09-checkout-delivery.jpg) Checkout step 1: delivery, filled in from the account | ![Checkout review](docs/screenshots/10-checkout-review.jpg) Checkout step 3: review, card ending 4242 |
| ![Order confirmed](docs/screenshots/11-order-confirmed.jpg) Order confirmed, with the progress timeline and cancel button | ![Orders](docs/screenshots/12-orders.jpg) Order history of the demo shopper |
| ![Account](docs/screenshots/13-account.jpg) Account: profile, saved address and password change | ![Admin only](docs/screenshots/20-admin-forbidden.jpg) A shopper at `/admin` gets the "store admins only" panel |

**Admin**

| | |
|---|---|
| ![Admin dashboard](docs/screenshots/14-admin-dashboard.jpg) Dashboard with the demo orders in the 14-day sales chart | ![Admin products](docs/screenshots/15-admin-products.jpg) Products: search, category, stock filter and sort |
| ![Admin product edit](docs/screenshots/16-admin-product-edit.jpg) Editing a product beside its recorded price history and forecast | ![Admin orders](docs/screenshots/17-admin-orders.jpg) Every order, with status and payment |
| ![Admin order status](docs/screenshots/18-admin-order-status.jpg) An order marked as shipped with a courier note; Delivered or Cancelled come next | ![Admin accounts](docs/screenshots/19-admin-users.jpg) Accounts with role and order count |

**Phone (375 × 812)**

| | | |
|---|---|---|
| <img src="docs/screenshots/21-phone-home.jpg" alt="Phone home" width="250"><br>Home with the bottom navigation | <img src="docs/screenshots/22-phone-product.jpg" alt="Phone product" width="250"><br>Product page | <img src="docs/screenshots/23-phone-admin-dashboard.jpg" alt="Phone admin dashboard" width="250"><br>Admin dashboard |

## Author and license

**Fathima K H** · Entri Full Stack Development V8 · Capstone project

GitHub: fathimakh · Email: `fathimakh07@gmail.com`

Released under the [MIT License](LICENSE).

Thanks to [DummyJSON](https://dummyjson.com) for the product catalogue and images the seed
started from, [Google AI Studio](https://aistudio.google.com) for the Gemini API,
[React Icons](https://react-icons.github.io/react-icons/) for the Feather icon set and
[Google Fonts](https://fonts.google.com) for Outfit and Inter.
