# Self-Hosting getBible API

The getBible API is free and open source (GPL-3.0). You can use the public API endpoints, or host your own instance for better control, privacy, or offline access.

## Using the Public API (Recommended for Most Users)

The public getBible API is free and doesn't require API keys. Just use the default configuration:

```typescript
// Already configured by default in the app
getBibleClient.configure({
  provider: 'getbible',
  enabled: true,
});
```

**Public API Endpoints:**
- Main API: `https://api.getbible.net/v2/`
- Query API: `https://query.getbible.net/v2/`

## Self-Hosting Options

### Option 1: Simple Static File Server

The getBible v2 repository contains JSON files that can be served statically.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/getbible/v2.git
   cd v2
   ```

2. **Serve with a simple HTTP server:**

   **Using Python:**
   ```bash
   # Python 3
   python3 -m http.server 8000
   
   # Or with CORS headers for local development
   python3 -m http.server 8000 --bind 0.0.0.0
   ```

   **Using Node.js (http-server):**
   ```bash
   npx http-server -p 8000 --cors
   ```

   **Using nginx:**
   ```nginx
   server {
       listen 8000;
       server_name localhost;
       
       location / {
           root /path/to/v2;
           add_header Access-Control-Allow-Origin *;
           add_header Access-Control-Allow-Methods "GET, OPTIONS";
       }
   }
   ```

3. **Configure your app to use the self-hosted instance:**
   ```typescript
   import { getBibleClient } from '@/lib/bible-api';
   
   getBibleClient.configure({
     provider: 'getbible',
     enabled: true,
     baseUrl: 'http://localhost:8000', // Your self-hosted URL
   });
   ```

### Option 2: Build a Custom Backend

Since the getBible repository doesn't include server code, you can build your own backend that serves the JSON files with the same API structure.

**Example with Node.js/Express:**

```javascript
const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const DATA_DIR = path.join(__dirname, 'v2');

// Main API: /v2/{translation}/{book}/{chapter}.json
app.get('/v2/:translation/:book/:chapter.json', async (req, res) => {
  const { translation, book, chapter } = req.params;
  const filePath = path.join(DATA_DIR, translation, `${book}`, `${chapter}.json`);
  
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(404).json({ error: 'Not found' });
  }
});

// Query API: /v2/{translation}/{references}
app.get('/v2/:translation/*', async (req, res) => {
  // Implement query parsing logic
  // See getBible documentation for query format
});

app.listen(8000, () => {
  console.log('getBible API server running on port 8000');
});
```

### Option 3: Docker Container

Create a Dockerfile to serve the files:

```dockerfile
FROM nginx:alpine

# Clone getBible v2 repository
RUN apk add --no-cache git && \
    git clone https://github.com/getbible/v2.git /usr/share/nginx/html/v2 && \
    rm -rf /usr/share/nginx/html/v2/.git

# Add CORS headers
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

**nginx.conf:**
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    
    location /v2/ {
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET, OPTIONS";
    }
}
```

## Available Translations

The getBible API supports many translations. Common ones include:

- `kjv` - King James Version
- `asv` - American Standard Version
- `web` - World English Bible
- `darby` - Darby Bible
- `ylt` - Young's Literal Translation
- `akjv` - American King James Version
- `basicenglish` - Basic English Bible

See the full list at: `https://api.getbible.net/v2/translations.json`

## API Endpoints

### Main API (Full Chapters/Books)

- Get all translations: `/v2/translations.json`
- Get a translation: `/v2/{translation}.json`
- Get a book: `/v2/{translation}/{book_number}.json`
- Get a chapter: `/v2/{translation}/{book_number}/{chapter}.json`

Example: `https://api.getbible.net/v2/kjv/62/3.json` (1 John 3)

### Query API (Specific Verses)

- Single verse: `/v2/{translation}/{book} {chapter}:{verse}`
- Multiple verses: `/v2/{translation}/{book} {chapter}:{verse1,verse2};{book} {chapter}:{verse3}`
- Verse ranges: `/v2/{translation}/{book} {chapter}:{verse1}-{verse2}`

Example: `https://query.getbible.net/v2/kjv/John 3:16;1 John 3:16`

## Configuration in Your App

To use a self-hosted instance, configure the getBible client:

```typescript
import { getBibleClient, saveApiConfig } from '@/lib/bible-api';

// For self-hosted instance
await saveApiConfig({
  provider: 'getbible',
  enabled: true,
  baseUrl: 'http://your-server:8000', // Your self-hosted URL
});
```

The client will automatically use your base URL for both Main API and Query API endpoints.

## Benefits of Self-Hosting

1. **Privacy**: All requests stay on your server
2. **Offline Access**: Works without internet connection
3. **Control**: Full control over updates and availability
4. **Performance**: Potentially faster if hosted locally
5. **Customization**: Can modify or add translations

## Limitations

- The getBible repository contains data files but no server implementation
- You'll need to implement query parsing if you want the Query API
- Requires storage space for all translation JSON files
- Need to keep translations updated manually

## License

The getBible API is licensed under GPL-3.0. If you distribute a modified version, you must also use GPL-3.0.

## Resources

- Repository: https://github.com/getbible/v2
- API Documentation: https://github.com/getbible/v2 (README)
- Public API: https://api.getbible.net/v2/
