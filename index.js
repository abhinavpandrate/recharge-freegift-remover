import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// Get Recharge API key from environment variable
const RECHARGE_API_KEY = process.env.RECHARGE_API_KEY;

if (!RECHARGE_API_KEY) {
  console.error("Error: RECHARGE_API_KEY not set in environment variables.");
  process.exit(1); // Stop the server if key is missing
}

app.use(bodyParser.json());

app.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.line_items || payload.line_items.length === 0) {
      console.log("No order or line items found in payload.");
      return res.status(400).send({ error: "No line items found" });
    }

    const orderId = payload.order_id;
    const subscriptionIds = [
      ...new Set(payload.line_items.map(li => li.subscription_id).filter(Boolean)),
    ];

    console.log(`Webhook received for order ${orderId}`);
    console.log("Subscriptions in order:", subscriptionIds);

    for (const li of payload.line_items) {
      if (li.sku === "Styrkr_Cycling_Cap_x1") {
        console.log(`Found BYOB gift in order ${orderId}, attempting to remove...`);

        if (!li.subscription_id) {
          console.log("No subscription_id for this item, cannot remove from Recharge. Skipping.");
          continue;
        }

        const subscriptionId = li.subscription_id;

        try {
          const url = `https://api.rechargeapps.com/subscriptions/${subscriptionId}/upcoming_charges`;

          const response = await fetch(url, {
            method: "GET",
            headers: {
              "X-Recharge-Access-Token": RECHARGE_API_KEY,
              "Content-Type": "application/json",
            },
          });

          const data = await response.json();

          if (data && data.upcoming_charges && data.upcoming_charges.length > 0) {
            console.log(`Upcoming charges found for subscription ${subscriptionId}, removing gift...`);

            const upcomingChargeId = data.upcoming_charges[0].id;

            const removeResp = await fetch(`https://api.rechargeapps.com/orders/${upcomingChargeId}`, {
              method: "PUT",
              headers: {
                "X-Recharge-Access-Token": RECHARGE_API_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                line_items: payload.line_items
                  .filter(item => item.sku !== "Styrkr_Cycling_Cap_x1")
                  .map(item => ({
                    shopify_product_id: item.shopify_product_id,
                    shopify_variant_id: item.shopify_variant_id,
                    quantity: item.quantity,
                  })),
              }),
            });

            const removeData = await removeResp.json();
            console.log(`Gift removed from upcoming order:`, removeData);
          } else {
            console.log(`No upcoming charges found for subscription ${subscriptionId}. Gift cannot be removed until order is processed.`);
          }
        } catch (err) {
          console.error(`Failed to remove gift for subscription ${subscriptionId}:`, err);
        }
      }
    }

    res.status(200).send({ status: "Webhook processed" });
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).send({ error: "Internal Server Error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
