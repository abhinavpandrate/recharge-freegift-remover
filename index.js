import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const RECHARGE_API_KEY = "sk_2x2_1b3d003b0c25cff897dc8bc261cd12f9cc048a0a3244c782e9f466542ba629fc"; // <-- replace with real key
const FREE_GIFT_VARIANT_ID = "56519341375870"; // BYOB Cycling Cap variant

// Helper to get upcoming orders for a subscription
async function getUpcomingOrders(subscriptionId) {
  const res = await fetch(
    `https://api.rechargeapps.com/subscriptions/${subscriptionId}/upcoming_charges`,
    {
      method: "GET",
      headers: {
        "X-Recharge-Access-Token": RECHARGE_API_KEY,
        "Content-Type": "application/json",
      },
    }
  );
  if (!res.ok) {
    console.error("Error fetching upcoming charges:", res.status, await res.text());
    return [];
  }
  const data = await res.json();
  return data.upcoming_charges || [];
}

// Helper to remove free gift from a draft/queued order
async function removeGiftFromOrder(orderId) {
  try {
    const body = {
      line_items: [
        {
          remove_variant_ids: [FREE_GIFT_VARIANT_ID],
        },
      ],
    };
    const res = await fetch(`https://api.rechargeapps.com/orders/${orderId}`, {
      method: "PUT",
      headers: {
        "X-Recharge-Access-Token": RECHARGE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.errors) {
      console.error("Failed to remove gift:", data.errors);
    } else {
      console.log(`Gift removed from order ${orderId}:`, data);
    }
  } catch (err) {
    console.error("Error removing gift:", err);
  }
}

// Main webhook handler
app.post("/webhook", async (req, res) => {
  const payload = req.body;
  console.log("Webhook payload received:", JSON.stringify(payload, null, 2));

  const subscription = payload.subscription;
  if (!subscription || !subscription.id) {
    console.log("No subscription ID found in payload.");
    return res.status(400).send("No subscription found");
  }

  const subscriptionId = subscription.id;

  // For first-time subscriptions, gift stays
  if (subscription.has_queued_charges === 0) {
    console.log(`First order for subscription ${subscriptionId}. Gift can stay.`);
    return res.send("First order, gift kept");
  }

  // Get upcoming orders
  const upcomingOrders = await getUpcomingOrders(subscriptionId);
  if (!upcomingOrders || upcomingOrders.length === 0) {
    console.log(`No upcoming orders found for subscription ${subscriptionId}`);
    return res.send("No upcoming orders");
  }

  for (const order of upcomingOrders) {
    if (order.status === "DRAFT" || order.status === "QUEUED") {
      // Detect gift line item inside bundles
      const giftLine = order.line_items?.find((item) => {
        if (!item) return false;
        if (item.shopify_variant_id == FREE_GIFT_VARIANT_ID) return true;
        // Check bundle properties
        const isBundleGift = item.properties?.some(
          (p) => p.name === "_rc_bundle_variant" && p.value == FREE_GIFT_VARIANT_ID
        );
        return isBundleGift;
      });

      if (giftLine) {
        console.log(`Removing gift from order ${order.id}`);
        await removeGiftFromOrder(order.id);
      } else {
        console.log(`No gift found in order ${order.id}`);
      }
    }
  }

  res.send("Webhook processed");
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
