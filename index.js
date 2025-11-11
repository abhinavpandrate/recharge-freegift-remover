// index.js
import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ---- CONFIG ----
const PORT = process.env.PORT || 3000;
const RECHARGE_API_KEY = "sk_2x2_1b3d003b0c25cff897dc8bc261cd12f9cc048a0a3244c782e9f466542ba629fc"; // replace with your Recharge API key
const FREE_GIFT_SKU = "Styrkr_Cycling_Cap_x1"; // SKU of the free gift

// ---- HELPER ----
async function removeFreeGift(orderId, lineItems) {
  // Filter out the free gift
  const updatedLineItems = lineItems.filter(item => item.sku !== FREE_GIFT_SKU);

  if (updatedLineItems.length === lineItems.length) {
    console.log(`No free gift found on order ${orderId}`);
    return;
  }

  try {
    const res = await fetch(`https://api.rechargeapps.com/orders/${orderId}`, {
      method: "PUT",
      headers: {
        "X-Recharge-Access-Token": RECHARGE_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ line_items: updatedLineItems })
    });

    const data = await res.json();
    if (data.errors) {
      console.error(`Failed to remove gift from order ${orderId}:`, data.errors);
    } else {
      console.log(`Free gift removed from order ${orderId}`);
    }
  } catch (err) {
    console.error(`Error updating order ${orderId}:`, err);
  }
}

// ---- WEBHOOK LISTENER ----
app.post("/webhook", async (req, res) => {
  const payload = req.body;
  const order = payload.order;

  if (!order || !order.line_items) {
    console.log("No order or line items found in payload.");
    return res.status(200).send("No line items to process.");
  }

  const subscriptionId = order.line_items.find(item => item.subscription_id)?.subscription_id;

  if (!subscriptionId) {
    console.log("No subscription ID found in order payload. Skipping gift removal.");
    return res.status(200).send("No subscription found.");
  }

  // Check if this is the first order for this subscription
  // Assuming you have a way to track first orders, otherwise remove this logic
  const isFirstOrder = payload.is_first_order || false;

  if (isFirstOrder) {
    console.log(`First order for subscription ${subscriptionId}. Gift can stay.`);
    return res.status(200).send("First order, gift kept.");
  }

  // Remove the free gift from subsequent orders
  await removeFreeGift(order.id, order.line_items);

  res.status(200).send("Webhook processed.");
});

// ---- START SERVER ----
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
