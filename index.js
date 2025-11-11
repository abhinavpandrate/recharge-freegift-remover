import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// Replace with your actual IDs
const API_KEY = "YOUR_RANDOM_API_KEY"; // <-- replace with your Recharge admin token
const CAP_ID = 56519341375870;        // Shopify variant ID for the cap
const BOTTLE_ID = 15659113480574;     // Shopify variant ID for the bottle

// In-memory store to track first orders
const firstOrderGiven = {};

app.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;
    const order = payload.order || payload.subscription;

    if (!order) {
      console.log("Webhook payload received but no order/subscription object found. Ignoring.");
      return res.status(200).send("No order or subscription found");
    }

    const subscriptionId = order.subscription_id || order.id;
    if (!subscriptionId) {
      console.log("No subscription ID found. Ignoring.");
      return res.status(200).send("Not a subscription order");
    }

    console.log("Webhook payload received:", JSON.stringify(payload, null, 2));

    // If first order, mark as given and do NOT remove gifts
    if (!firstOrderGiven[subscriptionId]) {
      firstOrderGiven[subscriptionId] = true;
      console.log(`Subscription ${subscriptionId} - first order, gifts stay`);
      return res.status(200).send("First order - gifts stay");
    }

    // Log which items are present before filtering
    console.log("Line items before removal:");
    order.line_items.forEach(item => {
      console.log(`- ${item.product_title} | variant_id: ${item.shopify_variant_id}`);
    });

    // Remove only free gifts
    const removedItems = order.line_items.filter(
      item => item.shopify_variant_id === CAP_ID || item.shopify_variant_id === BOTTLE_ID
    );

    const updatedLineItems = order.line_items.filter(
      item => item.shopify_variant_id !== CAP_ID && item.shopify_variant_id !== BOTTLE_ID
    );

    if (removedItems.length === 0) {
      console.log("No free gifts found to remove.");
    } else {
      console.log("Removing the following free gifts:");
      removedItems.forEach(item => {
        console.log(`- ${item.product_title} | variant_id: ${item.shopify_variant_id}`);
      });
    }

    // Update subscription in Recharge
    const response = await fetch(`https://api.rechargeapps.com/subscriptions/${subscriptionId}`, {
      method: "PUT",
      headers: {
        "X-Recharge-Access-Token": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ subscription: { line_items: updatedLineItems } }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Error updating subscription:", text);
      return res.status(500).send("Failed to remove free gift");
    }

    console.log(`Free gifts removed from subscription ${subscriptionId}`);
    res.status(200).send("Free gift removed from subscription");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error processing webhook");
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Webhook listening on port ${PORT}`));
