// index.js
import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const RECHARGE_API_KEY = "fake_key_here"; // Replace with your actual Recharge API key
const FREE_GIFT_SKU = "Styrkr_Cycling_Cap_x1";

app.post("/webhook", async (req, res) => {
  try {
    const { subscription, order } = req.body;

    console.log("Webhook received:", JSON.stringify(req.body, null, 2));

    if (!subscription || !subscription.id) {
      return res.status(400).send("No subscription ID found");
    }

    // If it's the first order, do nothing
    if (!subscription.has_queued_charges || subscription.has_queued_charges === 0) {
      console.log(`Subscription ${subscription.id} - first order, gifts stay`);
      return res.status(200).send("First order, gift stays");
    }

    // Get upcoming draft orders for this subscription
    const draftsResponse = await fetch(`https://api.rechargeapps.com/orders?subscription_id=${subscription.id}&status=draft`, {
      method: "GET",
      headers: {
        "X-Recharge-Access-Token": RECHARGE_API_KEY,
        "Content-Type": "application/json",
      },
    });
    const draftsData = await draftsResponse.json();

    if (!draftsData || !draftsData.orders || draftsData.orders.length === 0) {
      console.log(`Subscription ${subscription.id} - no draft orders found`);
      return res.status(200).send("No drafts to update");
    }

    // Loop through draft orders and remove free gift
    for (let draft of draftsData.orders) {
      const freeGiftLineItems = draft.line_items.filter(
        (item) => item.sku === FREE_GIFT_SKU
      );

      if (freeGiftLineItems.length === 0) {
        console.log(`Subscription ${subscription.id} - no free gifts in draft ${draft.id}`);
        continue;
      }

      // Remove each free gift line item
      for (let item of freeGiftLineItems) {
        await fetch(`https://api.rechargeapps.com/orders/${draft.id}/line_items/${item.id}`, {
          method: "DELETE",
          headers: {
            "X-Recharge-Access-Token": RECHARGE_API_KEY,
            "Content-Type": "application/json",
          },
        });
        console.log(`Removed free gift SKU ${item.sku} from draft order ${draft.id}`);
      }
    }

    res.status(200).send("Processed");
  } catch (err) {
    console.error("Error processing webhook:", err);
    res.status(500).send("Error");
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
