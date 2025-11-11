import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// Replace with your Recharge API key
const RECHARGE_API_KEY = "sk_2x2_1b3d003b0c25cff897dc8bc261cd12f9cc048a0a3244c782e9f466542ba629fc"; 

app.use(bodyParser.json());

app.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.line_items || payload.line_items.length === 0) {
      console.log("No order or line items found in payload.");
      return res.status(400).send({ error: "No line items found" });
    }

    const orderId = payload.order_id;
    const subscriptionIds = [...new Set(payload.line_items.map(li => li.subscription_id).filter(Boolean))];

    console.log(`Webhook received for order ${orderId}`);
    console.log("Subscriptions in order:", subscriptionIds);

    // Loop through all line items and remove the BYOB Cycling Cap
    for (const li of payload.line_items) {
      if (li.sku === "Styrkr_Cycling_Cap_x1") {
        console.log(`Found BYOB gift in order ${orderId}, attempting to remove...`);

        if (!li.subscription_id) {
          console.log("No subscription_id for this item, cannot remove from Recharge. Skipping.");
          continue;
        }

        const subscriptionId = li.subscription_id;

        // Remove the line item from subscription's next order
        const url = `https://api.rechargeapps.com/subscriptions/${subscriptionId}/upcoming_charges`;

        try {
          // Note: Recharge API cannot modify draft orders via API for some setups,
          // so this will attempt to delete the product when the order is queued
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

            // Assuming the first upcoming charge (simplified)
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
                    quantity: item.quantity
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
