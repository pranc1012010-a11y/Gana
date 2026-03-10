require("dotenv").config()
const express = require("express")
const mongoose = require("mongoose")
const multer = require("multer")
const path = require("path")
const cors = require("cors")
const Stripe = require("stripe")
const OpenAI = require("openai")

const app = express()
const stripe = Stripe(process.env.STRIPE_KEY)
const openai = new OpenAI({apiKey: process.env.OPENAI_KEY})

app.use(cors())
app.use(express.json())
app.use("/uploads", express.static("uploads"))

mongoose.connect(process.env.MONGO_URI).then(()=>console.log("DB connected"))

const productSchema = new mongoose.Schema({name:String, price:Number, image:String})
const Product = mongoose.model("Product", productSchema)

const orderSchema = new mongoose.Schema({items:Array, total:Number, date:{type:Date,default:Date.now}})
const Order = mongoose.model("Order", orderSchema)

// File upload
const storage = multer.diskStorage({
destination:"uploads/",
filename:(req,file,cb)=>cb(null,Date.now()+path.extname(file.originalname))
})
const upload = multer({storage})

// Routes
app.get("/products", async (req,res)=>{
  const products = await Product.find()
  res.json(products)
})

// AI Recommendations (OpenAI)
app.get("/recommend", async (req,res)=>{
  const products = await Product.find()
  const names = products.map(p=>p.name).join(", ")
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{role:"user", content:`From these products: ${names}, suggest 3 items for a fashion enthusiast.`}]
  })
  const suggested = response.choices[0].message.content.split(",").map(n=>n.trim())
  const recommended = products.filter(p=>suggested.includes(p.name))
  res.json(recommended)
})

app.post("/products", upload.single("image"), async (req,res)=>{
  const {name, price} = req.body
  const product = new Product({name, price, image:req.file.filename})
  await product.save()
  res.json(product)
})

// Checkout with Stripe
app.post("/checkout", async (req,res)=>{
  const {items} = req.body
  const session = await stripe.checkout.sessions.create({
    payment_method_types:["card"],
    line_items: items.map(p=>({price_data:{currency:"usd",product_data:{name:p.name},unit_amount:p.price*100},quantity:1})),
    mode:"payment",
    success_url:"http://localhost:3000/front.html",
    cancel_url:"http://localhost:3000/front.html"
  })
  res.json({url:session.url})
})

app.get("/orders", async (req,res)=>{
  const orders = await Order.find()
  res.json(orders)
})

app.listen(3000,()=>console.log("Backend running on http://localhost:3000"))
