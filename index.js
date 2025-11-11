import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// --- CONFIG --- //
const API_KEY = "sk_2x2_1b3d003b0c25cff897dc8bc261cd12f9cc048a0a3244c782e9f466542ba629fc"; // Replace with your Recharge Admin API token
const CAP_ID = 56519341375870;            // Replace with your free gift CAP variant ID
const BOTTLE_ID = 15659113480574;         // Replace with your free gift BOTTLE variant ID

// In-memory store to track first orders
const firstOrderGiven = {};

// --- WEBHOOK ENDPOINT --- //
app.post("/webhook", async (req, res) => {
  try {
    console.log("Webhook payload received:", JSON.stringify(req.body, null, 2));

    let subscriptionId;
    let lineItems;

    if (req.body.subscription) {
      // subscription/created webhook
      subscriptionId = req.body.subscription.id;
      lineItems = [req.body.subscription]; // wrap as array for consistency
    } else if (req.body.order) {
      // order/created webhook
      subscriptionId = req.body.order.line_items[0]?.subscription_id;
      lineItems = req.body.order.line_items;
    } else {
      console.log("Not a subscription order. Ignoring.");
      return res.status(200).send("Not a subscription order");
    }

    // First order? Keep gifts
    if (!firstOrderGiven[subscriptionId]) {
      firstOrderGiven[subscriptionId] = true;
      console.log(`Subscription ${subscriptionId} - first order, gifts stay`);
      return res.status(200).send("First order - gifts stay");
    }

    // Remove free gift items from renewals
    const updatedLineItems = lineItems.filter(
      item => item.shopify_variant_id !== CAP_ID && item.shopify_variant_id !== BOTTLE_ID
    );

    if (updatedLineItems.length === lineItems.length) {
      console.log(`Subscription ${subscriptionId} - no gifts to remove`);
      return res.status(200).send("No gifts to remove");
    }

    // Update the subscription on Recharge
    await fetch(`https://api.rechargeapps.com/subscriptions/${subscriptionId}`, {
      method: "PUT",
      headers: {
        "X-Recharge-Access-Token": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ line_items: updatedLineItems }),
    });

    console.log(`Free gifts removed from subscription ${subscriptionId}`);
    res.status(200).send("Free gifts removed");
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).send("Error processing webhook");
  }
});

// --- START SERVER --- //
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook listening on port ${PORT}`));
