import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const SHOP = process.env.SHOPIFY_SHOP;
const TOKEN = process.env.SHOPIFY_ADMIN;

async function shopify(query) {
  return axios.post(
    `https://${SHOP}/admin/api/2024-04/graphql.json`,
    { query },
    {
      headers: {
        "X-Shopify-Access-Token": TOKEN,
        "Content-Type": "application/json"
      }
    }
  );
}

// Extract pack size from variant option "6 Pack"
function extractPackSize(options) {
  for (const opt of options) {
    const match = opt.value.match(/(\d+)\s*pack/i);
    if (match) return parseInt(match[1], 10);
  }
  return 1;
}

app.post("/correct-stock", async (req, res) => {
  try {
    const { order_id, items } = req.body;

    // Find the line item for the test SKU
    const item = items.find(i => i.sku === "BAR123"); // <-- your SKU

    if (!item) return res.status(200).send("Not target SKU");

    // Extract pack size from variant options
    const pack = extractPackSize(item.variant_options);

    const extraQty = pack - 1;
    if (extraQty <= 0) return res.status(200).send("No correction needed");

    const variantId = item.variant_id; // same SKU

    // Begin edit
    const begin = await shopify(`
      mutation {
        orderEditBegin(orderId: "gid://shopify/Order/${order_id}") {
          calculatedOrder { id }
          userErrors { message }
        }
      }
    `);

    const editId = begin.data.data.orderEditBegin.calculatedOrder.id;

    // Add extra qty
    await shopify(`
      mutation {
        orderEditAddVariant(
          id: "${editId}",
          variantId: "gid://shopify/ProductVariant/${variantId}",
          quantity: ${extraQty}
        ) {
          userErrors { message }
        }
      }
    `);

    // Commit changes
    await shopify(`
      mutation {
        orderEditCommit(id: "${editId}") {
          order { id }
          userErrors { message }
        }
      }
    `);

    res.send("Stock corrected");
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).send("Error");
  }
});

app.listen(3000, () => console.log("Running"));
