import express from 'express'
import bodyParser from 'body-parser'
import fetch from 'node-fetch'

const app = express()
const PORT = process.env.PORT || 3000

// Environment variables must be set on the Render service
const RECHARGE_API_KEY = process.env.RECHARGE_API_KEY
// TARGET_VARIANT_SKUS should be a comma-separated string (e.g., "CAP-RED,CAP-BLUE")
const TARGET_VARIANT_SKUS_STRING = process.env.TARGET_VARIANT_SKUS

// Basic checks for required environment variables (optional, but good practice)
if (!RECHARGE_API_KEY || !TARGET_VARIANT_SKUS_STRING) {
    console.error("Missing required environment variables: RECHARGE_API_KEY or TARGET_VARIANT_SKUS.")
}

// Split SKUs into an array for easy checking
const TARGET_VARIANT_SKUS = TARGET_VARIANT_SKUS_STRING ? TARGET_VARIANT_SKUS_STRING.split(',') : []

app.use(bodyParser.json())

app.post('/webhook', async (req, res) => {
    try {
        const payload = req.body
        console.log('--- Incoming Payload Received ---')
        
        // Ensure payload is from ReCharge and contains necessary IDs
        if (!payload || !payload.line_items || !payload.subscription_id) {
            console.log('Invalid payload or missing subscription ID.')
            return res.status(400).send({ error: 'Invalid webhook payload' })
        }

        const subscriptionId = payload.subscription_id

        // 1. Check if the target item is in the current order payload
        const giftItem = payload.line_items.find(
            li => TARGET_VARIANT_SKUS.includes(String(li.sku))
        )

        if (!giftItem) {
            console.log('No target gift item found in order. Exiting.')
            return res.status(200).send({ message: 'No gift to remove' })
        }

        // 2. Fetch the subscription contract from ReCharge
        const subResponse = await fetch(`https://api.rechargeapps.com/subscriptions/${subscriptionId}`, {
            headers: {
                'X-Recharge-Access-Token': RECHARGE_API_KEY,
                'Content-Type': 'application/json',
            },
        })
        
        if (!subResponse.ok) {
            const errorText = await subResponse.text()
            console.error(`Error fetching ReCharge subscription ${subscriptionId}: ${subResponse.status} ${errorText}`)
            return res.status(500).send({ error: `Failed to fetch subscription: ${subResponse.status}` })
        }

        const subData = await subResponse.json()
        const subscription = subData.subscription
        const orderCount = subscription.order_count

        // 3. Check if it's the first order (where the gift should be included)
        if (orderCount <= 1) {
            console.log('First order, gift is allowed. Exiting.')
            return res.status(200).send({ message: 'First order, gift kept' })
        }

        console.log(`Recurring order detected (order #${orderCount}). Attempting to remove gift from ReCharge Subscription ${subscriptionId}...`)

        // 4. Filter out the gift item(s) from the existing subscription contract line items
        const updatedLineItems = subscription.line_items.filter(li => {
            // Note: Filtering by SKU assumes the SKU is present on the subscription line item.
            // If this fails, the next debug step is to switch to variant_id.
            return !TARGET_VARIANT_SKUS.includes(String(li.sku))
        })

        // Check if any line items were actually removed
        if (updatedLineItems.length === subscription.line_items.length) {
            console.log('Gift item was not found in the subscription contract or was already removed. No update needed.')
            return res.status(200).send({ message: 'Gift already removed from contract or SKU mismatch' })
        }
        
        // 5. Update the ReCharge Subscription Contract via PUT request
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
        })

        // -------------------------------------------------------------
        // CRITICAL DEBUGGING SECTION: This is what tells us the error
        // -------------------------------------------------------------
        if (!updateSubResponse.ok) {
            const status = updateSubResponse.status;
            const errorBody = await updateSubResponse.text(); 
            
            console.error('--- CRITICAL FAILURE: ReCharge PUT update failed ---');
            console.error(`Status: ${status}`);
            console.error(`Response Body: ${errorBody}`);
            
            // Return an error to the webhook sender (ReCharge)
            return res.status(500).send({ error: `ReCharge update failed (Status: ${status})` });
        }
        // -------------------------------------------------------------

        const updateSubResult = await updateSubResponse.json()

        console.log('✅ Gift permanently removed from ReCharge subscription contract successfully.')
        console.log('--- Process Complete ---')
        res.status(200).send({ success: true, message: 'Gift removed from future renewals' })

    } catch (err) {
        console.error('An unexpected error occurred while handling webhook:', err)
        res.status(500).send({ error: 'Server error' })
    }
})

app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
