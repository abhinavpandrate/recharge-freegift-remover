import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// Gift product title or variant keyword
const GIFT_KEYWORD = "Cycling Cap";

app.get("/", (req, res) => {
  res.send("Shopify Free Gift Remover is live.");
});

app.post("/webhook", async (req, res) => {
  try {
    const order = req.body;
    if (!order || !order.line_items) {
      console.log("No order or line items found in webhook payload.");
      return res.status(400).send("Invalid payload");
    }

    console.log(`Received order: ${order.id}`);

    const giftItems = order.line_items.filter(item =>
      item.title.toLowerCase().includes(GIFT_KEYWORD.toLowerCase())
    );

    if (giftItems.length === 0) {
      console.log("No gift found in this order.");
      return res.status(200).send("No gift to remove.");
    }

    for (const gift of giftItems) {
      console.log(`Removing gift: ${gift.title}`);

      // Delete the line item using Shopify API
      const deleteUrl = `https://${SHOPIFY_STORE}/admin/api/2024-10/orders/${order.id}/line_items/${gift.id}.json`;
      const response = await fetch(deleteUrl, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        },
      });

      if (response.ok) {
        console.log(`Gift ${gift.title} removed from order ${order.id}`);
      } else {
        const text = await response.text();
        console.error(`Failed to remove gift: ${text}`);
      }
    }

    res.status(200).send("Processed");
  } catch (err) {
    console.error("Error processing webhook:", err);
    res.status(500).send("Server error");
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
