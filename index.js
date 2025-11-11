import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const RECHARGE_API_KEY = 'sk_2x2_1b3d003b0c25cff897dc8bc261cd12f9cc048a0a3244c782e9f466542ba629fc';

const FREE_GIFT_VARIANT_ID = 56519341375870; // BYOB Cycling Cap variant ID

// Helper to remove free gift from upcoming draft orders
async function removeGiftFromUpcoming(subscriptionId) {
  try {
    // Fetch upcoming draft orders for this subscription
    const res = await fetch(`https://api.rechargeapps.com/subscriptions/${subscriptionId}/upcoming_charges`, {
      headers: {
        'X-Recharge-Access-Token': RECHARGE_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json();

    if (!data.upcoming_charges || data.upcoming_charges.length === 0) {
      console.log(`No upcoming charges found for subscription ${subscriptionId}`);
      return;
    }

    for (const charge of data.upcoming_charges) {
      if (charge.status !== 'QUEUED') {
        console.log(`Charge ${charge.id} is already processed, skipping.`);
        continue;
      }

      // Remove free gift from line items if present
      const updatedLineItems = (charge.line_items || []).filter(
        item => item.shopify_variant_id !== FREE_GIFT_VARIANT_ID
      );

      if (updatedLineItems.length === (charge.line_items || []).length) {
        console.log(`No free gift found in upcoming order ${charge.id}`);
        continue;
      }

      const updateRes = await fetch(`https://api.rechargeapps.com/orders/${charge.id}`, {
        method: 'PUT',
        headers: {
          'X-Recharge-Access-Token': RECHARGE_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ line_items: updatedLineItems })
      });

      const updateData = await updateRes.json();
      console.log(`Free gift removed from upcoming order ${charge.id}:`, updateData);
    }
  } catch (err) {
    console.error('Error removing gift:', err);
  }
}

app.post('/webhook', async (req, res) => {
  const payload = req.body;

  console.log('Webhook payload received:', JSON.stringify(payload, null, 2));

  // Try to get subscription ID
  const subscriptionId = payload.subscription?.id || payload.order?.subscription_id;

  if (!subscriptionId) {
    console.log('No subscription ID found in payload.');
    return res.status(400).send('No subscription ID');
  }

  // Check if this is first order
  if (payload.subscription?.first_charge_date === payload.order?.processed_at) {
    console.log(`First order for subscription ${subscriptionId}. Gift can stay.`);
    return res.status(200).send('First order, gift kept.');
  }

  // Remove gift from upcoming draft orders
  await removeGiftFromUpcoming(subscriptionId);

  res.status(200).send('Webhook processed');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
