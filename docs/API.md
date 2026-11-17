# ShopSmart API

The REST API behind ShopSmart: accounts, the product catalogue, saved lists, orders, reviews, price history, the Gemini powered shopping assistant and the admin tools. It is a Node.js + Express 5 app with MongoDB (Mongoose 9), in [`server/`](../server).

This document is the contract between the API and the React client. Everything below is what the code does today and is covered by the test suite (`cd server && npm test`).

## Contents

1. [Basics](#1-basics)
2. [Error codes](#2-error-codes)
3. [Objects](#3-objects)
4. [Endpoint summary](#4-endpoint-summary)
5. [Endpoints](#5-endpoints)
   - [5.1 Root and health](#51-root-and-health)
   - [5.2 Authentication](#52-authentication)
   - [5.3 Products](#53-products)
   - [5.4 Price history](#54-price-history)
   - [5.5 Reviews](#55-reviews)
   - [5.6 AI assistant](#56-ai-assistant)
   - [5.7 Saved lists](#57-saved-lists)
   - [5.8 Orders](#58-orders)
   - [5.9 Admin dashboard](#59-admin-dashboard)
   - [5.10 Account management](#510-account-management)
6. [Notes for the client](#6-notes-for-the-client)
7. [Server configuration](#7-server-configuration)

---

## 1. Basics

### Base URL

| Where | Base URL |
|---|---|
| Local development | `http://localhost:5050/api` |
| Deployed | `https://<api-host>/api` |

Every path in this document is relative to the host, and every endpoint lives under `/api`. The client should read the base URL from `VITE_API_URL` (including the `/api` suffix).

To run it locally: `cd server`, `npm install`, copy `.env.example` to `.env` and fill it in, `npm run seed` (194 products, 582 reviews and two demo accounts), then `npm run dev`. Running the seed again replaces the products and reviews but keeps accounts and orders: each product's `soldCount` and reserved stock follow the kept orders, and product ids are never reused. `npm run seed -- --fresh` also removes every account and order.

| Demo account | Email | Password |
|---|---|---|
| Admin | `admin@shopsmart.dev` | `Admin@1234` |
| Shopper | `demo@shopsmart.dev` | `Demo@1234` |

### Requests and responses

- Bodies are JSON. Send `Content-Type: application/json`. A body may be at most 1 MB.
- Dates are ISO 8601 strings in UTC, for example `"2026-11-16T21:43:51.797Z"`.
- Money is a plain number in US dollars, rounded to cents, for example `74.96`.
- Ids:
  - Products have a numeric `id` (1 to 194 from the catalogue, then 195, 196 and so on for products an admin adds). Products never expose `_id`.
  - Orders have an `_id` and a `number` such as `"SS100001"`. Order URLs accept either.
  - Accounts and reviews are identified by their `_id`, a 24 character hex string.
- Numeric strings are accepted where a body field is a number (`"quantity": "2"`), because form inputs produce strings. Lists of product ids (`ids`, `wishlist`, `recentlyViewed`) need real numbers.
- Unknown body fields are ignored.

### Response envelope

Every success has `success: true` plus named data:

```json
{ "success": true, "product": { "id": 1, "title": "Essence Mascara Lash Princess" } }
```

Every error has the same shape:

```json
{
  "success": false,
  "message": "Please check the highlighted fields",
  "code": "VALIDATION_ERROR",
  "errors": [{ "field": "delivery.phone", "message": "Enter a 10 digit phone number" }]
}
```

| Key | Present | Meaning |
|---|---|---|
| `message` | always | A sentence that can be shown to the shopper as it is. |
| `code` | always | A stable machine readable code. Branch on this, never on the message. See [Error codes](#2-error-codes). |
| `errors` | validation errors only | Every invalid field at once, as `{ field, message }`. Nested fields use dots and brackets: `address.phone`, `delivery.pincode`, `items[0].quantity`. |
| `details` | some errors | Extra data needed to recover. Only `409 OUT_OF_STOCK` uses it today (see [POST /api/orders](#post-apiorders)). |

### Access levels

| Level | Meaning |
|---|---|
| Public | No token needed. |
| Optional | Works without a token; a valid token adds personal data. An invalid or expired token is ignored, the request is answered as a guest and never fails with 401. |
| Shopper | Any signed in account (customer or admin). |
| Admin | A signed in account whose role is `admin`. Shoppers get `403 FORBIDDEN`, guests `401 NO_TOKEN`. |

The role is read from the database on every request, not from the token, so promoting or demoting an account takes effect on its very next request.

### Authentication

1. `POST /api/auth/register` or `POST /api/auth/login` returns `{ token, user }`.
2. Send the token on every request that needs it:

   ```
   Authorization: Bearer <token>
   ```

   The scheme is case insensitive. Tokens are only read from this header (no cookies).
3. Tokens are JWTs that expire after `JWT_EXPIRES_IN` (7 days by default). There is no refresh token: when a token expires the shopper signs in again.
4. Tokens are revoked by changing the password (`PATCH /api/auth/password`, which returns a fresh token for the device that made the change) and by `POST /api/auth/logout` with `{ "allDevices": true }`.

A protected request without a valid session fails with `401` and one of these codes:

| Code | When | What the client should do |
|---|---|---|
| `NO_TOKEN` | No `Authorization: Bearer` header. | Send the shopper to sign in. |
| `TOKEN_EXPIRED` | The token is past its expiry time. | End the session, show "Your session has expired", send to sign in. |
| `TOKEN_INVALID` | The token is malformed, has a bad signature or is missing claims. | End the session and send to sign in. |
| `TOKEN_REVOKED` | The password was changed, or the account signed out on every device, after this token was issued. | End the session and send to sign in. |
| `USER_NOT_FOUND` | The account was deleted. | End the session and send to sign in. |

The token payload is `{ id, role, tv, iat, exp }`. The client may decode `exp` to time a sign out, but should take the account and its role from `GET /api/auth/me`, not from the token.

### Pagination

Paged lists take `page` (whole number from 1, default 1) and `limit` (whole number, default and maximum differ per endpoint) and answer with:

```json
"pagination": { "page": 1, "limit": 20, "total": 57, "pages": 3 }
```

A page past the end returns an empty list with the same `pagination`. Invalid query parameters are rejected together with `400 VALIDATION_ERROR`, message `"Invalid query parameters"` and one `errors` entry per parameter, for example `{ "field": "limit", "message": "limit must be at least 1" }`.

### Rate limits

Counted per IP address over 15 minutes. Going over answers `429 RATE_LIMITED`.

| Limiter | Applies to | Default limit |
|---|---|---|
| Sign in | `POST /api/auth/register`, `POST /api/auth/login`, `PATCH /api/auth/password` (one shared budget) | 50 (`AUTH_RATE_LIMIT_MAX`) |
| AI search | `POST /api/ai/search` | 60 (`AI_RATE_LIMIT_MAX`) |
| Review summaries | `GET /api/products/:id/review-summary`, only when a new summary has to be written (cached summaries do not count). Counted apart from AI search, so browsing products never uses up the search allowance. | 60 (`AI_RATE_LIMIT_MAX`) |

New review summaries also have a budget for the whole server, `AI_SUMMARY_DAILY_MAX` (100) a day counted from midnight UTC, so that browsing, or a script walking every product, cannot use up the Gemini quota AI search needs. Once it is spent, new summaries answer `503 AI_UNAVAILABLE` until the next day; cached ones are still served.

### CORS

Browsers may call the API from the origins listed in `CLIENT_URL` (comma separated). Outside production any `http://localhost:<port>` or `http://127.0.0.1:<port>` origin is allowed as well. Allowed request headers are `Content-Type` and `Authorization`. Any other origin gets `403 CORS_ORIGIN_DENIED`. Requests without an `Origin` header (curl, Postman, health checks) are not affected.

### Security behaviour the client can rely on

- Prices are never taken from the client. Orders send product ids and quantities only; titles, images, prices and totals come from the database.
- Keys starting with `$` or containing `.` are removed from every request body before validation, so `{ "email": { "$gt": "" } }` becomes `{ "email": {} }` and fails validation. Query strings are read as plain text.
- No card number or CVV is stored. Card orders send only the last four digits.
- Passwords are stored as bcrypt hashes and never returned.
- The shared demo accounts behind the one-click sign in keep their published password and their sessions: changing the password, signing out on every device, and an admin changing their role or deleting them answer `403 DEMO_ACCOUNT_LOCKED`.
- Responses carry Helmet's security headers.

---

## 2. Error codes

| Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | One or more fields or query parameters are invalid. See `errors`. |
| 400 | `NOTHING_TO_UPDATE` | A partial update sent none of the fields it accepts. |
| 400 | `INVALID_ID` | A malformed id in the URL: a product id that is not a positive whole number, an order reference that is neither an order number nor an `_id`, or a malformed account or review id. |
| 400 | `INVALID_JSON` | The body is not valid JSON. |
| 401 | `NO_TOKEN`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `TOKEN_REVOKED`, `USER_NOT_FOUND` | No valid session. See [Authentication](#authentication). |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password at sign in (the same answer for both, on purpose). |
| 403 | `FORBIDDEN` | Signed in, but not allowed: an admin only route, someone else's review, or cancelling someone else's order. |
| 403 | `CORS_ORIGIN_DENIED` | The browser origin is not allowed. |
| 403 | `DEMO_ACCOUNT_LOCKED` | The change would lock other visitors out of a shared demo account: its password, signing it out on every device, or an admin changing its role or deleting it. See `DEMO_ACCOUNT_EMAILS`. |
| 404 | `ROUTE_NOT_FOUND` | No such endpoint. |
| 404 | `PRODUCT_NOT_FOUND` | No product with that id. |
| 404 | `ORDER_NOT_FOUND` | No such order, or it belongs to another shopper (the two are not told apart, so order numbers cannot be probed). |
| 404 | `REVIEW_NOT_FOUND` | No such review on this product. |
| 404 | `ACCOUNT_NOT_FOUND` | Admin account management: no account with that id. |
| 409 | `EMAIL_TAKEN` | Sign up with an email that already has an account. |
| 409 | `DUPLICATE_KEY` | A unique value already exists (a rare race the checks above did not catch). |
| 409 | `OUT_OF_STOCK` | Checkout: some lines are not available in the quantity asked for. See `details.items`. |
| 409 | `ORDER_NOT_CANCELLABLE` | The shopper tried to cancel an order that is no longer `processing`. |
| 409 | `INVALID_STATUS_TRANSITION` | Admin status change that skips a step, goes backwards, repeats the current status, or cancels a delivered order. |
| 409 | `ORDER_CHANGED` | The order changed between being read and being updated (for example two cancels at once). Reload it and try again. |
| 409 | `SELF_ROLE_CHANGE` | An admin tried to change their own role. |
| 409 | `SELF_DELETE` | An admin tried to delete their own account. |
| 413 | `PAYLOAD_TOO_LARGE` | The body is over 1 MB. |
| 429 | `RATE_LIMITED` | Too many requests. See [Rate limits](#rate-limits). |
| 500 | `SERVER_ERROR` | An unexpected fault. The message is generic. |
| 502 | `AI_FAILED` | Gemini answered with an error or with something unusable. |
| 503 | `AI_UNAVAILABLE` | No Gemini key is configured on the server, Gemini is over its quota, or (review summaries only) today's `AI_SUMMARY_DAILY_MAX` is spent. |
| 504 | `AI_TIMEOUT` | Gemini did not answer within `GEMINI_TIMEOUT_MS` (9 seconds by default). |

---

## 3. Objects

### 3.1 User

```json
{
  "_id": "6afb790454cff2253a63b03a",
  "name": "Demo Shopper",
  "email": "demo@shopsmart.dev",
  "role": "customer",
  "address": {
    "name": "Demo Shopper",
    "phone": "9876543210",
    "address": "12 MG Road, Indiranagar",
    "city": "Bengaluru",
    "state": "Karnataka",
    "pincode": "560001"
  },
  "createdAt": "2026-11-16T21:43:32.242Z",
  "updatedAt": "2026-11-16T21:43:51.806Z"
}
```

- `role` is `"customer"` or `"admin"`.
- `address` is the saved delivery address (every field is a string, `""` when not set). It is updated by `PATCH /api/auth/me` and by every order, so the next checkout can be filled in from it. There is no email in it; use the account `email`.
- The cart, wishlist and recently viewed list are not part of the user; they come from [`/api/lists`](#57-saved-lists).
- The admin account list adds `orderCount`.

### 3.2 Product

The same shape as the DummyJSON catalogue the mini project used, with a few differences listed below.

```json
{
  "id": 1,
  "title": "Essence Mascara Lash Princess",
  "description": "The Essence Mascara Lash Princess is a popular mascara known for its volumizing and lengthening effects.",
  "brand": "Essence",
  "category": "beauty",
  "price": 9.99,
  "discountPercentage": 10.48,
  "rating": 2.56,
  "reviewCount": 3,
  "stock": 99,
  "tags": ["beauty", "mascara"],
  "sku": "BEA-ESS-ESS-001",
  "weight": 4,
  "dimensions": { "width": 15.14, "height": 13.08, "depth": 22.99 },
  "warrantyInformation": "1 week warranty",
  "shippingInformation": "Ships in 3-5 business days",
  "returnPolicy": "No return policy",
  "minimumOrderQuantity": 48,
  "soldCount": 0,
  "thumbnail": "https://cdn.dummyjson.com/product-images/beauty/essence-mascara-lash-princess/thumbnail.webp",
  "images": ["https://cdn.dummyjson.com/product-images/beauty/essence-mascara-lash-princess/1.webp"],
  "availabilityStatus": "In Stock",
  "meta": { "createdAt": "2025-10-09T14:47:01.588Z", "updatedAt": "2025-10-09T14:47:01.588Z" }
}
```

| Field | Notes |
|---|---|
| `price` | The price the shopper pays. |
| `discountPercentage` | 0 to 90. There is no `originalPrice` field; the struck-through price is `Math.round(price / (1 - discountPercentage / 100) * 100) / 100`, the same rule the server uses for order lines. |
| `rating` | 0 to 5, two decimals. A blend of the catalogue rating and the reviews written in ShopSmart (see [Reviews](#55-reviews)). |
| `reviewCount` | The number of reviews, the same number `GET /api/products/:id/reviews` pages through. |
| `brand` | `"Generic"` when the catalogue had none. |
| `category` | A lowercase slug such as `home-decoration`. |
| `soldCount` | Units sold, minus units from cancelled orders. |
| `availabilityStatus` | Worked out from `stock`: `"Out of Stock"` at 0, `"Low Stock"` below 10, otherwise `"In Stock"`. |
| `minimumOrderQuantity` | Shown as information only. Checkout does not enforce it. |
| `meta` | When the product was added and last changed. |

Not included: `_id`, an embedded `reviews` array (use the reviews endpoint), the price history (use the price history endpoint) and the AI review summary (use the review summary endpoint).

### 3.3 Review

```json
{
  "_id": "6afb791758301b2f7d54351c",
  "product": 1,
  "user": "6afb790454cff2253a63b03a",
  "reviewerName": "Demo Shopper",
  "rating": 4,
  "comment": "Lovely mascara, lasts all day",
  "verifiedPurchase": false,
  "createdAt": "2026-11-16T21:43:51.870Z",
  "updatedAt": "2026-11-16T21:43:51.870Z",
  "date": "2026-11-16T21:43:51.870Z"
}
```

- `product` is the numeric product id.
- `user` is the author's account `_id`, or `null` for the reviews imported with the catalogue. Compare it with the signed in user's `_id` to offer edit and delete.
- `reviewerName` is the author's account name when the review was last saved.
- `rating` is a whole number from 1 to 5.
- `verifiedPurchase` is `true` when the author had a delivered order containing the product when the review was last saved.
- `date` is the same as `createdAt` (kept for the DummyJSON review shape). Editing a review changes `updatedAt` only.

### 3.4 Order

```json
{
  "_id": "6afb7917f4dae1f392f2f647",
  "number": "SS100001",
  "user": { "_id": "6afb790454cff2253a63b03a", "name": "Demo Shopper", "email": "demo@shopsmart.dev" },
  "items": [
    {
      "id": 1,
      "title": "Essence Mascara Lash Princess",
      "brand": "Essence",
      "thumbnail": "https://cdn.dummyjson.com/product-images/beauty/essence-mascara-lash-princess/thumbnail.webp",
      "price": 9.99,
      "originalPrice": 11.16,
      "quantity": 2
    },
    {
      "id": 6,
      "title": "Calvin Klein CK One",
      "brand": "Calvin Klein",
      "thumbnail": "https://cdn.dummyjson.com/product-images/fragrances/calvin-klein-ck-one/thumbnail.webp",
      "price": 49.99,
      "originalPrice": 50.95,
      "quantity": 1
    }
  ],
  "delivery": {
    "name": "Demo Shopper",
    "email": "demo@shopsmart.dev",
    "phone": "9876543210",
    "address": "12 MG Road, Indiranagar",
    "city": "Bengaluru",
    "state": "Karnataka",
    "pincode": "560001"
  },
  "payment": { "method": "card", "cardLast4": "4242", "upiId": null },
  "subtotal": 69.97,
  "savings": 3.3,
  "deliveryFee": 4.99,
  "total": 74.96,
  "status": "processing",
  "statusHistory": [{ "status": "processing", "at": "2026-11-16T21:43:51.797Z", "note": "Order placed" }],
  "arrivesOn": "2026-11-20T21:43:51.797Z",
  "createdAt": "2026-11-16T21:43:51.804Z",
  "updatedAt": "2026-11-16T21:43:51.804Z"
}
```

| Field | Notes |
|---|---|
| `number` | `SS` followed by a number from 100001 upwards. Shown on receipts and used in order URLs. |
| `user` | Always populated as `{ _id, name, email }`, or `null` when the account has since been deleted. |
| `items` | A copy of each product at checkout: a later catalogue change or deletion never changes an order. `id` is the numeric product id. `originalPrice` is the pre-discount price. |
| `payment` | `method` is `"card"`, `"upi"` or `"cod"` (cash on delivery). `cardLast4` is set for card orders only and `upiId` for UPI orders only; the other is `null`. |
| Totals | `subtotal` = sum of `price × quantity`. `savings` = sum of `(originalPrice − price) × quantity`. `deliveryFee` is 0 when the subtotal is $150 or more, otherwise 4.99. `total` = `subtotal + deliveryFee`. |
| `status` | See below. |
| `statusHistory` | Every status the order has had, oldest first, with the time and a note. |
| `arrivesOn` | Four days after the order was placed. It is the estimate given at checkout and does not change. |
| `createdAt` | When the order was placed (there is no separate `placedAt`). |

**Statuses**

| Status | Meaning | Who can move it on |
|---|---|---|
| `processing` | Placed, being prepared. Every order starts here. | The shopper can cancel. An admin can ship or cancel. |
| `shipped` | With the courier. | An admin can mark it delivered or cancel it. |
| `delivered` | Final. | Nobody. |
| `cancelled` | Final. The stock went back on the shelf. | Nobody. |

Allowed changes: `processing → shipped → delivered`, one step at a time, and `processing` or `shipped` → `cancelled`.

---

## 4. Endpoint summary

| Method | Path | Access | Purpose | Response keys |
|---|---|---|---|---|
| GET | `/` | Public | API name and pointer to this document | `name, message, links` |
| GET | `/api/health` | Public | Service, database and AI status | `status, db, ai, uptime` |
| POST | `/api/auth/register` | Public | Create a customer account and sign in | `token, user` |
| POST | `/api/auth/login` | Public | Sign in | `token, user` |
| GET | `/api/auth/me` | Shopper | The signed in account | `user` |
| PATCH | `/api/auth/me` | Shopper | Change name and saved address | `user` |
| PATCH | `/api/auth/password` | Shopper | Change password, sign out other devices | `message, token` |
| POST | `/api/auth/logout` | Shopper | Sign out, optionally on every device | `message` |
| GET | `/api/products` | Public | Search, filter, sort and page the catalogue | `products, pagination` |
| GET | `/api/products/categories` | Public | Categories with product counts | `categories` |
| GET | `/api/products/:id` | Public | One product | `product` |
| POST | `/api/products` | Admin | Add a product | `product` |
| PUT | `/api/products/:id` | Admin | Edit a product | `product` |
| DELETE | `/api/products/:id` | Admin | Delete a product | `message` |
| GET | `/api/products/:id/price-history` | Public | Recorded prices and the price forecast | `productId, currentPrice, points, prediction` |
| GET | `/api/products/:id/review-summary` | Public | AI summary of the product's reviews | `summary, cached` |
| GET | `/api/products/:id/reviews` | Optional | Reviews, star breakdown and the caller's own review | `reviews, pagination, stats, myReview` |
| POST | `/api/products/:id/reviews` | Shopper | Write or edit the caller's review | `review, stats` |
| DELETE | `/api/products/:id/reviews/:reviewId` | Shopper (author) or Admin | Delete a review | `message, stats` |
| GET | `/api/ai/status` | Public | Whether the AI features are configured | `enabled, model` |
| POST | `/api/ai/search` | Public | Turn a shopper's message into catalogue filters | `result, source` |
| GET | `/api/lists` | Shopper | Saved cart, wishlist and recently viewed | `cart, wishlist, recentlyViewed` |
| PUT | `/api/lists/cart` | Shopper | Replace the saved cart | `cart` |
| PUT | `/api/lists/wishlist` | Shopper | Replace the wishlist | `wishlist` |
| PUT | `/api/lists/viewed` | Shopper | Replace the recently viewed list | `recentlyViewed` |
| POST | `/api/lists/merge` | Shopper | Merge a guest's lists into the account | `cart, wishlist, recentlyViewed` |
| POST | `/api/orders` | Shopper | Place an order | `order` |
| GET | `/api/orders/mine` | Shopper | The caller's orders, newest first | `orders` |
| GET | `/api/orders/:ref` | Shopper (owner) or Admin | One order by number or `_id` | `order` |
| PATCH | `/api/orders/:ref/cancel` | Shopper (owner) | Cancel a processing order | `order` |
| GET | `/api/orders` | Admin | Every order, filtered and paged | `orders, pagination` |
| PATCH | `/api/orders/:ref/status` | Admin | Ship, deliver or cancel an order | `order` |
| GET | `/api/admin/summary` | Admin | Dashboard figures | `totals, ordersByStatus, lowStock, topProducts, recentOrders, salesByDay` |
| GET | `/api/users` | Admin | Accounts, searched and paged | `users, pagination` |
| PATCH | `/api/users/:id` | Admin | Change an account's role | `user` |
| DELETE | `/api/users/:id` | Admin | Delete an account | `message` |

Every response also has `success`.

---

## 5. Endpoints

Each protected endpoint can also answer `401` with a session code (see [Authentication](#authentication)), and any endpoint can answer `429 RATE_LIMITED` where a limiter applies and `500 SERVER_ERROR`. These are not repeated below.

### 5.1 Root and health

#### `GET /`

Public. Tells a visitor where to look.

```json
{
  "success": true,
  "name": "ShopSmart API",
  "message": "Every endpoint lives under /api. See docs/API.md in the repository.",
  "links": { "health": "/api/health", "products": "/api/products" }
}
```

#### `GET /api/health`

Public. Used by the host's health check and by the client to wake a sleeping free-tier server.

```json
{ "success": true, "status": "ok", "db": "connected", "ai": false, "uptime": 2 }
```

- `db` is `"connected"` or `"disconnected"`.
- `ai` is `true` when a Gemini key is configured (the same as `GET /api/ai/status`).
- `uptime` is in whole seconds.

### 5.2 Authentication

#### `POST /api/auth/register`

Public, sign in rate limit. Creates a `customer` account (the role cannot be chosen) and signs it in.

| Field | Rules |
|---|---|
| `name` | Required text, 2 to 50 characters. Trimmed. |
| `email` | Required, a valid email, at most 254 characters. Stored lowercase. |
| `password` | Required, 8 to 128 characters with at least one letter and one number. |

```json
{ "name": "Meera Das", "email": "meera@example.com", "password": "Shopping1" }
```

**201**

```json
{ "success": true, "token": "eyJhbGciOiJIUzI1NiIs...", "user": { "_id": "...", "name": "Meera Das", "email": "meera@example.com", "role": "customer", "address": { "name": "", "phone": "", "address": "", "city": "", "state": "", "pincode": "" }, "createdAt": "...", "updatedAt": "..." } }
```

Errors: `400 VALIDATION_ERROR` (fields `name`, `email`, `password`), `409 EMAIL_TAKEN` ("An account with this email already exists. Try signing in.").

#### `POST /api/auth/login`

Public, sign in rate limit.

| Field | Rules |
|---|---|
| `email` | Required, a valid email. Matched without regard to case. |
| `password` | Required text, at most 128 characters. |

**200** `{ success, token, user }`

Errors: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS` ("The email or password is not right.").

#### `GET /api/auth/me`

Shopper. Checks a stored session and returns the account.

**200** `{ success, user }`

#### `PATCH /api/auth/me`

Shopper. Partial update: send at least one of `name` and `address`.

| Field | Rules |
|---|---|
| `name` | Text, 2 to 50 characters. |
| `address` | Object. Every field is optional; send only the ones to change. An empty string clears a field. |
| `address.name` | Text, at most 60 characters. |
| `address.phone` | Exactly 10 digits, no spaces ("Enter a 10 digit phone number"). |
| `address.address` | Text, at most 160 characters. |
| `address.city`, `address.state` | Text, at most 60 characters. |
| `address.pincode` | Exactly 6 digits ("Enter a 6 digit PIN code"). |

```json
{ "name": "Asha N", "address": { "city": "Kochi", "pincode": "682001" } }
```

**200** `{ success, user }`

Errors: `400 VALIDATION_ERROR` (fields such as `address.phone`), `400 NOTHING_TO_UPDATE` ("Send at least one of: name, address"). The role and email cannot be changed here.

#### `PATCH /api/auth/password`

Shopper, sign in rate limit. Changes the password and signs out every other device.

| Field | Rules |
|---|---|
| `currentPassword` | Required text, at most 128 characters. |
| `newPassword` | Required, 8 to 128 characters with a letter and a number. |

**200**

```json
{ "success": true, "message": "Password changed", "token": "eyJhbGciOiJIUzI1NiIs..." }
```

Store the new token straight away: the old one now answers `TOKEN_REVOKED`.

Errors: `400 VALIDATION_ERROR` with `errors` `[{ "field": "currentPassword", "message": "The current password is not right" }]`, or `[{ "field": "newPassword", "message": "Choose a password you have not used here" }]` when the new password is the current one. `403 DEMO_ACCOUNT_LOCKED` for a shared demo account, whose password stays as published.

#### `POST /api/auth/logout`

Shopper. The body is optional.

| Field | Rules |
|---|---|
| `allDevices` | Optional boolean (a real `true` or `false`). |

- Without `allDevices` the answer is `{ "success": true, "message": "Signed out" }` and nothing changes on the server; the client forgets its token. A JWT stays valid until it expires, so this call is a courtesy and the client can sign out locally even if it fails.
- With `{ "allDevices": true }` every token issued so far for the account stops working (`TOKEN_REVOKED`), including this one: `{ "success": true, "message": "Signed out on every device" }`.

Errors: `400 VALIDATION_ERROR` (field `allDevices`) when it is not a boolean. `403 DEMO_ACCOUNT_LOCKED` for `allDevices: true` on a shared demo account, which would sign out every other visitor using it; a normal sign out still works.

### 5.3 Products

#### `GET /api/products`

Public. Search, filter, sort and page the catalogue.

| Query | Format | Meaning |
|---|---|---|
| `q` | Text, at most 100 characters | Every word (up to 8) must appear, without regard to case, in the title, brand, category, tags or description. |
| `category` | Slugs, comma separated or repeated | Any of these categories. |
| `brand` | Brand names, comma separated or repeated | Any of these brands (exact, case sensitive). |
| `minPrice`, `maxPrice` | Numbers from 0 | Price range, inclusive. |
| `minRating` | Number from 0 to 5 | Rating at least this. 0 means no filter. |
| `minDiscount` | Number from 0 to 90 | `discountPercentage` at least this. 0 means no filter. |
| `inStock` | `true`/`false` (also `1`/`0`, `yes`/`no`) | `true` leaves out products with no stock. |
| `stockBelow` | Whole number from 1 | Products with fewer units than this (used by the admin table; wins over `inStock`). |
| `sort` | `featured` (default), `relevance`, `price-asc`, `price-desc`, `rating`, `popularity`, `newest`, `discount` | `featured` and `relevance` keep catalogue order (by `id`). `popularity` sorts by `reviewCount`, then `rating`. `newest` uses `meta.createdAt`. Ties are broken by `id`. |
| `page` | Whole number from 1 | Default 1. |
| `limit` | Whole number from 0 | Default 24, at most 100. **`limit=0` returns every matching product on one page**, which is how the storefront loads the whole catalogue (`?limit=0`). |

**200**

```json
{
  "success": true,
  "products": [{ "id": 1, "title": "Essence Mascara Lash Princess" }],
  "pagination": { "page": 1, "limit": 24, "total": 194, "pages": 9 }
}
```

With `limit=0`, `pagination` is `{ "page": 1, "limit": <total>, "total": <total>, "pages": 1 }`.

Errors: `400 VALIDATION_ERROR` "Invalid query parameters".

#### `GET /api/products/categories`

Public. Every category with how many products it has, sorted by slug.

```json
{ "success": true, "categories": [{ "slug": "beauty", "count": 5 }, { "slug": "fragrances", "count": 5 }] }
```

#### `GET /api/products/:id`

Public. `:id` is the numeric product id.

**200** `{ success, product }`

Errors: `400 INVALID_ID` ("Invalid product id"), `404 PRODUCT_NOT_FOUND` ("We could not find that product.").

#### `POST /api/products`

Admin. Adds a product with the next numeric id and starts its price history with today's price.

| Field | Rules |
|---|---|
| `title` | Required text, 3 to 120 characters. |
| `description` | Required text, 10 to 2000 characters. |
| `category` | Required lowercase slug, at most 40 characters, such as `home-decoration`. A new slug creates a new category. |
| `price` | Required number from 0.01 to 100000. |
| `stock` | Required whole number from 0 to 100000. |
| `thumbnail` | Required URL starting with `http://` or `https://`, at most 500 characters. |
| `brand` | Optional text, at most 60 characters. Default `"Generic"`. |
| `discountPercentage` | Optional number from 0 to 90. Default 0. |
| `images` | Optional list of up to 10 URLs. Default `[thumbnail]`. |
| `tags` | Optional list of up to 12 texts, each at most 30 characters. Stored lowercase. |
| `warrantyInformation`, `shippingInformation`, `returnPolicy` | Optional text, at most 80 characters each. |
| `minimumOrderQuantity` | Optional whole number from 1 to 1000. Default 1. |

`rating`, `reviewCount`, `soldCount`, `sku`, `weight` and `dimensions` cannot be set; a new product starts with a rating of 0 and no reviews.

**201** `{ success, product }`

Errors: `400 VALIDATION_ERROR`, `401`, `403 FORBIDDEN`.

#### `PUT /api/products/:id`

Admin. Partial update with the same fields and rules as `POST /api/products`, each optional. A changed `price` adds a point to the price history, which moves the forecast.

**200** `{ success, product }`

Errors: `400 VALIDATION_ERROR`, `400 NOTHING_TO_UPDATE` ("Send at least one of: title, description, brand, category, price, discountPercentage, stock, thumbnail, images, tags, warrantyInformation, shippingInformation, returnPolicy, minimumOrderQuantity"), `400 INVALID_ID`, `404 PRODUCT_NOT_FOUND`, `403 FORBIDDEN`.

#### `DELETE /api/products/:id`

Admin. Deletes the product and its reviews and removes it from every account's cart, wishlist and recently viewed list. Orders keep their own copy of the product.

**200** `{ "success": true, "message": "Product deleted" }`

Errors: `400 INVALID_ID`, `404 PRODUCT_NOT_FOUND`, `403 FORBIDDEN`.

### 5.4 Price history

#### `GET /api/products/:id/price-history`

Public. The prices recorded for the product and a forecast two weeks ahead.

Each product starts with twelve weekly prices from the seed, and every admin price change adds a point (the latest 26 are kept). A least squares line is fitted through the last twelve weeks of prices against time; how well it fits (R squared) becomes the confidence. A price holds until the next change, so each week without a change counts as a week at that price: a price left alone lets an old trend fade to `"steady"` within twelve weeks instead of carrying it further every week.

**200**

```json
{
  "success": true,
  "productId": 1,
  "currentPrice": 9.99,
  "points": [
    { "price": 11.22, "at": "2026-08-31T21:43:32.064Z" },
    { "price": 11.09, "at": "2026-09-07T21:43:32.064Z" },
    { "price": 9.99, "at": "2026-11-16T21:43:32.064Z" }
  ],
  "prediction": {
    "forecast": 9.85,
    "forecastAt": "2026-11-30T21:43:42.469Z",
    "changePercent": -1.4,
    "confidence": 89,
    "verdict": "steady",
    "weeks": 11,
    "hasEnoughData": true
  }
}
```

| Field | Meaning |
|---|---|
| `points` | Oldest first. May be empty or short for a product added recently. |
| `prediction.forecast` | The expected price at `forecastAt`, kept within 40% of the current price. |
| `prediction.changePercent` | `(forecast − currentPrice) / currentPrice × 100`, one decimal. |
| `prediction.confidence` | 0 to 100. |
| `prediction.verdict` | `"drop"` or `"rise"` when confidence is at least 35 and the change is at least 2% either way, otherwise `"steady"`. |
| `prediction.weeks` | How many weeks of history the line was fitted over, at most 12. |
| `prediction.hasEnoughData` | `false` with fewer than 3 points, or when the oldest point is less than 3 weeks old (prices recorded minutes apart say nothing about the next two weeks). Then `forecast` is the current price, `changePercent` 0, `confidence` 0, `verdict` `"steady"` and `weeks` 0; show "not enough price history yet" rather than a chart. |

Errors: `400 INVALID_ID`, `404 PRODUCT_NOT_FOUND`.

### 5.5 Reviews

**How the rating works.** The catalogue came with a rating for each product that does not match the three reviews imported with it (it was based on many more). So the catalogue rating counts as the imported reviews, weighted by how many there are, and every review written in ShopSmart moves the rating from there:

```
rating      = (catalogueRating × importedReviews + sum of written ratings) / (importedReviews + writtenReviews)
reviewCount = importedReviews + writtenReviews
```

A first new review nudges the rating instead of replacing it. For example product 1 has a catalogue rating of 2.56 and three imported reviews; one new 4 star review makes it `(2.56 × 3 + 4) / 4 = 2.92` with `reviewCount` 4. A product an admin added starts at 0 and is rated from its own reviews. Adding, editing or deleting a review updates the product's `rating` and `reviewCount` at once and makes the AI review summary stale.

#### `GET /api/products/:id/reviews`

Optional auth. Newest first.

| Query | Format |
|---|---|
| `page` | Whole number from 1. Default 1. |
| `limit` | Whole number from 1. Default 10, at most 50. |

**200**

```json
{
  "success": true,
  "reviews": [
    { "_id": "6afb790454cff2253a63adf5", "product": 1, "user": null, "reviewerName": "Eleanor Collins", "rating": 5, "comment": "Highly impressed!", "verifiedPurchase": false, "createdAt": "2025-04-30T09:41:02.053Z", "updatedAt": "2025-04-30T09:41:02.053Z", "date": "2025-04-30T09:41:02.053Z" }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 3, "pages": 1 },
  "stats": { "rating": 2.56, "reviewCount": 3, "breakdown": { "1": 0, "2": 0, "3": 1, "4": 1, "5": 1 } },
  "myReview": null
}
```

- `stats.rating` and `stats.reviewCount` are the product's own values (the blend above).
- `stats.breakdown` counts the stored reviews by star; its values add up to `reviewCount`.
- `myReview` is the signed in caller's review of this product, or `null` (always `null` for guests). Use it to prefill the form and to offer "Edit your review".

Errors: `400 INVALID_ID`, `400 VALIDATION_ERROR` (paging), `404 PRODUCT_NOT_FOUND`.

#### `POST /api/products/:id/reviews`

Shopper. Writes the caller's review, or edits it if they already wrote one: there is one review per account per product, and sending again never fails as a duplicate.

| Field | Rules |
|---|---|
| `rating` | Required whole number from 1 to 5. |
| `comment` | Required text, 3 to 1000 characters. Trimmed. |

```json
{ "rating": 4, "comment": "Lovely mascara, lasts all day" }
```

**201** for a new review, **200** for an edit:

```json
{
  "success": true,
  "review": { "_id": "6afb791758301b2f7d54351c", "product": 1, "user": "6afb790454cff2253a63b03a", "reviewerName": "Demo Shopper", "rating": 4, "comment": "Lovely mascara, lasts all day", "verifiedPurchase": false, "createdAt": "2026-11-16T21:43:51.870Z", "updatedAt": "2026-11-16T21:43:51.870Z", "date": "2026-11-16T21:43:51.870Z" },
  "stats": { "rating": 2.92, "reviewCount": 4, "breakdown": { "1": 0, "2": 0, "3": 1, "4": 2, "5": 1 } }
}
```

`verifiedPurchase` is worked out again on every save, so a shopper whose order arrives later can save again to earn the badge.

Errors: `400 VALIDATION_ERROR` (fields `rating`, `comment`), `400 INVALID_ID`, `404 PRODUCT_NOT_FOUND`.

#### `DELETE /api/products/:id/reviews/:reviewId`

The review's author, or an admin (admins can also delete imported reviews).

**200**

```json
{ "success": true, "message": "Review deleted", "stats": { "rating": 2.56, "reviewCount": 3, "breakdown": { "1": 0, "2": 0, "3": 1, "4": 1, "5": 1 } } }
```

Errors: `400 INVALID_ID` ("Invalid product id" or "Invalid review id"), `403 FORBIDDEN` ("You can only delete your own reviews."), `404 PRODUCT_NOT_FOUND`, `404 REVIEW_NOT_FOUND`.

#### `GET /api/products/:id/review-summary`

Public. Gemini reads the product's newest reviews (up to 50) and writes a short verdict with pros and cons. The summary is cached on the product with a fingerprint of its reviews, so it is written once and served from the cache until a review is added, edited or deleted. Cached answers do not count against the rate limit and are served even when no Gemini key is configured. Requests that arrive while the same summary is being written wait for it and get the same answer, so Gemini is asked once.

**200**, with a summary:

```json
{
  "success": true,
  "summary": {
    "verdict": "Shoppers like the long-lasting volume, though a few found it clumpy.",
    "pros": ["Long lasting", "Adds volume"],
    "cons": ["Can clump"],
    "basedOn": 4,
    "generatedAt": "2026-11-16T21:50:02.114Z"
  },
  "cached": true
}
```

| Field | Meaning |
|---|---|
| `summary.verdict` | One or two sentences, at most 400 characters. |
| `summary.pros`, `summary.cons` | Up to 4 short phrases each, at most 120 characters each. Either may be empty. |
| `summary.basedOn` | How many reviews were read for this summary. |
| `summary.generatedAt` | When Gemini wrote it. |
| `cached` | `true` when served from the cache, `false` when written for this request. |

**200**, when the product has no reviews: `{ "success": true, "summary": null, "cached": false }`. Hide the panel.

Errors: `503 AI_UNAVAILABLE` (no key and nothing cached, Gemini busy, or today's `AI_SUMMARY_DAILY_MAX` already spent), `504 AI_TIMEOUT`, `502 AI_FAILED`, `429 RATE_LIMITED` (only when a new summary was needed), `400 INVALID_ID`, `404 PRODUCT_NOT_FOUND`. None of these affect the rest of the product page; hide or collapse the summary panel.

### 5.6 AI assistant

The Gemini key lives only on the server. Without it the AI endpoints answer `503 AI_UNAVAILABLE`, and the client keeps its on-device parser as the fallback.

#### `GET /api/ai/status`

Public.

```json
{ "success": true, "enabled": true, "model": "gemini-2.5-flash" }
```

`enabled` is `false` when no key is configured.

#### `POST /api/ai/search`

Public, AI rate limit. Reads a shopper's message ("running shoes under $80 with good reviews") into catalogue filters. The prompt carries the real category slugs and brand names from the database, and the answer is checked against them before it is returned, so every category and brand in `result` exists.

| Field | Rules |
|---|---|
| `query` | Required text, 2 to 300 characters. |
| `previous` | Optional object: the earlier turn of the same conversation, so a follow-up such as "only Samsung" or "cheaper" refines it instead of starting over. |
| `previous.query` | Required when `previous` is sent. Text, at most 300 characters. |
| `previous.filters` | Optional. Any JSON object describing the filters used for the earlier turn (usually the earlier `result`, or the client's own filter object), at most 2000 characters once serialised. |

```json
{
  "query": "only samsung",
  "previous": { "query": "phones under 1000", "filters": { "categories": ["smartphones"], "maxPrice": 1000 } }
}
```

**200**

```json
{
  "success": true,
  "result": {
    "categories": ["smartphones"],
    "brands": ["Samsung"],
    "minPrice": null,
    "maxPrice": 1000,
    "minRating": null,
    "onSale": false,
    "sortBy": "relevance",
    "keywords": [],
    "summary": "Here are Samsung phones under $1000."
  },
  "source": "gemini"
}
```

| Field | Meaning |
|---|---|
| `categories` | Up to 6 existing category slugs. Maps to `category`. |
| `brands` | Up to 10 existing brand names, spelt as stored. Maps to `brand`. |
| `minPrice`, `maxPrice` | Numbers in dollars (cents at most) or `null`. When both are set, `minPrice ≤ maxPrice`. |
| `minRating` | A number above 0 and at most 5 (one decimal), or `null`. |
| `onSale` | `true` when the shopper asked for deals or discounts. The mini project turned this into `minDiscount: 10`. |
| `sortBy` | One of the product `sort` values. `"relevance"` means "best match": keep the client's own ranking. |
| `keywords` | Up to 8 lowercase words (3 to 30 characters) worth matching against product text, without the brand and category words already mapped. Best used for ranking rather than as a strict `q` filter. |
| `summary` | One friendly sentence for the chat bubble, at most 300 characters. May be empty. |
| `source` | Always `"gemini"`. The client labels its own fallback answers differently. |

Errors: `400 VALIDATION_ERROR` (fields `query`, `previous.query`, `previous.filters`), `429 RATE_LIMITED`, `502 AI_FAILED`, `503 AI_UNAVAILABLE`, `504 AI_TIMEOUT`. On any of these, answer with the on-device parser.

### 5.7 Saved lists

All Shopper. Guests keep their lists in the browser; these endpoints keep a signed in shopper's lists on the account so they follow them across devices. Every write cleans the list (unknown or deleted product ids are dropped) and returns what was stored. The compare list is not stored on the server.

#### `GET /api/lists`

```json
{ "success": true, "cart": [{ "id": 1, "quantity": 2 }], "wishlist": [5, 9], "recentlyViewed": [9, 1, 30] }
```

`recentlyViewed` is newest first.

#### `PUT /api/lists/cart`

Replaces the saved cart. Send the whole cart after every change.

| Field | Rules |
|---|---|
| `items` | Required list of 0 to 50 lines `{ id, quantity }`. `id` is a whole number from 1; `quantity` a whole number from 1 to 99. |

Repeated lines for the same product are joined (quantities added, at most 99). Stock is not checked here; checkout checks it.

**200** `{ success, cart }`

Errors: `400 VALIDATION_ERROR` (fields such as `items[0].quantity`).

#### `PUT /api/lists/wishlist`

| Field | Rules |
|---|---|
| `ids` | Required list of up to 100 product ids (whole numbers, not strings). May be empty. |

Duplicates are removed. **200** `{ success, wishlist }`

#### `PUT /api/lists/viewed`

| Field | Rules |
|---|---|
| `ids` | Required list of up to 100 product ids, newest first. |

Only the 12 most recent are kept. **200** `{ success, recentlyViewed }`

#### `POST /api/lists/merge`

Run once after sign in or sign up, with what the guest collected on this device. Every field is optional and the body may be empty.

| Field | Rules |
|---|---|
| `cart` | List of 0 to 50 `{ id, quantity }` lines. Joined with the account's cart; quantities for the same product are added (at most 99). |
| `wishlist` | List of up to 100 product ids. Joined with the account's wishlist. |
| `recentlyViewed` | List of up to 100 product ids. Placed before the account's list (this device's browsing is the newest), 12 kept. |

**200** `{ success, cart, wishlist, recentlyViewed }`. Replace the local lists with these.

### 5.8 Orders

All endpoints need a token. `:ref` is an order `number` (`SS100001`, any letter case) or an order `_id`; anything else is `400 INVALID_ID` ("Invalid order number").

#### `POST /api/orders`

Shopper. Places an order. Only ids and quantities are read from the cart: titles, images, prices and totals come from the database. Stock is reserved for each line at checkout; if any line cannot be reserved, nothing is reserved and no order is created.

| Field | Rules |
|---|---|
| `items` | Required list of 1 to 50 lines `{ id, quantity }`. `id` is a whole number from 1; `quantity` a whole number from 1 to 99. Repeated lines for the same product are joined. Any other field on a line (such as a price) is ignored. |
| `delivery` | Required object, all seven fields required: |
| `delivery.name` | Text, 2 to 60 characters. |
| `delivery.email` | A valid email. Stored lowercase. |
| `delivery.phone` | 10 digits; spaces and dashes between them are allowed (`"98765 43210"`). Stored as digits only. |
| `delivery.address` | Text, 8 to 160 characters. |
| `delivery.city`, `delivery.state` | Text, at most 60 characters. |
| `delivery.pincode` | 6 digits; spaces allowed. Stored as digits only. |
| `payment` | Required object: |
| `payment.method` | `"card"`, `"upi"` or `"cod"`. |
| `payment.cardLast4` | Required for `card`: exactly the last 4 digits ("Send only the last 4 digits of the card"). Never send the full card number or the CVV. |
| `payment.upiId` | Required for `upi`: a UPI ID such as `name@bank`. |

```json
{
  "items": [{ "id": 1, "quantity": 2 }, { "id": 6, "quantity": 1 }],
  "delivery": {
    "name": "Demo Shopper",
    "email": "demo@shopsmart.dev",
    "phone": "98765 43210",
    "address": "12 MG Road, Indiranagar",
    "city": "Bengaluru",
    "state": "Karnataka",
    "pincode": "560001"
  },
  "payment": { "method": "card", "cardLast4": "4242" }
}
```

**201** `{ success, order }` with the [Order](#34-order) shown above.

After a successful order the server also:

- removes the ordered products from the account's saved cart (other lines stay), so reload `GET /api/lists` or drop those lines locally;
- saves the delivery details (without the email) as the account's `address`, so reload `GET /api/auth/me` to prefill the next checkout.

`minimumOrderQuantity` is not enforced.

Errors:

- `400 VALIDATION_ERROR` with field paths such as `items[0].quantity`, `delivery.phone`, `delivery.pincode`, `payment.method`, `payment.cardLast4`, `payment.upiId`.
- `409 OUT_OF_STOCK`, listing every line that cannot be filled:

  ```json
  {
    "success": false,
    "message": "Only 97 left of Essence Mascara Lash Princess.",
    "code": "OUT_OF_STOCK",
    "details": {
      "items": [{ "id": 1, "title": "Essence Mascara Lash Princess", "requested": 99, "available": 97 }]
    }
  }
  ```

  `available` is 0 for a sold out product. A product that no longer exists has `"title": null` and `"available": 0`. The message names the product when only one line is affected ("Only 2 left of Rare Vase.", "Sold Out Lamp is out of stock.", "One of the products in your cart is no longer sold."), otherwise it is "Some items in your cart are not available in the quantity you asked for."

#### `GET /api/orders/mine`

Shopper. Every order the caller placed, newest first (not paged).

**200** `{ success, orders }`

#### `GET /api/orders/:ref`

The order's owner, or an admin.

**200** `{ success, order }`

Errors: `400 INVALID_ID`, `404 ORDER_NOT_FOUND` ("We could not find that order."), which is also the answer for another shopper's order.

#### `PATCH /api/orders/:ref/cancel`

The order's owner, while the order is `processing`. Puts the stock back.

| Field | Rules |
|---|---|
| `reason` | Optional text, at most 200 characters. Saved in the history note. |

**200** `{ success, order }` with `status: "cancelled"` and a new `statusHistory` entry whose note is "Cancelled by the shopper" (or "Cancelled by the shopper: &lt;reason&gt;").

Errors: `409 ORDER_NOT_CANCELLABLE` ("This order is already shipped and can no longer be cancelled."), `409 ORDER_CHANGED`, `403 FORBIDDEN` (an admin opening someone else's order; admins cancel through the status endpoint), `404 ORDER_NOT_FOUND`, `400 INVALID_ID`.

#### `GET /api/orders`

Admin. Every order, newest first.

| Query | Format | Meaning |
|---|---|---|
| `status` | `processing`, `shipped`, `delivered` or `cancelled` | Only orders with this status. |
| `q` | Text, at most 100 characters | Part of the order number, the delivery name or email, or the account's name or email. Not case sensitive. |
| `page` | Whole number from 1 | Default 1. |
| `limit` | Whole number from 1 | Default 20, at most 100. |

**200** `{ success, orders, pagination }`

Errors: `400 VALIDATION_ERROR` "Invalid query parameters", `403 FORBIDDEN`.

#### `PATCH /api/orders/:ref/status`

Admin. Moves an order one step on, or cancels it before delivery (which puts the stock back).

| Field | Rules |
|---|---|
| `status` | Required: `"shipped"`, `"delivered"` or `"cancelled"`. |
| `note` | Optional text, at most 200 characters, for the history. Defaults: "Handed to the courier", "Delivered", "Cancelled by the store". |

```json
{ "status": "shipped", "note": "Sent with BlueDart" }
```

**200** `{ success, order }`

The next statuses an admin can choose, by current status:

| Current | Can move to |
|---|---|
| `processing` | `shipped`, `cancelled` |
| `shipped` | `delivered`, `cancelled` |
| `delivered` | nothing |
| `cancelled` | nothing |

Errors: `409 INVALID_STATUS_TRANSITION` ("This order is already shipped." or "An order cannot move from processing to delivered."), `409 ORDER_CHANGED`, `400 VALIDATION_ERROR` (field `status`), `404 ORDER_NOT_FOUND`, `403 FORBIDDEN`.

### 5.9 Admin dashboard

#### `GET /api/admin/summary`

Admin.

```json
{
  "success": true,
  "totals": { "users": 2, "products": 194, "orders": 1, "revenue": 74.96 },
  "ordersByStatus": { "processing": 0, "shipped": 1, "delivered": 0, "cancelled": 0 },
  "lowStock": [{ "id": 117, "title": "...", "stock": 0, "availabilityStatus": "Out of Stock" }],
  "topProducts": [{ "product": { "id": 1, "title": "Essence Mascara Lash Princess" }, "soldCount": 2 }],
  "recentOrders": [{ "_id": "...", "number": "SS100001", "user": { "_id": "...", "name": "Demo Shopper", "email": "demo@shopsmart.dev" } }],
  "salesByDay": [
    { "date": "2026-11-04", "orders": 0, "revenue": 0 },
    { "date": "2026-11-17", "orders": 1, "revenue": 74.96 }
  ]
}
```

| Key | Meaning |
|---|---|
| `totals.users` | Every account, customers and admins. |
| `totals.products` | Products in the catalogue. |
| `totals.orders` | Every order, including cancelled ones. |
| `totals.revenue` | The sum of order `total`s (delivery fees included), leaving out cancelled orders. |
| `ordersByStatus` | A count for each of the four statuses, 0 included. |
| `lowStock` | Up to 5 full [products](#32-product) with fewer than 10 units, fewest first (out of stock first). |
| `topProducts` | Up to 5 bestsellers by `soldCount`, as `{ product, soldCount }`. |
| `recentOrders` | The 5 newest full [orders](#34-order). |
| `salesByDay` | Exactly 14 entries, oldest first, ending today: `{ date: "YYYY-MM-DD", orders, revenue }` for orders that were not cancelled. Days without sales are included with zeros. Days follow the store's time zone (`STORE_TIMEZONE`, `Asia/Kolkata` by default). |

### 5.10 Account management

All Admin.

#### `GET /api/users`

| Query | Format | Meaning |
|---|---|---|
| `q` | Text, at most 100 characters | Part of the name or email, not case sensitive. |
| `role` | `customer` or `admin` | Only accounts with this role. |
| `page` | Whole number from 1 | Default 1. |
| `limit` | Whole number from 1 | Default 20, at most 100. |

Newest accounts first. Each [user](#31-user) has an extra `orderCount`.

**200**

```json
{
  "success": true,
  "users": [{ "_id": "6afb790454cff2253a63b03a", "name": "Demo Shopper", "email": "demo@shopsmart.dev", "role": "customer", "address": { "name": "Demo Shopper", "phone": "9876543210", "address": "12 MG Road, Indiranagar", "city": "Bengaluru", "state": "Karnataka", "pincode": "560001" }, "createdAt": "...", "updatedAt": "...", "orderCount": 1 }],
  "pagination": { "page": 1, "limit": 20, "total": 2, "pages": 1 }
}
```

#### `PATCH /api/users/:id`

| Field | Rules |
|---|---|
| `role` | Required: `"customer"` or `"admin"`. |

Takes effect on the account's next request, without signing it out.

**200** `{ success, user }`

Errors: `409 SELF_ROLE_CHANGE` ("You cannot change your own role."), `403 DEMO_ACCOUNT_LOCKED` when the account is a shared demo account and the role would change, `400 VALIDATION_ERROR` (field `role`), `400 INVALID_ID` ("Invalid user id"), `404 ACCOUNT_NOT_FOUND`.

#### `DELETE /api/users/:id`

Deletes the account. Its sessions stop working (`401 USER_NOT_FOUND`). Its orders stay, with `user: null`, and its reviews stay.

**200** `{ "success": true, "message": "Account meera@example.com deleted" }`

Errors: `409 SELF_DELETE` ("You cannot delete your own account."), `403 DEMO_ACCOUNT_LOCKED` for a shared demo account, `400 INVALID_ID`, `404 ACCOUNT_NOT_FOUND`.

---

## 6. Notes for the client

**Session.** Keep the token (for example in `localStorage`) and call `GET /api/auth/me` on start to check it. On a `401` whose code is `TOKEN_EXPIRED`, `TOKEN_INVALID`, `TOKEN_REVOKED` or `USER_NOT_FOUND`, and only when the request carried the current token, clear the session and send the shopper to sign in with a "your session ended" note. After `PATCH /api/auth/password`, store the token it returns.

**Errors.** Show `message` as it is. For forms, map each `errors[].field` onto its input; the last part of the path is the input name (`delivery.phone` → `phone`, `items[0].quantity` → the first line's quantity).

**Products.** Load the catalogue with `GET /api/products?limit=0` and read `products`. Use `reviewCount` from the product (there is no `reviews` array) and fetch reviews from the reviews endpoint. Work out the struck-through price as in [Product](#32-product). `availabilityStatus` says "Low Stock" below 10 units.

**Lists.** After sign in or sign up, call `POST /api/lists/merge` once with the guest's lists and replace the local lists with the answer. While signed in, send the whole list after each change (`PUT /api/lists/cart`, `/wishlist`, `/viewed`). Keep cart quantities between 1 and 99 and at most 50 lines, or the whole `PUT` is rejected. The server keeps 12 recently viewed products.

**Checkout.** Requires sign in. Prefill delivery from `user.name`, `user.email` and `user.address`. Send only ids and quantities, `delivery` and `payment` (`cardLast4` or `upiId`, never the card number or CVV). Show the server's totals from the returned order. On `409 OUT_OF_STOCK`, use `details.items` to point at the lines to fix. On success, go to the order page with `order.number`.

**Orders.** Label statuses from `status`: `processing` "Processing", `shipped` "On the way", `delivered` "Delivered", `cancelled` "Cancelled". Use `createdAt` as the order date and `payment.method` / `payment.cardLast4` for the payment line. Offer "Cancel order" only while `status` is `processing`. For the admin status control, offer only the next statuses in the table under [PATCH /api/orders/:ref/status](#patch-apiordersrefstatus).

**AI search.** Call `POST /api/ai/search` with the message and, for a follow-up, `previous: { query, filters }` from the last answer. On any error (`503`, `504`, `502`, `429`), or when the result has no filters and no keywords, use the on-device parser instead. `GET /api/ai/status` (or `ai` in `/api/health`) says up front whether Gemini is configured.

**Review summary.** Request it after the product page renders. Show it when `summary` is not `null`; on any error, hide the panel. Saving or deleting a review makes the next request write a fresh summary.

**Price chart.** Use `points` (with dates) for the chart and `prediction` for the verdict. When `prediction.hasEnoughData` is `false`, show a short "not enough price history yet" note instead of a chart.

**Free-tier hosting.** A sleeping server can take up to a minute to answer the first request. A generous timeout (about 20 seconds) and a "waking up the server" notice on slow requests help.

---

## 7. Server configuration

Set in `server/.env` locally (copy `server/.env.example`) or in the host's environment. Values set by the host win over the file.

| Variable | Default | Meaning |
|---|---|---|
| `NODE_ENV` | `development` | `production` on the host. Only an explicit `development` (as in `.env.example`) logs each request and adds a `stack` to `500` answers. Left unset, the server runs as in development without those two, and warns at startup. |
| `PORT` | `5050` | HTTP port. |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/shopsmart` | MongoDB connection string (local or Atlas). |
| `JWT_SECRET` | none, required | Secret for signing tokens. The server will not start without it, and in production not with fewer than 32 characters or with the `.env.example` value. |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime. |
| `CLIENT_URL` | `http://localhost:3000` | Allowed browser origins, comma separated. Required in production, where each one must be a bare origin such as `https://shopsmart.onrender.com` (no path, lower case), or the server will not start. |
| `AUTH_RATE_LIMIT_MAX` | `50` | Sign in requests per IP per 15 minutes. |
| `AI_RATE_LIMIT_MAX` | `60` | AI searches per IP per 15 minutes, and separately new review summaries per IP per 15 minutes. |
| `AI_SUMMARY_DAILY_MAX` | `100` | New review summaries the whole server may ask Gemini for each day (from midnight UTC). Keep it well under the key's daily request quota, which AI search shares. `0` turns new summaries off; cached ones are still served. |
| `GEMINI_API_KEY` | empty | Google Gemini key. Without it the AI endpoints answer `503 AI_UNAVAILABLE`. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model name. |
| `GEMINI_TIMEOUT_MS` | `9000` | How long to wait for Gemini before `504 AI_TIMEOUT`. |
| `STORE_TIMEZONE` | `Asia/Kolkata` | IANA time zone for the dashboard's daily sales. The server will not start with an unknown zone. |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | `admin@shopsmart.dev`, `Admin@1234` | The admin account `npm run seed` creates. |
| `DEMO_ACCOUNT_EMAILS` | `SEED_ADMIN_EMAIL` and `demo@shopsmart.dev` | Shared demo accounts, comma separated. Their password cannot be changed, they cannot be signed out on every device, and admins cannot change their role or delete them (`403 DEMO_ACCOUNT_LOCKED`). Set it to an empty value to treat them like any other account. |

The tests (`npm test`) need a MongoDB at `mongodb://127.0.0.1:27017`. For one elsewhere, set `TEST_MONGO_BASE_URI` (for example `mongodb://127.0.0.1:27036`) in the shell or in `.env`. It is never taken from `MONGO_URI`, so the tests cannot drop databases on a real cluster. Each test file creates and drops its own `shopsmart_test_<name>` database and stubs Gemini, so the tests never touch the development database or call the real API.
