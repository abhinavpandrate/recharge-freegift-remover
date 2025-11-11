import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// === Recharge API key ===
const RECHARGE_API_KEY = "sk_2x2_1b3d003b0c25cff897dc8bc261cd12f9cc048a0a3244c782e9f466542ba629fc";

// The variant ID or SKU of your free gift
const FREE_GIFT_SKU = "Styrkr_Cycling_Cap_x1";
const FREE_GIFT_VARIANT_ID = 56519341375870;

// Helper function to update an upcoming order
async function removeGiftFromOrder(orderId, lineItemsToKeep) {
  const url = `https://api.rechargeapps.com/orders/${orderId}`;
  const payload = { line_items: lineItemsToKeep };

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Recharge-Access-Token": RECHARGE_API_KEY
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  return data;
}

// Webhook endpoint
app.post("/webhook", async (req, res) => {
  const payload = req.body;

  console.log("Webhook payload received:", JSON.stringify(payload, null, 2));

  const order = payload.order;
  if (!order || !order.line_items) {
    console.log("No order or line items found.");
    return res.status(200).send("No order data");
  }

  // Check if the free gift exists
  const giftPresent = order.line_items.some(
    (item) =>
      item.sku === FREE_GIFT_SKU || item.shopify_variant_id === FREE_GIFT_VARIANT_ID
  );

  if (!giftPresent) {
    console.log(`Subscription ${order.subscription_id || order.id} - no free gift present.`);
    return res.status(200).send("No gift to remove");
  }

  // Prepare line items to keep
  const lineItemsToKeep = order.line_items.filter(
    (item) =>
      item.sku !== FREE_GIFT_SKU && item.shopify_variant_id !== FREE_GIFT_VARIANT_ID
  ).map((item) => ({
    shopify_variant_id: item.shopify_variant_id,
    quantity: item.quantity
  }));

  try {
    const updatedOrder = await removeGiftFromOrder(order.id, lineItemsToKeep);
    console.log(`Free gift removed from order ${order.id}:`, updatedOrder);
    res.status(200).send("Gift removed successfully");
  } catch (error) {
    console.error("Error updating order:", error);
    res.status(500).send("Failed to remove gift");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
