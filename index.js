import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

// Your Recharge API key
const RECHARGE_API_KEY = "sk_2x2_1b3d003b0c25cff897dc8bc261cd12f9cc048a0a3244c782e9f466542ba629fc";

// Variant ID of the gift cap
const GIFT_VARIANT_ID = 56519341375870;

app.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;

    if (!payload.order || !payload.order.line_items) {
      console.log("No order or line items found in payload.");
      return res.status(200).send("No action required");
    }

    const subscriptionId = payload.order.line_items[0]?.subscription_id;
    if (!subscriptionId) {
      console.log("No subscription ID found in payload.");
      return res.status(200).send("No subscription found");
    }

    // Check if first order: subscription's first charge is the order number
    // Adjust this logic if you have a more reliable first-order indicator
    const isFirstOrder = payload.order?.order_number === payload.order?.customer_id;

    if (isFirstOrder) {
      console.log("First order — gift stays.");
      return res.status(200).send("Gift kept for first order");
    }

    // Remove gift from non-first order
    const giftItem = payload.order.line_items.find(
      (item) => item.shopify_variant_id === GIFT_VARIANT_ID
    );

    if (!giftItem) {
      console.log("No gift found in this order.");
      return res.status(200).send("No gift to remove");
    }

    const orderId = payload.order.id;

    const removeRes = await fetch(`https://api.rechargeapps.com/orders/${orderId}`, {
      method: "PUT",
      headers: {
        "X-Recharge-Access-Token": RECHARGE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        line_items: payload.order.line_items.filter(
          (item) => item.shopify_variant_id !== GIFT_VARIANT_ID
        ),
      }),
    });

    const data = await removeRes.json();

    if (data.errors) {
      console.error("Failed to remove gift:", data.errors);
      return res.status(500).send("Failed to remove gift");
    }

    console.log("Gift successfully removed from order", orderId, data);
    res.status(200).send("Gift removed successfully");
  } catch (err) {
    console.error("Error processing webhook:", err);
    res.status(500).send("Internal server error");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
