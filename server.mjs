import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Optional: explicitly handle root
app.get('/', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// SPA fallback: for any other route, send index.html
app.use((req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`IADM portal listening on http://localhost:${port}`);
});
