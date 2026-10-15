import express from 'express';
import path from 'path';
import {readFileSync} from 'node:fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Prevent caching so deployments and updates always reflect immediately
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

const legacyAssets = JSON.parse(readFileSync(path.join(__dirname, 'config/legacy-assets.json'), 'utf8'));
for (const [oldPath, newPath] of Object.entries(legacyAssets)) {
  const target = oldPath.endsWith('.js') ? 'compat/'+oldPath : newPath;
  app.get('/'+oldPath, (req, res) => {
    res.sendFile(path.join(__dirname, target), {etag:false, lastModified:false});
  });
}

app.use(express.static(__dirname, {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
