require("dotenv").config();

const express = require("express");

const cors = require("cors");

const helmet = require("helmet");

const morgan = require("morgan");

const http = require("http"); // ✅ IMPORT HTTP

const { Server } = require("socket.io"); // ✅ IMPORT SOCKET.IO

const connectDB = require("./config/db");

// --- ROUTE IMPORTS ---

const userRoutes = require("./routes/userRoutes");

const listingRoutes = require("./routes/listingRoutes");

const wishlistRoutes = require("./routes/wishlistRoutes");

const bookingRoutes = require("./routes/bookingRoutes");

const chatRoutes = require("./routes/chatRoutes");

const adminRoutes = require("./routes/adminRoutes");

const reviewRoutes = require("./routes/reviewRoutes");

const supportRoutes = require("./routes/supportRoutes"); // ✅ IMPORT SUPPORT ROUTE

const paymentRoutes = require("./routes/paymentRoutes");

const fs = require("fs");
const path = require("path");

const app = express();

// Create a write stream for morgan to log to a file
const logStream = fs.createWriteStream(path.join(__dirname, 'server.log'), { flags: 'a' });

// ✅ CREATE HTTP SERVER & SOCKET.IO INSTANCE

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }, // Allow React Native to connect
});

// ✅ MAKE `io` AVAILABLE TO YOUR ROUTES
app.set("io", io);
global.io = io;

// ✅ HANDLE SOCKET CONNECTIONS

io.on("connection", (socket) => {


  // When a user opens a chat screen, they join a specific "room"

  socket.on("join_chat", (chatId) => {
    socket.join(chatId);

  });

  socket.on("join_user", (userId) => {
    socket.join(userId);

  });

  socket.on("disconnect", () => {

  });
});

app.use(cors());
app.disable('etag');

app.use(helmet());

app.use(morgan("dev")); // Keep console logging
app.use(morgan("combined", { stream: logStream })); // Add file logging

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

connectDB();

// --- MOUNT ROUTES ---

app.use("/api/users", userRoutes);

app.use("/api/listings", listingRoutes);

app.use("/api/wishlists", wishlistRoutes);

app.use("/api/bookings", bookingRoutes);

app.use("/api/upload", require("./routes/uploadRoutes"));

app.use("/api/chats", chatRoutes);

app.use("/api/reviews", reviewRoutes);

app.use("/api/support", supportRoutes); // ✅ MOUNT SUPPORT ROUTE HERE
app.use("/api/payment", paymentRoutes);
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/wallet", require("./routes/walletRoutes")); // ✅ MOUNT WALLET ROUTE

// ✅ MOUNT ADMIN ROUTES (Protected by middleware)

app.use("/api/admin", adminRoutes);

app.get("/", (req, res) => {
  res.send("QIN Backend API is running!");
});

const PORT = process.env.PORT || 5000;

// ✅ CHANGE app.listen to server.listen

const { startCronJobs } = require('./utils/cronJobs');
startCronJobs();

server.listen(PORT, () => {

});
