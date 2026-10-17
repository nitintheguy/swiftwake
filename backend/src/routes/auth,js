const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');

// POST /api/auth/register - Register a new user
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Missing required fields: name, email, password' });
        }

        // Hash the password
        const saltRounds = 10;
        const password_hash = await bcrypt.hash(password, saltRounds);

        // Default to 'customer' if role is not provided
        const userRole = role || 'customer';

        const query = `
            INSERT INTO users (name, email, password_hash, role)
            VALUES ($1, $2, $3, $4)
            RETURNING user_id, name, email, role, created_at;
        `;
        
        const values = [name, email, password_hash, userRole];
        const newUser = await db.query(query, values);

        return res.status(201).json({
            message: 'User registered successfully',
            user: newUser.rows[0]
        });

    } catch (error) {
        console.error('Registration error:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Email is already registered.' });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/auth/login - Authenticate user & issue JWT
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Please provide email and password' });
        }

        // Find user by email
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = result.rows[0];

        // Compare passwords
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Generate JWT token (expires in 24 hours)
        const tokenPayload = {
            user_id: user.user_id,
            email: user.email,
            role: user.role
        };

        const token = jwt.sign(
            tokenPayload, 
            process.env.JWT_SECRET || 'your_jwt_secret_key', 
            { expiresIn: '24h' }
        );

        return res.status(200).json({
            message: 'Login successful',
            token,
            user: {
                user_id: user.user_id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Login error:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;