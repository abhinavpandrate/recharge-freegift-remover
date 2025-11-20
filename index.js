import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;
app.use(bodyParser.json());

// Example mapping of pack types
const packMultipliers = {
  "1-pack": 1,
  "3-pack": 3,
  "6-pack": 6,
  "12-pack": 12
};

app.post("/webhook", async (req, res) => {
  const order = req.body;
  
  console.log("Order received:", order.id);

  for (let item of order.line_items) {
    if (item.sku === "EFP_Styrkr_Bar30_D&A_x1_UK") {
      // Determine quantity multiplier based on variant title
      const multiplier = packMultipliers[item.title.toLowerCase()] || 1;
      const actualQuantity = item.quantity * multiplier;

      console.log(`Item: ${item.title}, original qty: ${item.quantity}, multiplied qty: ${actualQuantity}`);

      // Optional: send to Shopify to create a new fulfilled line item OR trigger NS sync
      // Shopify API: create new line item with 0 price if needed
      // fetch("https://{shop}.myshopify.com/admin/api/2025-10/orders/{order_id}/fulfillments.json", {...})
    }
  }

  res.status(200).send("Webhook processed");
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
