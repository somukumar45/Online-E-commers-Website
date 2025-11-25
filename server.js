const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();
const PORT = 3000;

// Use environment variable OR fallback to your string (for local testing)
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://gucartUser:password%40123@cluster0.rpmejli.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// 1. Connect to MongoDB
mongoose.connect(MONGO_URI)
.then(() => console.log("✅ MongoDB Connected Successfully!"))
.catch(err => console.log("❌ MongoDB Connection Error:", err));

// 2. Middleware
// URL Encoded is for HTML Forms (Login/Signup)
app.use(bodyParser.urlencoded({ extended: true }));
// JSON is for API Fetch Requests (Checkout Page) <--- NEW & CRITICAL
app.use(bodyParser.json()); 
app.use(express.static(path.join(__dirname, 'public')));

// --- USER MODEL ---
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'buyer' } // buyer, seller, admin
});
const User = mongoose.model('User', userSchema);

// --- PRODUCT MODEL ---
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    description: String,
    image: String,
    category: String,
    sellerEmail: String 
});
const Product = mongoose.model('Product', productSchema);

// --- ORDER MODEL (NEW) ---
const orderSchema = new mongoose.Schema({
    customerName: String,
    address: String,
    city: String,
    zip: String,
    totalAmount: Number,
    items: Array, // Stores the list of products bought
    status: { type: String, default: 'Pending' }, // Pending, Shipped, Delivered
    date: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);


// --- ROUTES ---

// HTML Pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/cart', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cart.html')));
app.get('/product', (req, res) => res.sendFile(path.join(__dirname, 'public', 'SingleProductDetailPage.html')));
app.get('/seller', (req, res) => res.sendFile(path.join(__dirname, 'public', 'SellerDashboardHomepage&SalesPerformance.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'AdminDashboardHomepage&SystemMonitoring.html')));
app.get('/checkout', (req, res) => res.sendFile(path.join(__dirname, 'public', 'checkout.html'))); // NEW

// User Logic
app.post('/signup', async (req, res) => {
    try {
        const { email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.send("User already exists. <a href='/login'>Login here</a>");
        
        const newUser = new User({ email, password });
        await newUser.save();
        res.send("<h1>Registration Successful! <a href='/login'>Login here</a></h1>");
    } catch (err) {
        res.status(500).send("Error registering user.");
    }
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        
        if (!user || user.password !== password) {
            return res.send("Invalid email or password. <a href='/login'>Try again</a>");
        }

        if (user.role === 'admin') {
            res.redirect('/admin');
        } else if (user.role === 'seller') {
            res.redirect('/seller');
        } else {
            res.redirect('/'); 
        }
    } catch (err) {
        res.status(500).send("Login Error.");
    }
});

// Product Logic
app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        res.json(product);
    } catch (err) {
        res.status(500).send("Error fetching product");
    }
});

app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find(); 
        res.json(products); 
    } catch (err) {
        res.status(500).send("Error fetching products");
    }
});

app.post('/add-product', async (req, res) => {
    try {
        const { name, price, description, image, category, sellerEmail } = req.body;
        const newProduct = new Product({ name, price, description, image, category, sellerEmail });
        await newProduct.save();
        res.send("<h1>Product Added! <a href='/seller'>Go back</a></h1>");
    } catch (err) {
        res.status(500).send("Error adding product");
    }
});

// Order Logic (NEW)
app.post('/api/orders', async (req, res) => {
    try {
        const newOrder = new Order(req.body);
        await newOrder.save();
        res.json({ success: true, orderId: newOrder._id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Error placing order" });
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ date: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).send("Error fetching orders");
    }
});

// 4. Update Order Status (Admin Only)
app.put('/api/orders/:id', async (req, res) => {
    try {
        const { status } = req.body;
        await Order.findByIdAndUpdate(req.params.id, { status: status });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error updating order" });
    }
});

// 5. Get Dashboard Stats (Sales & Inventory)
app.get('/api/dashboard-stats', async (req, res) => {
    try {
        // 1. Get Total Products
        const totalProducts = await Product.countDocuments();

        // 2. Get All Orders to calculate sales
        const orders = await Order.find();
        
        let totalRevenue = 0;
        let salesData = {}; // To store sales per day (e.g., "Oct 24": 500)

        orders.forEach(order => {
            totalRevenue += order.totalAmount;
            
            // Format date to "Mon DD" (e.g., "Nov 23")
            const dateStr = new Date(order.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            
            if (salesData[dateStr]) {
                salesData[dateStr] += order.totalAmount;
            } else {
                salesData[dateStr] = order.totalAmount;
            }
        });

        // Convert object to arrays for the Chart
        const labels = Object.keys(salesData); // Dates
        const data = Object.values(salesData); // Money amounts

        res.json({
            totalProducts,
            totalOrders: orders.length,
            totalRevenue,
            chart: { labels, data }
        });

    } catch (err) {
        res.status(500).send("Error fetching stats");
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});