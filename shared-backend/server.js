
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// CORS must run before API routes.
// This allows browser preflight requests for the demo API.
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// -------------------- Database models --------------------

const Product = mongoose.model(
  "Product",
  new mongoose.Schema(
    {
      barcode: { type: String, unique: true, required: true, index: true },
      name: { type: String, required: true },
      price: { type: Number, required: true, min: 0 },
      category: { type: String, default: "General" },
      stock: { type: Number, default: 100 },
      imageUrl: String
    },
    { timestamps: true }
  )
);

const Basket = mongoose.model(
  "Basket",
  new mongoose.Schema(
    {
      basketId: { type: String, unique: true, required: true },
      status: {
        type: String,
        enum: ["AVAILABLE", "IN_USE", "CHECKOUT"],
        default: "AVAILABLE"
      },
      customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Customer",
        default: null
      }
    },
    { timestamps: true }
  )
);

const Customer = mongoose.model(
  "Customer",
  new mongoose.Schema(
    {
      name: { type: String, required: true },
      email: {
        type: String,
        unique: true,
        required: true,
        lowercase: true,
        trim: true
      },
      phone: String,
      passwordHash: { type: String, required: true },
      role: {
        type: String,
        enum: ["customer", "cashier"],
        default: "customer"
      }
    },
    { timestamps: true }
  )
);

const Order = mongoose.model(
  "Order",
  new mongoose.Schema(
    {
      orderCode: { type: String, unique: true, index: true },
      basketId: { type: String, required: true, index: true },
      customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Customer",
        default: null
      },
      customerName: String,
      customerEmail: String,
      items: [
        {
          barcode: String,
          name: String,
          price: Number,
          quantity: { type: Number, default: 1 },
          subtotal: Number
        }
      ],
      total: { type: Number, required: true },
      status: {
        type: String,
        enum: ["OPEN", "PAID", "CANCELLED"],
        default: "OPEN"
      },
      paymentMethod: { type: String, default: "UPI/QR" },
      paidAt: Date
    },
    { timestamps: true }
  )
);

// -------------------- Helpers --------------------

function createToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing in Render environment variables");
  }

  return jwt.sign(
    { id: String(user._id), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : "";

  if (!token) {
    return res.status(401).json({ error: "Please sign in first" });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      error: "Your session expired. Please sign in again."
    });
  }
}

const safeUser = user => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role
});

function handleError(res, error) {
  console.error(error);
  return res.status(500).json({
    error: "Server error. Please check the Render logs."
  });
}

// -------------------- Health checks --------------------

app.get("/", (req, res) => {
  res.json({ ok: true, service: "Smart Basket API" });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "Smart Basket API",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

// -------------------- Authentication --------------------

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body || {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      password.length < 6
    ) {
      return res.status(400).json({
        error: "Name, email and password (minimum 6 characters) are required"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await Customer.findOne({ email: normalizedEmail });

    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const user = await Customer.create({
      name: name.trim(),
      email: normalizedEmail,
      phone,
      passwordHash: await bcrypt.hash(password, 10)
    });

    return res.status(201).json({
      token: createToken(user),
      user: safeUser(user)
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "Email already registered" });
    }
    return handleError(res, error);
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await Customer.findOne({
      email: email.trim().toLowerCase()
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    return res.json({
      token: createToken(user),
      user: safeUser(user)
    });
  } catch (error) {
    return handleError(res, error);
  }
});

app.get("/api/auth/me", auth, async (req, res) => {
  try {
    const user = await Customer.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ user: safeUser(user) });
  } catch (error) {
    return handleError(res, error);
  }
});

// -------------------- Baskets --------------------

app.get("/api/baskets", async (req, res) => {
  try {
    const baskets = await Basket.find()
      .sort({ basketId: 1 })
      .select("basketId status updatedAt customerId");

    return res.json(baskets);
  } catch (error) {
    return handleError(res, error);
  }
});

app.post("/api/baskets/:id/select", auth, async (req, res) => {
  try {
    const basketId = req.params.id.toUpperCase();
    const basket = await Basket.findOne({ basketId });

    if (!basket) {
      return res.status(404).json({ error: "Basket not found" });
    }

    if (
      basket.status !== "AVAILABLE" &&
      String(basket.customerId || "") !== req.user.id
    ) {
      return res.status(409).json({ error: "Basket is already in use" });
    }

    basket.status = "IN_USE";
    basket.customerId = req.user.id;
    await basket.save();

    return res.json({ basket });
  } catch (error) {
    return handleError(res, error);
  }
});

app.post("/api/baskets/:id/release", async (req, res) => {
  try {
    const basket = await Basket.findOne({
      basketId: req.params.id.toUpperCase()
    });

    if (!basket) {
      return res.status(404).json({ error: "Basket not found" });
    }

    basket.status = "AVAILABLE";
    basket.customerId = null;
    await basket.save();

    return res.json({ basket });
  } catch (error) {
    return handleError(res, error);
  }
});

// -------------------- Products --------------------

app.get("/api/products/barcode/:barcode", async (req, res) => {
  try {
    const product = await Product.findOne({ barcode: req.params.barcode });

    if (!product) {
      return res.status(404).json({
        error: "Product not found for this barcode"
      });
    }

    return res.json({ product });
  } catch (error) {
    return handleError(res, error);
  }
});

app.get("/api/products", async (req, res) => {
  try {
    return res.json(await Product.find().sort({ name: 1 }));
  } catch (error) {
    return handleError(res, error);
  }
});

// -------------------- Orders --------------------

app.post("/api/orders", auth, async (req, res) => {
  try {
    const { basketId, items } = req.body || {};

    if (!basketId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: "basketId and at least one item are required"
      });
    }

    const basket = await Basket.findOne({
      basketId: String(basketId).toUpperCase(),
      customerId: req.user.id,
      status: "IN_USE"
    });

    if (!basket) {
      return res.status(409).json({
        error: "Select your basket before creating an order"
      });
    }

    const normalItems = [];

    for (const item of items) {
      const barcode = String(item.barcode || "");
      const product = await Product.findOne({ barcode });

      if (!product) {
        return res.status(400).json({
          error: `Unknown barcode ${barcode}`
        });
      }

      const quantity = Math.max(
        1,
        Math.floor(Number(item.quantity) || 1)
      );

      normalItems.push({
        barcode: product.barcode,
        name: product.name,
        price: product.price,
        quantity,
        subtotal: Number((product.price * quantity).toFixed(2))
      });
    }

    const total = Number(
      normalItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)
    );

    const order = await Order.create({
      orderCode: "SB-" + Date.now().toString(36).toUpperCase(),
      basketId: basket.basketId,
      customerId: req.user.id,
      customerName: req.user.name,
      customerEmail: req.user.email,
      items: normalItems,
      total
    });

    basket.status = "CHECKOUT";
    await basket.save();

    return res.status(201).json({ order });
  } catch (error) {
    return handleError(res, error);
  }
});

app.get("/api/orders/mine", auth, async (req, res) => {
  try {
    const orders = await Order.find({
      customerId: req.user.id
    }).sort({ createdAt: -1 });

    return res.json(orders);
  } catch (error) {
    return handleError(res, error);
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(200);

    return res.json(orders);
  } catch (error) {
    return handleError(res, error);
  }
});

app.get("/api/orders/:id", async (req, res) => {
  try {
    const query = mongoose.isValidObjectId(req.params.id)
      ? { _id: req.params.id }
      : { orderCode: req.params.id };

    const order = await Order.findOne(query);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    return res.json({ order });
  } catch (error) {
    return handleError(res, error);
  }
});

// Demo payment only; this does not verify a real payment.
app.post("/api/orders/:id/pay", async (req, res) => {
  try {
    const query = mongoose.isValidObjectId(req.params.id)
      ? { _id: req.params.id }
      : { orderCode: req.params.id };

    const order = await Order.findOne(query);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status !== "PAID") {
      order.status = "PAID";
      order.paymentMethod = req.body?.paymentMethod || "QR demo";
      order.paidAt = new Date();
      await order.save();
    }

    const basket = await Basket.findOne({ basketId: order.basketId });

    if (basket) {
      basket.status = "AVAILABLE";
      basket.customerId = null;
      await basket.save();
    }

    return res.json({ order, basketReleased: true, demo: true });
  } catch (error) {
    return handleError(res, error);
  }
});

// -------------------- Demo data setup --------------------

app.post("/api/dev/seed", async (req, res) => {
  try {
    const products = [
      { barcode: "8901000000011", name: "Milk 500 ml", price: 32, category: "Dairy" },
      { barcode: "8901000000028", name: "Bread", price: 45, category: "Bakery" },
      { barcode: "8901000000035", name: "Rice 1 kg", price: 68, category: "Grocery" },
      { barcode: "8901000000042", name: "Soap", price: 38, category: "Personal Care" },
      { barcode: "8901000000059", name: "Biscuits", price: 20, category: "Snacks" },
      { barcode: "8901000000066", name: "Cooking Oil 1 L", price: 145, category: "Grocery" }
    ];

    for (const product of products) {
      await Product.updateOne(
        { barcode: product.barcode },
        { $set: product },
        { upsert: true }
      );
    }

    for (let i = 1; i <= 10; i++) {
      await Basket.updateOne(
        { basketId: `B${i}` },
        {
          $setOnInsert: {
            basketId: `B${i}`,
            status: "AVAILABLE"
          }
        },
        { upsert: true }
      );
    }

    return res.json({
      message: "Demo products and baskets B1-B10 created",
      products: products.length,
      baskets: 10,
      barcodes: products.map(product => product.barcode)
    });
  } catch (error) {
    return handleError(res, error);
  }
});

// -------------------- Not found and error handlers --------------------

app.use((req, res) => {
  res.status(404).json({
    error: "API route not found",
    path: req.originalUrl
  });
});

app.use((error, req, res, next) => {
  console.error("Request error:", error);
  if (res.headersSent) return next(error);

  return res.status(500).json({
    error: "Unexpected server error"
  });
});

// -------------------- Start server --------------------

async function startServer() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is missing in Render environment variables");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Smart Basket API running on port ${PORT}`);
      console.log("MongoDB connected");
      console.log("CORS middleware enabled");
    });
  } catch (error) {
    console.error("Could not start API:", error.message);
    process.exit(1);
  }
}

startServer();
