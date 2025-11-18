import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables must be set on the Render service
const RECHARGE_API_KEY = process.env.RECHARGE_API_KEY;
const TARGET_VARIANT_SKUS_STRING = process.env.TARGET_VARIANT_SKUS;

if (!RECHARGE_API_KEY || !TARGET_VARIANT_SKUS_STRING) {
    console.error("Missing required environment variables: RECHARGE_API_KEY or TARGET_VARIANT_SKUS.");
}

const TARGET_VARIANT_SKUS = TARGET_VARIANT_SKUS_STRING ? TARGET_VARIANT_SKUS_STRING.split(',') : [];

app.use(bodyParser.json());

app.post('/webhook', async (req, res) => {
    try {
        const payload = req.body;
        console.log('--- Incoming Payload Received ---');
        
        // 1. Safely find the subscription ID and line items based on common webhook structures
        const subscriptionId = payload.subscription_id || 
                                (payload.charge && payload.charge.subscription_id) ||
                                (payload.order && payload.order.subscription_id);

        const lineItems = payload.line_items || 
                          (payload.charge && payload.charge.line_items) ||
                          (payload.order && payload.order.line_items);

        if (!subscriptionId || !lineItems || lineItems.length === 0) {
            console.log('--- Payload Check Failed ---');
            console.log('Could not find subscription ID or line items in expected locations.');
            console.log('Dumping payload structure for debugging:');
            console.log(JSON.stringify(payload, null, 2));
            console.log('--- End Debug Dump ---');
            return res.status(400).send({ error: 'Invalid webhook structure' });
        }

        // We now have subscriptionId and lineItems to work with.
        
        // 2. Check if the target item is in the current order payload
        const giftItem = lineItems.find(
            li => TARGET_VARIANT_SKUS.includes(String(li.sku))
        );

        if (!giftItem) {
            console.log('No target gift item found in order. Exiting.')
            return res.status(200).send({ message: 'No gift to remove' })
        }

        // 3. Fetch the subscription contract from ReCharge
        const subResponse = await fetch(`https://api.rechargeapps.com/subscriptions/${subscriptionId}`, {
            headers: {
                'X-Recharge-Access-Token': RECHARGE_API_KEY,
                'Content-Type': 'application/json',
            },
        });
        
        if (!subResponse.ok) {
            const errorText = await subResponse.text();
            console.error(`Error fetching ReCharge subscription ${subscriptionId}: ${subResponse.status} ${errorText}`);
            return res.status(500).send({ error: `Failed to fetch subscription: ${subResponse.status}` });
        }

        const subData = await subResponse.json();
        const subscription = subData.subscription;
        const orderCount = subscription.order_count;

        // 4. Check if it's the first order (where the gift should be included)
        if (orderCount <= 1) {
            console.log('First order, gift is allowed. Exiting.');
            return res.status(200).send({ message: 'First order, gift kept' });
        }

        console.log(`Recurring order detected (order #${orderCount}). Attempting to remove gift from ReCharge Subscription ${subscriptionId}...`);

        // 5. Filter out the gift item(s) from the existing subscription contract line items
        const updatedLineItems = subscription.line_items.filter(li => {
            return !TARGET_VARIANT_SKUS.includes(String(li.sku));
        });

        // Check if any line items were actually removed
        if (updatedLineItems.length === subscription.line_items.length) {
            console.log('Gift item was not found in the subscription contract or was already removed. No update needed.');
            return res.status(200).send({ message: 'Gift already removed from contract or SKU mismatch' });
        }
        
        // 6. Update the ReCharge Subscription Contract via PUT request
        const updateSubResponse = await fetch(`https://api.rechargeapps.com/subscriptions/${subscriptionId}`, {
            method: 'PUT',
            headers: {
                'X-Recharge-Access-Token': RECHARGE_API_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                subscription: {
                    line_items: updatedLineItems,
                },
            }),
        });

        // --- CRITICAL DEBUGGING SECTION ---
        if (!updateSubResponse.ok) {
            const status = updateSubResponse.status;
            const errorBody = await updateSubResponse.text(); 
            
            console.error('--- CRITICAL FAILURE: ReCharge PUT update failed ---');
            console.error(`Status: ${status}`);
            console.error(`Response Body: ${errorBody}`);
            
            return res.status(500).send({ error: `ReCharge update failed (Status: ${status})` });
        }
        // ------------------------------------

        const updateSubResult = await updateSubResponse.json();

        console.log('✅ Gift permanently removed from ReCharge subscription contract successfully.');
        console.log('--- Process Complete ---');
        res.status(200).send({ success: true, message: 'Gift removed from future renewals' });

    } catch (err) {
        console.error('An unexpected error occurred while handling webhook:', err);
        res.status(500).send({ error: 'Server error' });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
