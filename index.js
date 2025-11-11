// server.js
import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// ---- CONFIG ----
const RECHARGE_API_KEY = "sk_2x2_1b3d003b0c25cff897dc8bc261cd12f9cc048a0a3244c782e9f466542ba629fc"; // replace with your real Recharge API key
const GIFT_VARIANT_IDS = ["56519341375870"]; // BYOB Cycling Cap (add more variant IDs if needed)
const MAX_RETRIES = 3;

// ---- HELPER FUNCTION: Remove gift from a subscription ----
async function removeGift(subscriptionId, variantId, retries = 0) {
  try {
    const url = `https://api.rechargeapps.com/subscriptions/${subscriptionId}/line_items`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "X-Recharge-Access-Token": RECHARGE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ shopify_variant_id: variantId }),
    });

    const result = await response.json();

    console.log(
      `[${new Date().toISOString()}] Removed variant ${variantId} from subscription ${subscriptionId}`,
      result
    );

    return result;
  } catch (err) {
    if (retries < MAX_RETRIES) {
      console.log(
        `[${new Date().toISOString()}] Retry ${retries + 1} for variant ${variantId} on subscription ${subscriptionId}`
      );
      await new Promise((r) => setTimeout(r, 1000 * (retries + 1))); // exponential backoff
      return removeGift(subscriptionId, variantId, retries + 1);
    } else {
      console.error(
        `[${new Date().toISOString()}] Failed to remove variant ${variantId} from subscription ${subscriptionId}`,
        err
      );
    }
  }
}

// ---- WEBHOOK ENDPOINT ----
app.post("/webhook", async (req, res) => {
  const { subscription, order } = req.body;

  if (!subscription || !order) {
    return res.status(400).send("Invalid payload");
  }

  const subscriptionId = subscription.id;

  // Determine if this is the first order (gift stays only on first order)
  const firstOrder =
    subscription.has_queued_charges === 1 &&
    subscription.next_charge_scheduled_at === null;

  if (!firstOrder) {
    console.log(
      `[${new Date().toISOString()}] Subsequent order detected. Removing gifts for subscription ${subscriptionId}`
    );
    for (const variantId of GIFT_VARIANT_IDS) {
      await removeGift(subscriptionId, variantId);
    }
  } else {
    console.log(
      `[${new Date().toISOString()}] First order detected. Gifts will remain for subscription ${subscriptionId}`
    );
  }

  res.status(200).send("Webhook processed");
});

// ---- START SERVER ----
app.listen(PORT, () => {
  console.log(`Recharge gift removal webhook running on port ${PORT}`);
});
