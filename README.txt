Tap & Wrap — Bundle pricing integration

NEW SERVER FILES
server/src/services/bundleOffer.service.js
server/src/services/pricing.service.js
server/src/validators/pricing.validator.js
server/src/controllers/pricing.controller.js
server/src/routes/pricing.routes.js

REPLACE SERVER FILES
server/src/services/discount.service.js
server/src/models/Order.js
server/src/controllers/order.controller.js
server/src/app.js

NEW CLIENT FILES
client/src/features/pricing/pricingApi.js
client/src/components/offer/AppliedOffersBox.jsx

REPLACE CLIENT FILES
client/src/components/discount/DiscountCodeBox.jsx
client/src/pages/CartPage.jsx
client/src/pages/CheckoutPage.jsx

After copying the files:
1. Restart server: npm run dev
2. Restart client: npm run dev
3. Test automatic offers in cart and checkout
4. Run client build: npm run build
