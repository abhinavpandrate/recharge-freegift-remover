import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// Use environment variables for API keys
const RECHARGE_API_KEY = process.env.RECHARGE_API_KEY; 
const SHOPIFY_STORE = process.env.SHOPIFY_STORE; 
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

app.use(bodyParser.json());

app.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.line_items || payload.line_items.length === 0) {
      console.log("No order or line items found in payload.");
      return res.status(400).send({ error: "No line items found" });
    }

    const orderId = payload.order_id || payload.id;
    console.log(`Webhook received for order ${orderId}`);

    // Loop through line items and remove the gift
    for (const li of payload.line_items) {
      // Check if this is the gift variant
      if (li.variant_id === parseInt(process.env.GIFT_VARIANT_ID)) {
        console.log(`Found gift variant in order ${orderId}, attempting to remove...`);

        if (!li.subscription_id) {
          console.log("No subscription_id for this item, cannot remove from Recharge. Skipping.");
          continue;
        }

        const subscriptionId = li.subscription_id;

        // Call Recharge API to fetch upcoming charges
        const upcomingUrl = `https://api.rechargeapps.com/subscriptions/${subscriptionId}/upcoming_charges`;

        try {
          const response = await fetch(upcomingUrl, {
            method: "GET",
            headers: {
              "X-Recharge-Access-Token": RECHARGE_API_KEY,
              "Content-Type": "application/json",
            },
          });

          const data = await response.json();
          if (data && data.upcoming_charges && data.upcoming_charges.length > 0) {
            const upcomingChargeId = data.upcoming_charges[0].id;

            // Remove gift from upcoming order
            const removeResp = await fetch(`https://api.rechargeapps.com/orders/${upcomingChargeId}`, {
              method: "PUT",
              headers: {
                "X-Recharge-Access-Token": RECHARGE_API_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                line_items: payload.line_items
                  .filter(item => item.variant_id !== parseInt(process.env.GIFT_VARIANT_ID))
                  .map(item => ({
                    shopify_product_id: item.shopify_product_id,
                    shopify_variant_id: item.variant_id,
                    quantity: item.quantity
                  })),
              }),
            });

            const removeData = await removeResp.json();
            console.log(`Gift removed from upcoming order:`, removeData);
          } else {
            console.log(`No upcoming charges found for subscription ${subscriptionId}. Gift cannot be removed yet.`);
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
