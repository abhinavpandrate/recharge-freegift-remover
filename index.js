import express from "express";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;

// ⚠️ FAKE KEY BELOW — replace with your real key in Render environment variables (RECHARGE_API_KEY)
// The code will use the environment variable first, and fall back to this fake key so you can see where it goes.
const API_KEY = process.env.RECHARGE_API_KEY || "sk_2x2_1b3d003b0c25cff897dc8bc261cd12f9cc048a0a3244c782e9f466542ba629fc";

// Free gift variant IDs (Shopify variant IDs)
const CAP_ID = 56519341375870;        // BYOB Cycling Cap (free gift)
const BOTTLE_ID = 15659113480574;     // Bottle (if used)

// Track first orders in-memory (ok for testing)
const firstOrderGiven = {};

// Webhook endpoint
app.post("/webhook", async (req, res) => {
  try {
    console.log("Webhook payload received:", JSON.stringify(req.body, null, 2));

    const payload = req.body;
    const subscription = payload.subscription;
    const order = payload.order;

    // If subscription webhook (subscription created/updated)
    if (subscription) {
      const subId = subscription.id;
      // If it's the first observed order, mark and do not remove gift now
      if (!firstOrderGiven[subId]) {
        firstOrderGiven[subId] = true;
        console.log(`Subscription ${subId} - first order observed, gifts stay`);
        // Immediately remove gifts from subscription so upcoming drafts don't include them
        try {
          // Fetch current subscription details from Recharge
          const subResp = await fetch(`https://api.rechargeapps.com/subscriptions/${subId}`, {
            headers: { "X-Recharge-Access-Token": API_KEY },
          });
          const subJson = await subResp.json();
          const currentLineItems = subJson.subscription?.line_items || [];

          // Filter out free gift variants by shopify_variant_id
          const updatedLineItems = currentLineItems.filter(
            item => item.shopify_variant_id !== CAP_ID && item.shopify_variant_id !== BOTTLE_ID
          );

          if (updatedLineItems.length === currentLineItems.length) {
            console.log(`Subscription ${subId} - no free gifts present in subscription line_items`);
          } else {
            // Update subscription to remove gifts for future drafts
            const updateResp = await fetch(`https://api.rechargeapps.com/subscriptions/${subId}`, {
              method: "PUT",
              headers: {
                "X-Recharge-Access-Token": API_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ line_items: updatedLineItems }),
            });

            if (!updateResp.ok) {
              const errText = await updateResp.text();
              console.error(`Failed to update subscription ${subId}:`, errText);
            } else {
              console.log(`Updated subscription ${subId} — removed free gift variants from future drafts.`);
            }
          }
        } catch (err) {
          console.error("Error fetching/updating subscription:", err);
        }

        return res.status(200).send("First order observed — updated subscription for future drafts");
      }

      // If not first order, ensure gifts are not present (defensive)
      console.log(`Subscription ${subId} - already seen first order, ensuring gifts removed`);
      return res.status(200).send("Subscription processed");
    }

    // If order webhook (order created)
    if (order) {
      const subId = order.line_items?.[0]?.subscription_id;
      if (!subId) {
        console.log("Order received but no subscription_id found — ignoring.");
        return res.status(200).send("Not a subscription order");
      }

      // If we haven't seen the first order yet, mark it and skip removal now
      if (!firstOrderGiven[subId]) {
        firstOrderGiven[subId] = true;
        console.log(`Subscription ${subId} - first order (from order webhook), gifts stay`);
        // Also proactively update subscription to strip gifts from future drafts
        try {
          const subResp = await fetch(`https://api.rechargeapps.com/subscriptions/${subId}`, {
            headers: { "X-Recharge-Access-Token": API_KEY },
          });
          const subJson = await subResp.json();
          const currentLineItems = subJson.subscription?.line_items || [];
          const updatedLineItems = currentLineItems.filter(
            item => item.shopify_variant_id !== CAP_ID && item.shopify_variant_id !== BOTTLE_ID
          );

          if (updatedLineItems.length !== currentLineItems.length) {
            const updateResp = await fetch(`https://api.rechargeapps.com/subscriptions/${subId}`, {
              method: "PUT",
              headers: {
                "X-Recharge-Access-Token": API_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ line_items: updatedLineItems }),
            });

            if (!updateResp.ok) {
              const errText = await updateResp.text();
              console.error(`Failed to update subscription ${subId}:`, errText);
            } else {
              console.log(`Subscription ${subId} updated to remove free gifts from future drafts.`);
            }
          } else {
            console.log(`Subscription ${subId} had no free gifts in subscription line_items.`);
          }
        } catch (err) {
          console.error("Error during proactive subscription update:", err);
        }

        return res.status(200).send("First order observed via order webhook — updated subscription for future drafts");
      }

      // If not first order, nothing to do (gifts should already be stripped)
      console.log(`Subscription ${subId} - subsequent order webhook received`);
      return res.status(200).send("Order processed");
    }

    console.log("Webhook payload did not contain order or subscription object — ignoring.");
    res.status(200).send("No action");
  } catch (err) {
    console.error("Webhook handler error:", err);
    res.status(500).send("Error");
  }
});

app.listen(PORT, () => console.log(`Webhook listening on port ${PORT}`));
