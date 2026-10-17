-- 1. Create an enum for user roles
CREATE TYPE user_role AS ENUM ('customer', 'dispatcher', 'driver', 'admin');

-- 2. Users Table
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'customer',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Shipments Table
CREATE TABLE shipments (
    shipment_id SERIAL PRIMARY KEY,
    tracking_number VARCHAR(50) UNIQUE NOT NULL,
    sender_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    recipient_name VARCHAR(100) NOT NULL,
    destination_address TEXT NOT NULL,
    current_status VARCHAR(50) DEFAULT 'Order Created',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Scan Events Table (Historical tracking audit log)
CREATE TABLE scan_events (
    event_id SERIAL PRIMARY KEY,
    shipment_id INT REFERENCES shipments(shipment_id) ON DELETE CASCADE,
    location_hub VARCHAR(100) NOT NULL,
    scan_status VARCHAR(50) NOT NULL,
    scanned_by INT REFERENCES users(user_id),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);