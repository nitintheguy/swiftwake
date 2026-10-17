const express = require('express');
const cors = require('cors');
require('dotenv').config();

const db = require('./db'); // Imports our postgres connection pool

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());


// Import shipment routes
const shipmentRoutes = require('./routes/shipments');
app.use('/api', shipmentRoutes);

// Import auth routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);


// Test route to check server and database health
app.get('/api/health', async (req, res) => {
  try {
    // Run a quick query to test database connectivity and get current timestamp
    const result = await db.query('SELECT NOW()');
    res.status(200).json({
      status: 'success',
      message: 'Swiftwake backend is running!',
      database_time: result.rows[0].now,
    });
  } catch (err) {
    console.error('Database connection error:', err.message);
    res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      error: err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});