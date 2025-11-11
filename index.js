import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// ===== CONFIG =====
const API_KEY = "sk_2x2_1b3d003b0c25cff897dc8bc261cd12f9cc048a0a3244c782e9f466542ba629fc"; // <-- replace this
const CAP_ID = 56519341375870;             // Cycling Cap variant ID
const BOTTLE_ID = 15659113480574;          // Bottle variant ID

// Keep track of which subscriptions got their first gift
const firstOrderGiven = {};

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    console.log("Webhook payload received:", JSON.stringify(req.body, null, 2));

    const subscription = req.body.subscription;
    const order = req.body.order;

    // Handle subscription/renewed events
    if (subscription) {
      const subId = subscription.id;

      if (!firstOrderGiven[subId]) {
        firstOrderGiven[subId] = true;
        console.log(`Subscription ${subId} - first order, gifts stay`);

        // Remove gifts from next scheduled charge if it exists
        if (subscription.has_queued_charges) {
          console.log(`Removing free gifts from next scheduled order for subscription ${subId}...`);

          // Fetch subscription details from Recharge to get line items for next charge
          const response = await fetch(`https://api.rechargeapps.com/subscriptions/${subId}`, {
            headers: {
              "X-Recharge-Access-Token": API_KEY,
              "Content-Type": "application/json",
            },
          });

          const data = await response.json();
          const lineItems = data.subscription.line_items || [];

          // Filter out the free gift items
          const updatedLineItems = lineItems.filter(
            item => item.shopify_variant_id !== CAP_ID && item.shopify_variant_id !== BOTTLE_ID
          );

          // Update the subscription
          await fetch(`https://api.rechargeapps.com/subscriptions/${subId}`, {
            method: "PUT",
            headers: {
              "X-Recharge-Access-Token": API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ line_items: updatedLineItems }),
          });

          console.log(`Free gifts removed from subscription ${subId}`);
        }

        return res.status(200).send("First order - gifts stay, next order updated");
      }
    }

    // Handle order events (redundant, but keeps compatibility)
    if (order) {
      const subId = order.subscription_id;
      if (!subId) return res.status(200).send("Not a subscription order");

      // Remove free gifts from this order if it somehow exists
      const updatedLineItems = order.line_items.filter(
        item => item.shopify_variant_id !== CAP_ID && item.shopify_variant_id !== BOTTLE_ID
      );

      await fetch(`https://api.rechargeapps.com/subscriptions/${subId}`, {
        method: "PUT",
        headers: {
          "X-Recharge-Access-Token": API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ line_items: updatedLineItems }),
      });

      console.log(`Free gifts removed from subscription ${subId}`);
      return res.status(200).send("Free gifts removed from subscription");
    }

    res.status(200).send("No action required");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error processing webhook");
  }
});

// ===== START SERVER =====
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Webhook listening on port ${PORT}`));
