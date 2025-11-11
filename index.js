import express from "express";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

// ⚠️ REPLACE THIS with your actual Recharge Admin API key
const API_KEY = process.env.RECHARGE_TOKEN || "sk_2x2_f3e897b9f4560f00457cade62802a795c27e649b4bd453939c2d0712c94bebb9"; 

// Hardcoded product variant IDs
const CAP_ID = 56519341375870; // Cap gift
const BOTTLE_ID = 15659113480574; // Bottle gift

if (!API_KEY || API_KEY === "sk_test_1234567890abcdef") {
  console.error("⚠️ ERROR: Missing or placeholder RECHARGE_TOKEN environment variable!");
  process.exit(1);
}

// Helper: Check if this is the first subscription order
async function isFirstOrder(subscriptionId) {
  const response = await fetch(`https://api.rechargeapps.com/subscriptions/${subscriptionId}/orders`, {
    headers: { "X-Recharge-Access-Token": API_KEY },
  });
  const data = await response.json();
  return data.orders.length <= 1; // first order = only 1 order exists
}

app.post("/recharge-webhook", async (req, res) => {
  try {
    const order = req.body;
    const subscriptionId = order.subscription_id;
    const orderId = order.id;

    if (!subscriptionId || !orderId) {
      return res.status(200).send("Not a subscription order");
    }

    // First order? Keep gifts
    const firstOrder = await isFirstOrder(subscriptionId);
    if (firstOrder) {
      console.log(`Subscription ${subscriptionId} - first order, gifts stay`);
      return res.status(200).send("First order - gifts stay");
    }

    // Find gift items in this order
    const giftItems = order.line_items.filter(
      item => item.variant_id === CAP_ID || item.variant_id === BOTTLE_ID
    );

    if (giftItems.length === 0) {
      console.log(`Subscription ${subscriptionId} - no gifts to remove`);
      return res.status(200).send("No gifts to remove");
    }

    // Delete each gift line item
    for (const item of giftItems) {
      const deleteResponse = await fetch(`https://api.rechargeapps.com/order_line_items/${item.id}`, {
        method: "DELETE",
        headers: { "X-Recharge-Access-Token": API_KEY },
      });

      if (!deleteResponse.ok) {
        console.error(`Failed to delete line item ${item.id}`);
      } else {
        console.log(`Deleted line item ${item.id} from order ${orderId}`);
      }
    }

    res.status(200).send("Gifts removed from subscription order");
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).send("Error processing webhook");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook listening on port ${PORT}`));
