import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

dotenv.config();
const app = express();
app.use(express.json({ limit: "1mb" }));
const origins = (process.env.CLIENT_ORIGINS || "*").split(",").map(s => s.trim());
app.use(cors({ origin: (origin, cb) => !origin || origins.includes("*") || origins.includes(origin) ? cb(null, true) : cb(new Error("Origin not allowed")) }));

const Product = mongoose.model("Product", new mongoose.Schema({
  barcode: {type:String, unique:true, required:true, index:true},
  name: {type:String, required:true}, price: {type:Number, required:true, min:0},
  category: {type:String, default:"General"}, stock: {type:Number, default:100}, imageUrl:String
}, {timestamps:true}));
const Basket = mongoose.model("Basket", new mongoose.Schema({
  basketId:{type:String,unique:true,required:true}, status:{type:String,enum:["AVAILABLE","IN_USE","CHECKOUT"],default:"AVAILABLE"},
  customerId:{type:mongoose.Schema.Types.ObjectId,ref:"Customer",default:null}, updatedAt:{type:Date,default:Date.now}
},{timestamps:true}));
const Customer = mongoose.model("Customer", new mongoose.Schema({
  name:{type:String,required:true}, email:{type:String,unique:true,required:true,lowercase:true},
  phone:String, passwordHash:{type:String,required:true}, role:{type:String,enum:["customer","cashier"],default:"customer"}
},{timestamps:true}));
const Order = mongoose.model("Order", new mongoose.Schema({
  orderCode:{type:String,unique:true,index:true}, basketId:{type:String,required:true,index:true},
  customerId:{type:mongoose.Schema.Types.ObjectId,ref:"Customer",default:null},
  customerName:String, customerEmail:String,
  items:[{barcode:String,name:String,price:Number,quantity:{type:Number,default:1},subtotal:Number}],
  total:{type:Number,required:true}, status:{type:String,enum:["OPEN","PAID","CANCELLED"],default:"OPEN"},
  paymentMethod:{type:String,default:"UPI/QR"}, paidAt:Date, createdAt:{type:Date,default:Date.now}
},{timestamps:true}));

function auth(req,res,next){
  const token=(req.headers.authorization||"").replace(/^Bearer /,"");
  try { req.user=jwt.verify(token,process.env.JWT_SECRET); next(); }
  catch { return res.status(401).json({error:"Sign in again to continue"}); }
}
const safeUser=u=>({id:u._id,name:u.name,email:u.email,phone:u.phone,role:u.role});
app.get("/api/health",(_,res)=>res.json({ok:true,service:"Smart Basket API"}));

app.post("/api/auth/register",async(req,res)=>{
  try{
    const {name,email,phone,password}=req.body||{};
    if(!name||!email||!password||password.length<6) return res.status(400).json({error:"Name, email and password (6+ characters) are required"});
    if(await Customer.findOne({email:email.toLowerCase()})) return res.status(409).json({error:"Email already registered"});
    const user=await Customer.create({name,email:email.toLowerCase(),phone,passwordHash:await bcrypt.hash(password,10)});
    const token=jwt.sign({id:String(user._id),role:user.role},process.env.JWT_SECRET,{expiresIn:"7d"});
    res.json({token,user:safeUser(user)});
  }catch(e){res.status(500).json({error:e.message});}
});
app.post("/api/auth/login",async(req,res)=>{
  const {email,password}=req.body||{};
  const user=await Customer.findOne({email:(email||"").toLowerCase()});
  if(!user||!await bcrypt.compare(password||"",user.passwordHash)) return res.status(401).json({error:"Invalid email or password"});
  const token=jwt.sign({id:String(user._id),role:user.role},process.env.JWT_SECRET,{expiresIn:"7d"});
  res.json({token,user:safeUser(user)});
});
app.get("/api/auth/me",auth,async(req,res)=>{const u=await Customer.findById(req.user.id); if(!u)return res.status(404).json({error:"User not found"});res.json({user:safeUser(u)});});

app.get("/api/baskets",async(_,res)=>res.json(await Basket.find().sort({basketId:1}).select("basketId status updatedAt customerId")));
app.post("/api/baskets/:id/select",auth,async(req,res)=>{
  const id=req.params.id.toUpperCase();
  const b=await Basket.findOne({basketId:id});
  if(!b)return res.status(404).json({error:"Basket not found"});
  if(b.status!=="AVAILABLE" && String(b.customerId||"")!==req.user.id)return res.status(409).json({error:"Basket is already in use"});
  b.status="IN_USE";b.customerId=req.user.id;await b.save();
  res.json({basket:b});
});
app.get("/api/products/barcode/:barcode",async(req,res)=>{
  const p=await Product.findOne({barcode:req.params.barcode});
  if(!p)return res.status(404).json({error:"Product not found for this barcode"});
  res.json({product:p});
});
app.get("/api/products",async(req,res)=>res.json(await Product.find().sort({name:1})));

app.post("/api/orders",auth,async(req,res)=>{
  try{
    const {basketId,items}=req.body||{};
    if(!basketId||!Array.isArray(items)||!items.length)return res.status(400).json({error:"basketId and at least one item are required"});
    const basket=await Basket.findOne({basketId:basketId.toUpperCase(),customerId:req.user.id,status:"IN_USE"});
    if(!basket)return res.status(409).json({error:"Select your basket before creating an order"});
    const normal=[];
    for(const item of items){
      const p=await Product.findOne({barcode:String(item.barcode)});
      if(!p)return res.status(400).json({error:`Unknown barcode ${item.barcode}`});
      const qty=Math.max(1,Math.floor(Number(item.quantity)||1));
      normal.push({barcode:p.barcode,name:p.name,price:p.price,quantity:qty,subtotal:Number((p.price*qty).toFixed(2))});
    }
    const total=Number(normal.reduce((s,i)=>s+i.subtotal,0).toFixed(2));
    const order=await Order.create({orderCode:"SB-"+Date.now().toString(36).toUpperCase(),basketId:basket.basketId,customerId:req.user.id,customerName:req.user.name,customerEmail:req.user.email,items:normal,total});
    basket.status="CHECKOUT";await basket.save();
    res.status(201).json({order});
  }catch(e){res.status(500).json({error:e.message});}
});
app.get("/api/orders/mine",auth,async(req,res)=>res.json(await Order.find({customerId:req.user.id}).sort({createdAt:-1})));
app.get("/api/orders",async(req,res)=>{
  // Starter demo endpoint for cashier screen. Add cashier-role auth before public production use.
  const filter=req.query.status?{status:req.query.status}:{};
  res.json(await Order.find(filter).sort({createdAt:-1}).limit(200));
});
app.get("/api/orders/:id",async(req,res)=>{
  const q=mongoose.isValidObjectId(req.params.id)?{_id:req.params.id}:{orderCode:req.params.id};
  const order=await Order.findOne(q);if(!order)return res.status(404).json({error:"Order not found"});res.json({order});
});
app.post("/api/orders/:id/pay",async(req,res)=>{
  // DEMO payment confirmation only; do not treat this endpoint as real payment verification.
  const q=mongoose.isValidObjectId(req.params.id)?{_id:req.params.id}:{orderCode:req.params.id};
  const order=await Order.findOne(q);if(!order)return res.status(404).json({error:"Order not found"});
  if(order.status!=="PAID"){order.status="PAID";order.paymentMethod=req.body?.paymentMethod||"QR demo";order.paidAt=new Date();await order.save();}
  const basket=await Basket.findOne({basketId:order.basketId});if(basket){basket.status="AVAILABLE";basket.customerId=null;await basket.save();}
  res.json({order,basketReleased:true,demo:true});
});
app.post("/api/baskets/:id/release",async(req,res)=>{
  const b=await Basket.findOne({basketId:req.params.id.toUpperCase()});if(!b)return res.status(404).json({error:"Basket not found"});
  b.status="AVAILABLE";b.customerId=null;await b.save();res.json({basket:b});
});
app.post("/api/dev/seed",async(_,res)=>{
  const products=[
    {barcode:"8901000000011",name:"Milk 500 ml",price:32,category:"Dairy"},
    {barcode:"8901000000028",name:"Bread",price:45,category:"Bakery"},
    {barcode:"8901000000035",name:"Rice 1 kg",price:68,category:"Grocery"},
    {barcode:"8901000000042",name:"Soap",price:38,category:"Personal Care"},
    {barcode:"8901000000059",name:"Biscuits",price:20,category:"Snacks"},
    {barcode:"8901000000066",name:"Cooking Oil 1 L",price:145,category:"Grocery"}
  ];
  for(const p of products)await Product.updateOne({barcode:p.barcode},{$set:p},{upsert:true});
  for(let i=1;i<=10;i++)await Basket.updateOne({basketId:`B${i}`},{$setOnInsert:{basketId:`B${i}`,status:"AVAILABLE"}},{upsert:true});
  res.json({message:"Seeded demo products and baskets B1-B10",products:products.length,baskets:10,barcodes:products.map(p=>p.barcode)});
});
const port=process.env.PORT||8080;
mongoose.connect(process.env.MONGODB_URI).then(()=>{app.listen(port,()=>console.log(`Smart Basket API running on ${port}`));}).catch(e=>{console.error("MongoDB connection failed:",e.message);process.exit(1);});
