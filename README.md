# ShopSmart - AI Shopping Assistant

An e-commerce product discovery app built with React. Along with the usual browsing,
filtering and cart features, it understands a shopping request written as a normal
sentence, suggests products based on what you looked at, and estimates where a price
is heading.

## 🔗 Live Demo

**[https://shopsmart-project.netlify.app](https://shopsmart-project.netlify.app)**

## 📖 Description

ShopSmart is a front-end shopping assistant for anyone who finds it tiring to translate
"a decent pair of wireless headphones under fifty dollars" into six separate filter
clicks. It loads a live catalogue of 194 products, lets you narrow it down by category,
price, brand and rating, compare a shortlist side by side, and keep a cart and wishlist
that survive a page refresh.

## ✨ Features

- **Storefront home** - promotional banner built from the day's biggest discounts, category tiles, delivery and returns promises, and a deals carousel
- **Category pages** - every tile opens a page for that category alone, with its own search, sort, brand and price filters scoped to what is in it, collapsed behind a Filters button on phones so the products stay in view
- **Product catalogue** - responsive grid of products with images, prices, discounts, ratings and low stock hints, loaded from a public API with skeleton loading states
- **Advanced filtering** - filter by category, brand, price band or custom price range, and minimum customer rating, with every active filter shown as a chip you can remove in one tap
- **Search and sort** - debounced keyword search plus seven sort options including price, rating, popularity and newest
- **Product details** - image gallery, full specifications, stock and shipping information, and customer reviews with a star breakdown, verified purchase badges and a form to write, edit or delete your own
- **Comparison tool** - line up to four products side by side with the lowest price and best rated options flagged
- **Shopping cart** - quantity controls, discount savings, free delivery threshold, saved to local storage
- **Checkout** - a three step delivery, payment and review flow for signed in shoppers, filled in from the saved address. The order is priced and saved by the API, which also sets the stock aside; lines that sold out meanwhile are marked with a way to fix them. No payment is taken
- **Order history** - every order on the account, with its status timeline, delivery address, payment summary, cancelling while it is still processing, and a buy again button
- **Wishlist** - save products for later and move the whole list to the cart in one click
- **Responsive design** - tested at 375px, 768px and 1920px
- **AI: shopping assistant page** - a dedicated chat where you describe what you need, see the products inline, and keep refining across turns
- **AI: natural language search** - Gemini, called by the ShopSmart server, works out the filters from a sentence, with an on-device parser as backup
- **AI: review summary** - Gemini sums up a product's reviews as a short verdict with pros and cons, written on the server and cached until the reviews change
- **AI: recommendation engine** - "Recommended for you" and "Similar products" built from what you view, save and buy
- **AI: price drop prediction** - a trend fitted to the product's recorded weekly prices that estimates the price two weeks out

## 🎯 Project Goals

The aim was to build a complete React application from scratch rather than assemble one
from tutorials: component structure, hooks, context, routing, responsive CSS and
accessibility all done by hand. The second goal was to make the AI features genuinely
functional instead of decorative, which meant writing the query parser, the TF-IDF
similarity model and the regression forecast rather than calling a paid API and hoping
for the best.

## 🛠 Technologies Used

- **Frontend:** React 18 with hooks (useState, useEffect, useMemo, useCallback, useContext)
- **Build tool:** Vite
- **Styling:** CSS3 with custom properties, one stylesheet per component, an 8px spacing scale and a three colour palette
- **Routing:** React Router DOM v6
- **Icons:** React Icons (Feather set)
- **APIs:** [DummyJSON Products API](https://dummyjson.com/docs/products) for the catalogue, [Google Gemini API](https://ai.google.dev/) (`gemini-2.5-flash`) for query understanding
- **AI:** Gemini with structured JSON output for natural language search, plus models written from scratch in plain JavaScript - a rule based query parser, TF-IDF vectors with cosine similarity, and least squares linear regression
- **Deployment:** Netlify

## 🤖 AI Integration

The AI features are described below with the idea behind each. Gemini is only ever called
by the ShopSmart server, so its key never reaches the browser.

### 1. Shopping assistant and natural language search

Type a request the way you would say it out loud and the filters are worked out for you.
Asking from the shop page opens the **assistant page** (`/assistant`), a chat where each
answer carries the reply, the filters it used as chips, the matching products as real
cards you can add to the cart from, and a button to open the full result set back in the
shop with those filters applied.

Answers build on each other. The previous request and its filters are sent with the next
message, so a follow-up refines instead of starting over:

> **you** gift for my wife who loves perfume, up to 150
> **assistant** I'm looking for perfumes for your wife, with a maximum price of $150.
> *In Fragrances · Under $150* - 5 matches
>
> **you** show cheaper options
> **assistant** I'm looking for cheaper perfume options for your wife.
> *In Fragrances · Under $150*, now sorted by price

The conversation is kept in local storage, so leaving the page and coming back does not
lose it. Two engines sit behind the box.

**Gemini (`POST /api/ai/search`, `server/services/aiSearch.js`).** The client sends the
message, and the earlier turn for a follow-up, to the ShopSmart API (`src/services/ai.js`).
The server sends it to `gemini-2.5-flash` along with the exact category slugs and brand
names in the database. A response schema forces the
model to reply with structured JSON rather than prose, and thinking is disabled to keep
the round trip near a second. Its answer is never trusted directly: categories and brands
are checked against the real catalogue, prices are sanity checked and swapped if reversed,
the rating is clamped to 0-5 and the sort key must be one the app actually supports. This
is what handles a request with no product words in it at all:

| What you type | What Gemini extracts |
| --- | --- |
| `my phone screen keeps cracking, what should I get` | Mobile Accessories, keyword "screen protector" |
| `gift for my wife who loves perfume, up to 150` | Fragrances, max price 150, keyword "gift" |
| `best rated laptop for college, budget around 900` | Laptops, max price 900, sorted by rating |

**On-device parser (`src/utils/nlpSearch.js`).** If the server has no Gemini key
(`GET /api/ai/status` says so), the request fails or times out, or the model returns
nothing usable, the same sentence is parsed locally instead,
and `mergeWithPrevious` carries the earlier filters over so follow-ups still work.
It recognises price phrases (`under`, `over`, `between`, `around`, `1k`), rating phrases,
discount wording, sort intent, gender hints and around 90 everyday product words:

| What you type | What it extracts |
| --- | --- |
| `wireless headphones under $50 rated above 4` | Mobile Accessories, max price 50, min rating 4 |
| `cheapest samsung smartphone` | Smartphones, brand Samsung, sorted by price ascending |
| `womens shoes on sale between 20 and 80` | Womens Shoes, discounted only, price 20 to 80 |

Whichever engine answers, the leftover words become keywords and products are ranked
against them with TF-IDF cosine relevance (`src/utils/textIndex.js`), so a rare word like
"titanium" counts for far more than a common one. The result is always shown back as
chips with a label saying whether Gemini or the device read the sentence, and why the
device stepped in, so the shopper can see why the product list changed.

### 2. Recommendation engine

`src/utils/recommend.js` builds a weighted TF-IDF vector for every product from its
title, brand, category, tags and description. "Similar products" on the detail page is
the cosine similarity between two products, topped up for a matching category, brand
and a similar price. "Recommended for you" merges the vectors of everything you viewed,
wishlisted or added to the cart into a single taste profile, weights recent activity
higher, and returns the closest products you have not seen yet.

### 3. Price drop prediction

Every product keeps its recorded prices on the server: twelve weekly prices from the
seed, plus a new point whenever an admin changes the price.
`GET /api/products/:id/price-history` fits a least squares line through them against time,
extends it two weeks forward, and turns the R squared value of the fit into the
confidence figure. The product page draws the recorded prices by date with the dashed
forecast (`src/utils/priceChart.js`) and a plain English verdict: likely to drop, likely
to rise or holding steady. A product with fewer than three recorded prices says there is
not enough history yet instead.

**Challenges faced.** Getting a language model to return something a UI can use was the
first problem: free text answers were impossible to filter with, so the request moves to
a response schema and every field of the reply is validated against the catalogue before
it touches the filters. A model that invents a category it likes the sound of should not
be able to empty the product grid. The second problem was not depending on it, since the
key can be missing and the network can fail, which is why the rule based parser stayed in
the project as a fallback rather than being deleted once Gemini worked. Writing that
parser had its own trap: matching on single words alone produced nonsense, for example
"accessories" pulling in mobile accessories when the shopper typed "gym accessories", so
the word lists were narrowed and word boundary matching was used everywhere. The
recommendation scoring needed limiting too, as price similarity alone was ranking a chair
next to a smartphone, so price is only allowed to refine products that already share a
category, brand or vocabulary.

## 🚀 Setup Instructions

### Prerequisites

- Node.js v16 or higher
- npm

### Installation Steps

1. Clone the repository

   ```bash
   git clone https://github.com/fathimakh/ShopSmart.git
   ```

2. Navigate to the project directory

   ```bash
   cd ShopSmart
   ```

3. Install dependencies

   ```bash
   npm install
   ```

4. Add a Gemini API key (optional)

   The key belongs to the server only: put a key from
   [Google AI Studio](https://aistudio.google.com/apikey) in `server/.env` as
   `GEMINI_API_KEY`. The client has no AI key of its own. Without one, natural language
   search falls back to the parser that runs in the browser and the review summary
   shows a short note instead, so nothing breaks.

5. Start the development server

   ```bash
   npm run dev
   ```

6. Open `http://localhost:3000` in your browser

The catalogue API is public and needs no key.

To create a production build, run `npm run build` and preview it with `npm run preview`.

## 🧾 About the checkout

Checkout needs an account, so a guest is asked to sign in first and comes straight back
with the cart. It walks through delivery details (filled in from the address saved on
the account), a payment method and a review screen, validates every field the way the
server does, then sends the order to `POST /api/orders`.

- The server prices every line itself and sets the stock aside. A line that sold out in
  the meantime comes back marked, with a button to lower the quantity or remove it.
- The order and its status history are saved to the account and listed under Orders,
  where it can be cancelled while it is still processing.
- ShopSmart is still a demo store: no payment is taken. For a card, only the last four
  digits are sent with the order; the full number and the CVV never leave the page.
  Cash on delivery and UPI are offered too.

## 📁 Project Structure

```
src/
├── components/          one folder per component, JSX and CSS together
│   ├── AiSearchPanel/
│   ├── CompareBar/
│   ├── EmptyState/
│   ├── FilterPanel/
│   ├── FormField/
│   ├── Footer/
│   ├── Header/
│   ├── PricePrediction/
│   ├── ProductCard/
│   ├── ProductGrid/
│   ├── QuantityStepper/
│   ├── RecommendationRow/
│   ├── SearchBar/
│   └── StarRating/
├── context/
│   ├── CatalogContext.jsx    catalogue fetching and derived filter options
│   └── ShopContext.jsx       cart, wishlist, comparison and view history
├── hooks/
│   ├── useDebounce.js
│   ├── useLocalStorage.js
│   ├── usePageTitle.js
│   └── useShoppingAssistant.js   the conversation, its memory and its answers
├── styles/
│   └── browse.css       the toolbar and filter shell shared by shop and category pages
├── pages/
│   ├── Assistant.jsx
│   ├── Cart.jsx
│   ├── CategoryPage.jsx
│   ├── Checkout.jsx
│   ├── OrderDetails.jsx
│   ├── Orders.jsx
│   ├── Compare.jsx
│   ├── Home.jsx
│   ├── NotFound.jsx
│   ├── ProductDetails.jsx
│   └── Wishlist.jsx
├── services/
│   ├── api.js                fetching and normalising products
│   ├── fallbackProducts.js   offline snapshot of the catalogue
│   ├── ai.js                 the server's AI search and its status
│   ├── orders.js             placing, reading and cancelling orders
│   └── reviews.js            product reviews and their AI summary
├── utils/
│   ├── checkoutValidation.js form validation and card formatting
│   ├── filters.js            filtering, searching and sorting
│   ├── format.js             price, date and text formatting
│   ├── nlpSearch.js          natural language query parsing
│   ├── orders.js             order status and payment summaries
│   ├── priceChart.js         the recorded prices and forecast as chart points
│   ├── recommend.js          similarity and recommendations
│   └── textIndex.js          TF-IDF index shared by search and recommendations
├── App.jsx
├── index.css                 design tokens and shared styles
└── main.jsx
```

## 📱 Responsive Design

Tested and working on:

- Mobile devices from 375px, with a bottom navigation bar for shop, assistant, saved items and cart, a collapsible filter drawer and a two column product grid
- Tablets from 768px
- Desktops from 1024px, with a sticky filter sidebar

## 📸 Screenshots

| Shop page with filters and AI search |
| --- |
| ![Shop page](docs/screenshots/home.png) |

| Shopping assistant answering a vague request |
| --- |
| ![Shopping assistant](docs/screenshots/assistant.png) |

| Natural language search answered by Gemini |
| --- |
| ![AI search](docs/screenshots/ai-search.png) |

| Category page |
| --- |
| ![Category page](docs/screenshots/category.png) |

| Checkout | Order confirmation |
| --- | --- |
| ![Checkout](docs/screenshots/checkout.png) | ![Order confirmed](docs/screenshots/order.png) |

| Product details with price outlook | Mobile layout |
| --- | --- |
| ![Product details](docs/screenshots/product-details.png) | ![Mobile layout](docs/screenshots/mobile.png) |

## 🎨 Design Choices

- **Laid out like a shop, not a dashboard.** The home page opens with a banner, category
  tiles and a deals carousel because that is the order a shopper expects, and every image
  in those sections comes from the live catalogue rather than stock artwork.
- **Three colours, two fonts.** Indigo for actions, amber for deals and ratings, and a
  neutral grey scale. Outfit for headings, Inter for body text. Everything is defined as
  CSS custom properties in `index.css` so the theme can be changed in one place.
- **8px spacing scale.** All padding, gaps and margins come from `--space-1` to
  `--space-7`, which keeps rhythm consistent without eyeballing values.
- **Plain CSS per component.** Each component owns its stylesheet next to its JSX, so
  styles stay easy to trace and nothing leaks between components.
- **Thumb reachable navigation on phones.** Below 768px the links move into a fixed
  bottom bar with live cart and wishlist counts, which is where a phone user's thumb
  already is. The comparison tray and the assistant input sit above it rather than under
  it.
- **Code split by route.** Only the shop page ships in the first bundle. The other pages
  and the 65KB offline catalogue snapshot are fetched when they are actually needed, which
  keeps the initial download about a third smaller.
- **Two contexts instead of a state library.** `CatalogContext` owns server data,
  `ShopContext` owns the shopper's own data. Redux would have been more machinery than
  this app needs.
- **Offline fallback.** If the catalogue request fails, a saved snapshot of the products
  is used and a notice is shown, so the deployed site never renders an empty page.
- **Chat as a page, not a widget.** A floating chat bubble would have squeezed product
  cards into a corner. A full page lets an answer show six real product cards with working
  cart and compare controls, and hand the whole result set back to the shop.
- **Explainable AI.** The parsed query is displayed as chips, the panel says which engine
  read the sentence, and the forecast shows its confidence, because a suggestion the user
  cannot understand is a suggestion they will not trust.
- **No hard dependency on the model.** Gemini improves the search but is never required.
  Without a key, without network, or on an unusable answer, the local parser takes over
  and the shopper sees no error.

## 🐛 Known Issues

- The seeded weekly prices behind the forecast were generated from the catalogue's discount
  data, since the source catalogue has no price history. Admin price changes add real
  points from then on.
- Checkout records the payment method but never reaches a payment provider: no payment
  is taken.
- Very broad natural language queries such as "something nice for my sister" have no
  filters to extract and fall back to keyword relevance alone.
- The assistant answers from the catalogue it has. Asking for something the shop does not
  stock, such as a screen protector, returns the closest category it can rather than
  admitting there is no exact match.

## 🔮 Future Enhancements

- A MERN back end with real user accounts, so the cart, wishlist and conversation follow the user across devices
- Collaborative filtering once there is more than one user's behaviour to learn from
- Voice search using the Web Speech API
- Paginated or virtualised product loading for catalogues much larger than 194 items

## 👤 Author

**Fathima K H**

- GitHub: [@fathimakh](https://github.com/fathimakh)
- LinkedIn: [fathima-kh](https://www.linkedin.com/in/fathima-kh/)
- Email: fathimakh07@gmail.com

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- [DummyJSON](https://dummyjson.com) for the free product catalogue and images
- [React Icons](https://react-icons.github.io/react-icons/) for the Feather icon set
- [Google Fonts](https://fonts.google.com) for Outfit and Inter
- [Google AI Studio](https://aistudio.google.com) for the Gemini API used by the search box
- The React documentation, which was the reference for the hooks patterns used here
