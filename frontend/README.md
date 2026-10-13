# Customer app
Run `npm install`, copy `.env.example` to `.env`, set `VITE_API_URL` to the API URL, then `npm run dev`.
Local app: http://localhost:5173. Camera works on localhost or HTTPS.
Barcode samples are seeded by the backend `/api/dev/seed` endpoint. Seeded values: 8901000000011, 8901000000028, 8901000000035, 8901000000042, 8901000000059, 8901000000066.
Deploy to Vercel as a Vite app; set `VITE_API_URL` to the Render API URL.
