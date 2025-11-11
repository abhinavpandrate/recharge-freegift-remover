// index.js
import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// --- CONFIGURATION ---
const RECHARGE_API_KEY = "sk_2x2_1b3d003b0c25cff897dc8bc261cd12f9cc048a0a3244c782e9f466542ba629fc"; // Replace with your actual Recharge API key
const PORT = process.env.PORT || 3000;

// Define your gift product
const GIFT_PRODUCT = {
  shopify_product_id: 15659115839870,
  shopify_variant_id: 56519341375870,
  sku: "Styrkr_Cycling_Cap_x1"
};

// --- UTILITY FUNCTIONS ---

// Fetch upcoming queued orders for a subscription
async function getUpcomingOrders(subscription_id) {
  const res = await fetch(`https://api.rechargeapps.com/subscriptions/${subscription_id}/upcoming_charges`, {
    headers: {
      "X-Recharge-Access-Token": RECHARGE_API_KEY,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    console.error("Error fetching upcoming orders:", await res.text());
    return [];
  }
  const data = await res.json();
  return data.upcoming_charges || [];
}

// Remove gift from a queued order
async function removeGiftFromOrder(order_id) {
  const payload = {
    line_items: [
      // Remove any line item with our gift variant ID
      { shopify_variant_id: GIFT_PRODUCT.shopify_variant_id, quantity: 0 }
    ]
  };

  const res = await fetch(`https://api.rechargeapps.com/orders/${order_id}`, {
    method: "PUT",
    headers: {
      "X-Recharge-Access-Token": RECHARGE_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (data.errors) {
    console.error(`Failed to remove gift from order ${order_id}:`, data.errors);
  } else {
    console.log(`Gift removed from order ${order_id}`);
  }
}

// --- WEBHOOK HANDLER ---
app.post("/webhook", async (req, res) => {
  const { subscription, order } = req.body;

  if (!subscription) {
    console.log("No subscription found in payload.");
    return res.status(400).send("No subscription data");
  }

  // Check if this is the first order
  const isFirstOrder = !subscription.has_previous_orders;
  if (isFirstOrder) {
    console.log(`First order for subscription ${subscription.id}. Gift can stay.`);
  } else {
    console.log(`Subscription ${subscription.id} - checking upcoming orders to remove gift.`);

    // Get upcoming orders
    const upcomingOrders = await getUpcomingOrders(subscription.id);

    for (const upOrder of upcomingOrders) {
      if (upOrder.status === "QUEUED") {
        await removeGiftFromOrder(upOrder.id);
      } else {
        console.log(`Skipping order ${upOrder.id}, status: ${upOrder.status}`);
      }
    }
  }

  res.status(200).send("Webhook processed");
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
