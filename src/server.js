require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http'); // ✅ IMPORT HTTP
const { Server } = require('socket.io'); // ✅ IMPORT SOCKET.IO
const connectDB = require('./config/db');

// --- ROUTE IMPORTS ---
const userRoutes = require('./routes/userRoutes');
const listingRoutes = require('./routes/listingRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const chatRoutes = require('./routes/chatRoutes');
const adminRoutes = require('./routes/adminRoutes'); 
const reviewRoutes = require('./routes/reviewRoutes'); 
const supportRoutes = require('./routes/supportRoutes'); // ✅ IMPORT SUPPORT ROUTE

const app = express();

// ✅ CREATE HTTP SERVER & SOCKET.IO INSTANCE
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' } // Allow React Native to connect
});

// ✅ MAKE `io` AVAILABLE TO YOUR ROUTES
app.set('io', io);

// ✅ HANDLE SOCKET CONNECTIONS
io.on('connection', (socket) => {
  console.log('⚡ A user connected:', socket.id);

  // When a user opens a chat screen, they join a specific "room"
  socket.on('join_chat', (chatId) => {
    socket.join(chatId);
    console.log(`👤 User joined chat room: ${chatId}`);
  });

  socket.on('disconnect', () => {
    console.log('🔴 User disconnected');
  });
});

app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

connectDB();

// --- MOUNT ROUTES ---
app.use('/api/users', userRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/wishlists', wishlistRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/chats', chatRoutes);
app.use('/api/reviews', reviewRoutes); 
app.use('/api/support', supportRoutes); // ✅ MOUNT SUPPORT ROUTE HERE

// ✅ MOUNT ADMIN ROUTES (Protected by middleware)
app.use('/api/admin', adminRoutes); 

app.get('/', (req, res) => {
  res.send('QIN Backend API is running!');
});

const PORT = process.env.PORT || 5000;


server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});