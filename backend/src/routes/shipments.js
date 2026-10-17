const express = require('express');
const router = express.Router();
const db = require('../db'); // Points to your db.js pool

// POST /api/shipments - Create a new shipment
router.post('/shipments', async (req, res) => {
    try {
        const { tracking_number, sender_id, recipient_name, destination_address } = req.body;

        // Basic validation
        if (!tracking_number || !sender_id || !recipient_name || !destination_address) {
            return res.status(400).json({ 
                error: 'Missing required fields: tracking_number, sender_id, recipient_name, destination_address' 
            });
        }

        const query = `
            INSERT INTO shipments (tracking_number, sender_id, recipient_name, destination_address, current_status)
            VALUES ($1, $2, $3, $4, 'Order Created')
            RETURNING *;
        `;

        const values = [tracking_number, sender_id, recipient_name, destination_address];
        const newShipment = await db.query(query, values);

        return res.status(201).json({
            message: 'Shipment created successfully',
            shipment: newShipment.rows[0]
        });

    } catch (error) {
        console.error('Error creating shipment:', error.message);
        
        // Handle unique violation (e.g., duplicate tracking number)
        if (error.code === '23505') {
            return res.status(409).json({ error: 'A shipment with this tracking number already exists.' });
        }
        
        // Handle foreign key violation (e.g., sender_id doesn't exist in users table)
        if (error.code === '23503') {
            return res.status(400).json({ error: 'Invalid sender_id: User does not exist.' });
        }

        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;