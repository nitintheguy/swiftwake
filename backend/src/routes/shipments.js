const express = require('express');
const router = express.Router();
const db = require('../db'); // Points to your db.js pool
const redisClient = require('../config/redis'); // Import our Redis client
const { verifyToken, verifyRole } = require('../middleware/auth');

// POST /api/shipments - Only dispatchers and admins can create shipments
router.post('/shipments', verifyToken, verifyRole(['dispatcher', 'admin']), async (req, res) => {
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
        
        if (error.code === '23505') {
            return res.status(409).json({ error: 'A shipment with this tracking number already exists.' });
        }
        
        if (error.code === '23503') {
            return res.status(400).json({ error: 'Invalid sender_id: User does not exist.' });
        }

        return res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/shipments - Retrieve shipments with role scoping, status filtering, and pagination
router.get('/shipments', verifyToken, async (req, res) => {
    try {
        let { status, page = 1, limit = 10 } = req.query;

        page = parseInt(page, 10);
        limit = parseInt(limit, 10);
        const offset = (page - 1) * limit;

        let conditions = [];
        let values = [];
        let paramIndex = 1;

        let query = `
            SELECT s.*, u.name AS sender_name, u.email AS sender_email 
            FROM shipments s
            JOIN users u ON s.sender_id = u.user_id
        `;

        if (req.user.role === 'customer') {
            conditions.push(`s.sender_id = $${paramIndex++}`);
            values.push(req.user.user_id);
        }

        if (status) {
            conditions.push(`s.current_status = $${paramIndex++}`);
            values.push(status);
        }

        if (conditions.length > 0) {
            query += ` WHERE ` + conditions.join(' AND ');
        }

        query += ` ORDER BY s.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++};`;
        values.push(limit, offset);

        const result = await db.query(query, values);

        let countQuery = `SELECT COUNT(*) FROM shipments s`;
        let countValues = [];
        let countParamIndex = 1;
        let countConditions = [];

        if (req.user.role === 'customer') {
            countConditions.push(`s.sender_id = $${countParamIndex++}`);
            countValues.push(req.user.user_id);
        }
        if (status) {
            countConditions.push(`s.current_status = $${countParamIndex++}`);
            countValues.push(status);
        }
        if (countConditions.length > 0) {
            countQuery += ` WHERE ` + countConditions.join(' AND ');
        }

        const countResult = await db.query(countQuery, countValues);
        const totalCount = parseInt(countResult.rows[0].count, 10);

        return res.status(200).json({
            pagination: {
                page,
                limit,
                total_count: totalCount,
                total_pages: Math.ceil(totalCount / limit)
            },
            count: result.rows.length,
            shipments: result.rows
        });

    } catch (error) {
        console.error('Error fetching shipments with pagination:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/shipments/:tracking_number - Retrieve a single shipment by tracking number (With Redis Cache-Aside)
router.get('/shipments/:tracking_number', async (req, res) => {
    try {
        const { tracking_number } = req.params;
        const cacheKey = `shipment:tracking:${tracking_number}`;

        // 1. Check Redis Cache First (Cache Hit)
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
            console.log(`[Cache Hit] Serving tracking number ${tracking_number} from Redis`);
            return res.status(200).json({
                source: 'cache',
                shipment: JSON.parse(cachedData)
            });
        }

        // 2. Cache Miss: Query PostgreSQL
        console.log(`[Cache Miss] Fetching tracking number ${tracking_number} from PostgreSQL`);
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

        const shipment = result.rows[0];

        // 3. Store result in Redis with a 60-second TTL (Time-To-Live)
        await redisClient.setex(cacheKey, 60, JSON.stringify(shipment));

        return res.status(200).json({
            source: 'database',
            shipment: shipment
        });
    } catch (error) {
        console.error('Error fetching shipment:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/shipments/:shipment_id/scans - Log a new tracking audit checkpoint (Staff only with Cache Invalidation)
router.post('/shipments/:shipment_id/scans', verifyToken, verifyRole(['driver', 'dispatcher', 'admin']), async (req, res) => {
    try {
        const { shipment_id } = req.params;
        const { location_hub, scan_status } = req.body;
        const scanned_by = req.user.user_id;

        if (!location_hub || !scan_status) {
            return res.status(400).json({ 
                error: 'Missing required fields: location_hub, scan_status' 
            });
        }

        const shipmentCheck = await db.query(
            'SELECT * FROM shipments WHERE shipment_id = $1', 
            [shipment_id]
        );

        if (shipmentCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Shipment not found' });
        }

        const existingShipment = shipmentCheck.rows[0];

        const scanQuery = `
            INSERT INTO scan_events (shipment_id, location_hub, scan_status, scanned_by)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;
        const scanValues = [shipment_id, location_hub, scan_status, scanned_by];
        const newScan = await db.query(scanQuery, scanValues);

        const updateShipmentQuery = `
            UPDATE shipments 
            SET current_status = $1, updated_at = CURRENT_TIMESTAMP 
            WHERE shipment_id = $2
            RETURNING *;
        `;
        const updatedShipment = await db.query(updateShipmentQuery, [scan_status, shipment_id]);

        // 4. Cache Invalidation: Clear old cached entry so future lookups get the fresh status immediately
        await redisClient.del(`shipment:tracking:${existingShipment.tracking_number}`);

        return res.status(201).json({
            message: 'Scan event logged successfully',
            scan_event: newScan.rows[0],
            updated_shipment: updatedShipment.rows[0]
        });

    } catch (error) {
        console.error('Error logging scan event:', error.message);

        if (error.code === '23503') {
            return res.status(400).json({ error: 'Invalid user reference: User does not exist.' });
        }

        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;