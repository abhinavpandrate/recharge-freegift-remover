import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const RECHARGE_API_KEY = "sk_2x2_1b3d003b0c25cff897dc8bc261cd12f9cc048a0a3244c782e9f466542ba629fc"; // replace with your real key

// Function to fetch draft orders with retry
const fetchDrafts = async (subscriptionId, retries = 3, delay = 3000) => {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(`https://api.rechargeapps.com/orders?subscription_id=${subscriptionId}&status=draft`, {
      method: "GET",
      headers: {
        "X-Recharge-Access-Token": RECHARGE_API_KEY,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();

    if (data.orders && data.orders.length > 0) {
      console.log(`Found ${data.orders.length} draft order(s)`);
      return data.orders;
    }

    console.log(`Retry ${i + 1} - no drafts yet, waiting ${delay / 1000}s`);
    await new Promise(r => setTimeout(r, delay));
  }
  console.log("No draft orders found after retries");
  return [];
};

// Function to remove the BYOB cap from a draft
const removeGiftFromDraft = async (draftOrderId, capVariantId) => {
  const res = await fetch(`https://api.rechargeapps.com/orders/${draftOrderId}`, {
    method: "PUT",
    headers: {
      "X-Recharge-Access-Token": RECHARGE_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      order: {
        line_items: [
          {
            shopify_variant_id: capVariantId,
            quantity: 0
          }
        ]
      }
    })
  });
  const data = await res.json();
  console.log(`Draft ${draftOrderId} updated`, data);
};

app.post("/webhook", async (req, res) => {
  try {
    const subscriptionId = req.body.subscription?.id;
    if (!subscriptionId) {
      console.log("No subscription ID found in webhook");
      return res.status(400).send("No subscription ID");
    }

    const capVariantId = 56519341375870; // BYOB cap variant
    const drafts = await fetchDrafts(subscriptionId);

    if (drafts.length === 0) {
      return res.status(200).send("No draft orders found");
    }

    for (const draft of drafts) {
      await removeGiftFromDraft(draft.id, capVariantId);
    }

    res.status(200).send("Processed");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing webhook");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
