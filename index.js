import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

const API_KEY = "sk_2x2_1b3d003b0c25cff897dc8bc261cd12f9cc048a0a3244c782e9f466542ba629fc"; // Replace with your admin token
const CAP_ID = "15659115839870";
const BOTTLE_ID = "15659113480574";

// Simple in-memory store to track first orders
const firstOrderGiven = {};

app.post("/recharge-webhook", async (req, res) => {
  try {
    const order = req.body;

    const subscriptionId = order.subscription_id;
    if (!subscriptionId) {
      return res.status(200).send("Not a subscription order");
    }

    // If first order, mark as done
    if (!firstOrderGiven[subscriptionId]) {
      firstOrderGiven[subscriptionId] = true;
      return res.status(200).send("First order - gift stays");
    }

    // Remove free gift if present
    const updatedLineItems = order.line_items.filter(
      item => item.variant_id !== CAP_ID && item.variant_id !== BOTTLE_ID
    );

    await fetch(`https://api.rechargeapps.com/subscriptions/${subscriptionId}`, {
      method: "PUT",
      headers: {
        "X-Recharge-Access-Token": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ line_items: updatedLineItems }),
    });

    res.status(200).send("Free gift removed from subscription");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error processing webhook");
  }
});

app.listen(3000, () => console.log("Webhook listening on port 3000"));