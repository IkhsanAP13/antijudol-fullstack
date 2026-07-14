# ANTI-JUDOL Installation Guide

## Prerequisites

1. Backend API running (see API_DOCUMENTATION.md)
2. Chrome browser on campus computers
3. Admin access to install extensions

---

## Part 1: Extension Installation

### Manual Installation (Development/Testing)

1. **Prepare the Extension Files**
   - Download the `public/extension` folder
   - Update `CONFIG.API_ENDPOINT` in `background.js` with your backend URL

2. **Load Extension in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `public/extension` folder
   - Extension will appear in the toolbar

3. **Verify Installation**
   - Click the extension icon
   - Check that Device ID is generated
   - Statistics should show "0" initially
   - Status should show "Protection Active"

### Deployment to Campus Computers

#### Option A: Group Policy (Windows Domain)

1. **Package the Extension**
   ```bash
   # From the extension directory
   chrome --pack-extension=./extension --pack-extension-key=./extension.pem
   ```

2. **Deploy via GPO**
   - Copy `.crx` file to network share
   - Create GPO: Computer Configuration > Policies > Administrative Templates > Google > Google Chrome > Extensions
   - Configure "Extension management settings"
   ```json
   {
     "your-extension-id": {
       "installation_mode": "force_installed",
       "update_url": "path-to-updates.xml"
     }
   }
   ```

#### Option B: Manual Distribution

1. Create installation package with:
   - Extension files
   - Installation script
   - Configuration instructions

2. Deploy to each computer via USB or network

3. Use provided batch script:
   ```batch
   @echo off
   cd /d "%~dp0"
   start chrome --load-extension="%CD%\extension"
   ```

---

## Part 2: Admin Dashboard Deployment

### Deploy Dashboard Web App

1. **Build the Dashboard**
   ```bash
   npm install
   npm run build
   ```

2. **Deploy to Web Server**
   - Upload `dist` folder to your web server
   - Configure web server to serve the dashboard
   - Ensure HTTPS is enabled

3. **Configure Backend Connection**
   - Update API endpoints in dashboard code if needed
   - Test connection to backend

4. **Access Dashboard**
   - Navigate to your dashboard URL
   - Login with admin credentials (implement in backend)
   - Verify data is loading from backend

---

## Part 3: Backend Setup

### Required Backend Components

1. **Database**
   - PostgreSQL, MySQL, or MongoDB
   - Create tables/collections (see API_DOCUMENTATION.md)
   - Set up indexes for performance

2. **API Server**
   - Node.js, Python, PHP, or other
   - Implement endpoints from API documentation
   - Enable CORS for dashboard domain

3. **WebSocket Server (Optional)**
   - For real-time alerts
   - Connect to dashboard for live updates

### Example Backend Stack Options

#### Option 1: Node.js + Express + PostgreSQL
```bash
npm install express pg cors ws
```

#### Option 2: Python + Flask + MySQL
```bash
pip install flask mysql-connector-python flask-cors flask-socketio
```

#### Option 3: PHP + Laravel + MySQL
```bash
composer create-project laravel/laravel anti-judol-backend
```

---

## Part 4: Configuration

### Extension Configuration

Edit `public/extension/background.js`:

```javascript
const CONFIG = {
  API_ENDPOINT: 'https://your-backend-api.com/api',
  HEARTBEAT_INTERVAL: 60000,
  LOG_BATCH_SIZE: 10,
  SYNC_INTERVAL: 300000
};
```

### Dashboard Configuration

Update API endpoints in `src/pages/Dashboard.tsx`:

```typescript
const API_BASE = 'https://your-backend-api.com/api';
```

---

## Part 5: Testing

### Test Extension

1. Install extension in Chrome
2. Visit a test gambling site (should be blocked)
3. Check popup shows blocked count
4. Verify logs are sent to backend

### Test Dashboard

1. Access dashboard URL
2. Check device list shows test device
3. Verify statistics are accurate
4. Test real-time updates (if WebSocket enabled)

### Test Backend

1. Check database for device registration
2. Verify logs are being stored
3. Test API endpoints with Postman/curl
4. Monitor server logs for errors

---

## Part 6: Maintenance

### Update Blocklist

Add new gambling domains via dashboard or API:

```bash
curl -X POST https://your-backend-api.com/api/blocklist \
  -H "Content-Type: application/json" \
  -d '{
    "domains": ["*://newcasino*.com/*"],
    "action": "add"
  }'
```

### Monitor System Health

- Check dashboard for offline devices
- Review logs regularly for patterns
- Update extension version when needed
- Backup database regularly

### Handle Issues

**Extension not blocking:**
- Check browser console for errors
- Verify blocklist is loading
- Update extension if needed

**Dashboard not loading data:**
- Check backend API status
- Verify CORS configuration
- Check browser network tab for errors

**Backend issues:**
- Check server logs
- Verify database connection
- Monitor API response times

---

## Troubleshooting

### Common Issues

1. **Extension not connecting to backend**
   - Verify API_ENDPOINT is correct
   - Check CORS settings on backend
   - Ensure backend is accessible from campus network

2. **Devices showing offline**
   - Check heartbeat interval
   - Verify network connectivity
   - Check firewall settings

3. **Logs not appearing**
   - Verify batch size and sync interval
   - Check backend log endpoint
   - Review database write permissions

4. **Dashboard loading slowly**
   - Add database indexes
   - Implement pagination
   - Enable caching

---

## Security Checklist

- [ ] HTTPS enabled for all communications
- [ ] API authentication implemented
- [ ] Rate limiting configured
- [ ] Database credentials secured
- [ ] Admin dashboard password protected
- [ ] Extension update mechanism secured
- [ ] Logs contain no sensitive student information
- [ ] Backup system in place

---

## Support

For technical support:
1. Check console logs (browser and server)
2. Review API documentation
3. Test each component independently
4. Contact your backend development team

---

## License

This system is provided for educational and campus security purposes. Ensure compliance with local privacy laws and campus policies before deployment.
