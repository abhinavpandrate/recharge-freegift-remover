import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_API_TOKEN = process.env.SHOPIFY_API_TOKEN;
const RECHARGE_API_KEY = process.env.RECHARGE_API_KEY;
const TARGET_VARIANT_ID = process.env.TARGET_VARIANT_ID;

app.use(bodyParser.json());

app.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;
    console.log("Incoming payload:", JSON.stringify(payload, null, 2));

    if (!payload || !payload.line_items) {
      return res.status(400).send({ error: "No line items found" });
    }

    const orderId = payload.order_id || payload.id;
    const giftItem = payload.line_items.find(li => String(li.variant_id) === String(TARGET_VARIANT_ID));

    if (!giftItem) {
      console.log("No free gift found in order.");
      return res.status(200).send({ message: "No gift to remove" });
    }

    console.log(`🎁 Gift found in order ${orderId}, removing from Shopify...`);

    // Step 1 — Get the full order details from Shopify
    const orderResponse = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-10/orders/${orderId}.json`, {
      headers: { "X-Shopify-Access-Token": SHOPIFY_API_TOKEN },
    });
    const orderData = await orderResponse.json();

    // Step 2 — Build updated line items list (excluding the gift)
    const updatedItems = orderData.order.line_items
      .filter(item => String(item.variant_id) !== String(TARGET_VARIANT_ID))
      .map(item => ({
        id: item.id,
        quantity: item.quantity,
      }));

    // Step 3 — Update order via Shopify (to remove gift)
    const updateResponse = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-10/orders/${orderId}.json`, {
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_API_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order: { id: orderId, line_items: updatedItems } }),
    });

    const result = await updateResponse.json();
    console.log("✅ Gift removed successfully:", result);
    res.status(200).send({ success: true });
  } catch (err) {
    console.error("Error handling webhook:", err);
    res.status(500).send({ error: "Server error" });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
