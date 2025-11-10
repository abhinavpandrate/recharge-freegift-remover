import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

const API_KEY = "sk_2x2_1b3d003b0c25cff897dc8bc261cd12f9cc048a0a3244c782e9f466542ba629fc"; // Replace with your admin token
const CAP_ID = 56519341375870; // Replace with your variant IDs
const BOTTLE_ID = 15659113480574;

// Helper: Check if subscription has previous orders
async function isFirstOrder(subscriptionId) {
  const response = await fetch(`https://api.rechargeapps.com/subscriptions/${subscriptionId}/orders`, {
    headers: { "X-Recharge-Access-Token": API_KEY },
  });
  const data = await response.json();
  return data.orders.length <= 1; // First order = only 1 order exists
}

app.post("/recharge-webhook", async (req, res) => {
  try {
    const order = req.body;
    const subscriptionId = order.subscription_id;

    if (!subscriptionId) {
      return res.status(200).send("Not a subscription order");
    }

    // Check if this is the first order
    const firstOrder = await isFirstOrder(subscriptionId);
    if (firstOrder) {
      console.log(`Subscription ${subscriptionId} - first order, gift stays`);
      return res.status(200).send("First order - gift stays");
    }

    // Remove free gifts if present
    const updatedLineItems = order.line_items
      .filter(item => item.variant_id !== CAP_ID && item.variant_id !== BOTTLE_ID)
      .map(item => ({ id: item.id, quantity: item.quantity }));

    if (updatedLineItems.length === order.line_items.length) {
      console.log(`Subscription ${subscriptionId} - no free gifts to remove`);
      return res.status(200).send("No free gifts to remove");
    }

    const updateResponse = await fetch(`https://api.rechargeapps.com/subscriptions/${subscriptionId}`, {
      method: "PUT",
      headers: {
        "X-Recharge-Access-Token": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ line_items: updatedLineItems }),
    });

    const result = await updateResponse.json();
    console.log("Updated subscription:", result);

    res.status(200).send("Free gift removed from subscription");
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).send("Error processing webhook");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook listening on port ${PORT}`));
