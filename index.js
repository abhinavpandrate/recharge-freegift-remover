import express from 'express'
import bodyParser from 'body-parser'
import fetch from 'node-fetch'

const app = express()
const PORT = process.env.PORT || 3000

// Render environment variables
const SHOPIFY_STORE = process.env.SHOPIFY_STORE
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN
const RECHARGE_API_KEY = process.env.RECHARGE_API_KEY

// Gift SKUs as comma-separated string in Render env
const TARGET_VARIANT_SKUS = process.env.TARGET_VARIANT_SKUS.split(',')

app.use(bodyParser.json())

app.post('/webhook', async (req, res) => {
  try {
    const payload = req.body
    console.log('Incoming payload:', JSON.stringify(payload, null, 2))

    if (!payload || !payload.line_items) {
      return res.status(400).send({ error: 'No line items found' })
    }

    const orderId = payload.order_id
    const subscriptionId = payload.subscription_id

    // Find if any gift is in the order
    const giftItem = payload.line_items.find(
      li => TARGET_VARIANT_SKUS.includes(String(li.sku))
    )

    if (!giftItem) {
      console.log('No free gift found in order.')
      return res.status(200).send({ message: 'No gift to remove' })
    }

    if (!subscriptionId) {
      console.log('No subscription ID, assuming first order. Gift kept.')
      return res.status(200).send({ message: 'No subscription, gift kept' })
    }

    // Fetch subscription from Recharge
    const subResponse = await fetch(`https://api.rechargeapps.com/subscriptions/${subscriptionId}`, {
      headers: {
        'X-Recharge-Access-Token': RECHARGE_API_KEY,
        'Content-Type': 'application/json',
      },
    })
    const subData = await subResponse.json()
    const orderCount = subData.subscription.order_count

    if (orderCount <= 1) {
      console.log('First order, keep gift.')
      return res.status(200).send({ message: 'First order, gift kept' })
    }

    console.log(`Recurring order detected (order #${orderCount}), removing gift from Shopify order ${orderId}...`)

    // Fetch Shopify order
    const orderResponse = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-10/orders/${orderId}.json`, {
      headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN },
    })
    const orderData = await orderResponse.json()

    // Remove gift items from line items
    const updatedItems = orderData.order.line_items
      .filter(item => !TARGET_VARIANT_SKUS.includes(String(item.sku)))
      .map(item => ({
        id: item.id,
        quantity: item.quantity,
      }))

    // Update Shopify order
    const updateResponse = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-10/orders/${orderId}.json`, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ order: { id: orderId, line_items: updatedItems } }),
    })

    const result = await updateResponse.json()
    console.log('Gift removed successfully:', result)
    res.status(200).send({ success: true })

  } catch (err) {
    console.error('Error handling webhook:', err)
    res.status(500).send({ error: 'Server error' })
  }
})

app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
