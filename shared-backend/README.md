# Smart Basket shared backend

## MongoDB Atlas collections
Mongoose creates these collections automatically when used:
- `customers`
- `products`
- `baskets`
- `orders`

## Local run (VS Code terminal)
1. Install Node.js LTS and MongoDB Atlas cluster.
2. Copy `.env.example` to `.env`.
3. In Atlas, create a database user, add your current IP in Network Access, and copy the connection string into `MONGODB_URI`. Replace placeholders locally only; never publish secrets to GitHub.
4. Set a long random `JWT_SECRET`.
5. Run:
   ```bash
   npm install
   npm run dev
   ```
6. Open `http://localhost:8080/api/health`.
7. Seed starter products and B1-B10 baskets once:
   ```bash
   curl -X POST http://localhost:8080/api/dev/seed
   ```
   Windows PowerShell alternative:
   ```powershell
   Invoke-RestMethod -Method Post http://localhost:8080/api/dev/seed
   ```

## Deploy
- GitHub: push code only after confirming `.env` is ignored.
- Render: create a Web Service from the backend folder/repo. Build command `npm install`, start command `npm start`. Add `MONGODB_URI`, `JWT_SECRET`, `CLIENT_ORIGINS` in Render Environment.
- Vercel: deploy each frontend separately, set `VITE_API_URL` to the Render URL (no trailing slash).
- In Atlas Network Access, prefer a restricted IP/network setup for production. `0.0.0.0/0` is easier for a temporary demo but less secure.

## Important demo limits
- `/api/orders/:id/pay` is a simulated payment endpoint. QR generation is for demo display only and does not collect or verify UPI payments.
- The cashier order endpoints are demo-open for easy lab testing. Add cashier authentication/authorization before public production deployment.
- This starter uses password login, not SMS OTP. Add a real OTP provider only after configuring one.
