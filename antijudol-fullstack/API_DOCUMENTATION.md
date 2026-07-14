# ANTI-JUDOL Backend API Documentation

This document describes the API endpoints your backend needs to implement for the ANTI-JUDOL system.

## Base URL
```
https://your-backend-api.com/api
```

## Authentication
All requests from the extension include a device ID for identification. You may implement additional authentication as needed (API keys, JWT, etc.).

---

## Endpoints

### 1. Device Registration
**POST** `/devices/register`

Register a new device when the extension is first installed.

**Request Body:**
```json
{
  "deviceId": "device_abc123_1234567890",
  "extensionVersion": "1.0.0",
  "browser": "Chrome",
  "registeredAt": "2025-01-15T10:30:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "deviceId": "device_abc123_1234567890",
  "message": "Device registered successfully"
}
```

---

### 2. Get All Devices
**GET** `/devices`

Get list of all registered devices for the admin dashboard.

**Response:**
```json
[
  {
    "id": "uuid-here",
    "deviceId": "device_abc123_1234567890",
    "deviceName": "Lab A - PC 12",
    "location": "Computer Lab A",
    "status": "online",
    "extensionVersion": "1.0.0",
    "lastSeen": "2025-01-15T10:35:00Z",
    "blockedToday": 15,
    "registeredAt": "2025-01-15T10:30:00Z"
  }
]
```

---

### 3. Heartbeat
**POST** `/heartbeat`

Sent every minute from each device to indicate it's online.

**Request Body:**
```json
{
  "deviceId": "device_abc123_1234567890",
  "timestamp": "2025-01-15T10:31:00Z",
  "stats": {
    "sitesBlocked": 5,
    "adsBlocked": 10,
    "lastSync": 1705315800000
  }
}
```

**Response:**
```json
{
  "success": true,
  "serverTime": "2025-01-15T10:31:00Z"
}
```

---

### 4. Submit Logs (Batch)
**POST** `/logs`

Submit batch of blocked content logs from a device.

**Request Body:**
```json
{
  "logs": [
    {
      "deviceId": "device_abc123_1234567890",
      "timestamp": "2025-01-15T10:30:15Z",
      "type": "site",
      "url": "https://example-casino.com",
      "tabId": 12345
    },
    {
      "deviceId": "device_abc123_1234567890",
      "timestamp": "2025-01-15T10:30:20Z",
      "type": "ad",
      "url": "https://example.com",
      "selector": ".ad-container",
      "reason": "gambling ad"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "logsReceived": 2
}
```

---

### 5. Get Logs
**GET** `/logs?deviceId={deviceId}&limit={limit}&offset={offset}`

Get blocked content logs for admin dashboard.

**Query Parameters:**
- `deviceId` (optional): Filter by specific device
- `limit` (optional): Number of records to return (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
[
  {
    "id": "uuid-here",
    "deviceId": "device_abc123_1234567890",
    "deviceName": "Lab A - PC 12",
    "timestamp": "2025-01-15T10:30:15Z",
    "type": "site",
    "url": "https://example-casino.com",
    "category": "gambling"
  }
]
```

---

### 6. Get Statistics
**GET** `/statistics?period={period}`

Get aggregated statistics for dashboard.

**Query Parameters:**
- `period` (optional): "today", "week", "month", "all" (default: "today")

**Response:**
```json
{
  "totalBlocked": 245,
  "activeDevices": 48,
  "violations": 12,
  "byType": {
    "sites": 165,
    "ads": 80
  },
  "topDevices": [
    {
      "deviceId": "device_abc123",
      "deviceName": "Lab A - PC 12",
      "blockedCount": 25
    }
  ],
  "timeline": [
    {
      "hour": "10:00",
      "blocked": 15
    }
  ]
}
```

---

### 7. Get Blocklist
**GET** `/blocklist`

Get the current blocklist of gambling domains/patterns.

**Response:**
```json
[
  "*://bet*.com/*",
  "*://casino*.com/*",
  "*://poker*.com/*",
  "*://judi*.com/*",
  "*://taruhan*.com/*",
  "*://togel*.com/*"
]
```

---

### 8. Update Blocklist
**POST** `/blocklist`

Admin endpoint to update the blocklist.

**Request Body:**
```json
{
  "domains": [
    "*://newcasino*.com/*",
    "*://newbet*.com/*"
  ],
  "action": "add"
}
```
or
```json
{
  "domains": [
    "*://oldsite*.com/*"
  ],
  "action": "remove"
}
```

**Response:**
```json
{
  "success": true,
  "totalDomains": 150,
  "message": "Blocklist updated successfully"
}
```

---

### 9. Real-time Alerts (WebSocket)
**WebSocket** `wss://your-backend-api.com/alerts`

Connect to receive real-time alerts about violations and suspicious activity.

**Server → Client Messages:**
```json
{
  "type": "alert",
  "severity": "high",
  "message": "Lab A - PC 12 attempted to access blocked site 5 times",
  "deviceId": "device_abc123",
  "timestamp": "2025-01-15T10:35:00Z"
}
```

---

## Database Schema Recommendations

### Devices Table
```sql
CREATE TABLE devices (
  id UUID PRIMARY KEY,
  device_id VARCHAR(255) UNIQUE NOT NULL,
  device_name VARCHAR(255),
  location VARCHAR(255),
  extension_version VARCHAR(50),
  browser VARCHAR(50),
  status VARCHAR(20) DEFAULT 'online',
  last_seen TIMESTAMP,
  registered_at TIMESTAMP DEFAULT NOW()
);
```

### Logs Table
```sql
CREATE TABLE logs (
  id UUID PRIMARY KEY,
  device_id VARCHAR(255) REFERENCES devices(device_id),
  timestamp TIMESTAMP NOT NULL,
  type VARCHAR(20) NOT NULL,
  url TEXT NOT NULL,
  selector VARCHAR(255),
  reason VARCHAR(255),
  tab_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Blocklist Table
```sql
CREATE TABLE blocklist (
  id UUID PRIMARY KEY,
  pattern VARCHAR(255) UNIQUE NOT NULL,
  category VARCHAR(50),
  added_at TIMESTAMP DEFAULT NOW(),
  added_by VARCHAR(255)
);
```

---

## Security Recommendations

1. **Authentication**: Implement API key authentication for extension requests
2. **Rate Limiting**: Limit requests per device to prevent abuse
3. **Data Encryption**: Use HTTPS for all API communications
4. **Input Validation**: Validate all incoming data
5. **Device Verification**: Implement device fingerprinting to prevent spoofing
6. **Admin Authentication**: Secure admin endpoints with proper authentication

---

## Testing Your Backend

Once your backend is ready:

1. Update the `CONFIG.API_ENDPOINT` in `public/extension/background.js`
2. Load the extension in Chrome via `chrome://extensions`
3. Check the browser console for connection logs
4. Test the admin dashboard at your deployment URL

---

## Support

For questions about the extension or dashboard implementation, refer to the source code comments or create an issue in your project repository.
