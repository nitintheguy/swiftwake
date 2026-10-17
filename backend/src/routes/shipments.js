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
router.get('/shipments', async (req, res) => {
    try {
        const query = `
            SELECT s.*, u.name AS sender_name, u.email AS sender_email 
            FROM shipments s
            JOIN users u ON s.sender_id = u.user_id
            ORDER BY s.created_at DESC;
        `;
        const result = await db.query(query);

        return res.status(200).json({
            count: result.rows.length,
            shipments: result.rows
        });
    } catch (error) {
        console.error('Error fetching shipments:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/shipments/:tracking_number - Retrieve a single shipment by tracking number
router.get('/shipments/:tracking_number', async (req, res) => {
    try {
        const { tracking_number } = req.params;

        const query = `
            SELECT s.*, u.name AS sender_name, u.email AS sender_email 
            FROM shipments s
            JOIN users u ON s.sender_id = u.user_id
            WHERE s.tracking_number = $1;
        `;
        const result = await db.query(query, [tracking_number]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Shipment not found' });
        }

        return res.status(200).json({
            shipment: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching shipment:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/shipments/:shipment_id/scans - Log a new tracking audit checkpoint
router.post('/shipments/:shipment_id/scans', async (req, res) => {
    try {
        const { shipment_id } = req.params;
        const { location_hub, scan_status, scanned_by } = req.body;

        // Basic validation
        if (!location_hub || !scan_status || !scanned_by) {
            return res.status(400).json({ 
                error: 'Missing required fields: location_hub, scan_status, scanned_by' 
            });
        }

        // 1. Verify the shipment exists before scanning
        const shipmentCheck = await db.query(
            'SELECT * FROM shipments WHERE shipment_id = $1', 
            [shipment_id]
        );

        if (shipmentCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Shipment not found' });
        }

        // 2. Insert the scan event into the audit log
        const scanQuery = `
            INSERT INTO scan_events (shipment_id, location_hub, scan_status, scanned_by)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;
        const scanValues = [shipment_id, location_hub, scan_status, scanned_by];
        const newScan = await db.query(scanQuery, scanValues);

        // 3. Automatically update the shipment's current status and updated_at timestamp
        const updateShipmentQuery = `
            UPDATE shipments 
            SET current_status = $1, updated_at = CURRENT_TIMESTAMP 
            WHERE shipment_id = $2
            RETURNING *;
        `;
        const updatedShipment = await db.query(updateShipmentQuery, [scan_status, shipment_id]);

        return res.status(201).json({
            message: 'Scan event logged successfully',
            scan_event: newScan.rows[0],
            updated_shipment: updatedShipment.rows[0]
        });

    } catch (error) {
        console.error('Error logging scan event:', error.message);

        // Handle foreign key violation if scanned_by user doesn't exist
        if (error.code === '23503') {
            return res.status(400).json({ error: 'Invalid scanned_by user ID: User does not exist.' });
        }

        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;