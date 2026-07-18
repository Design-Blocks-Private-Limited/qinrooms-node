const mongoose = require('mongoose');
const Listing = require('./src/models/Listing');

const uri = "mongodb://darkgaming8373:dark@ac-lnj99xu-shard-00-00.nvjzesc.mongodb.net:27017,ac-lnj99xu-shard-00-01.nvjzesc.mongodb.net:27017,ac-lnj99xu-shard-00-02.nvjzesc.mongodb.net:27017/?ssl=true&replicaSet=atlas-7ogede-shard-0&authSource=admin&appName=Cluster0";

async function main() {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(uri);
    console.log("Connected successfully!");

    const hostId = "6a1e9dc4fb33ffea25c637fb";
    
    console.log(`Querying listings for hostId: ${hostId} with NO type:`);
    const allListings = await Listing.find({ hostId });
    console.log(`Found ${allListings.length} listings:`);
    allListings.forEach(l => console.log(`- ${l.title} (${l.type})`));

    console.log(`\nQuerying listings for hostId: ${hostId} with type: 'dorm':`);
    const dormListings = await Listing.find({ hostId, type: 'dorm' });
    console.log(`Found ${dormListings.length} listings:`);
    dormListings.forEach(l => console.log(`- ${l.title} (${l.type})`));

    console.log(`\nQuerying listings for hostId: ${hostId} with type: 'hotel':`);
    const hotelListings = await Listing.find({ hostId, type: 'hotel' });
    console.log(`Found ${hotelListings.length} listings:`);
    hotelListings.forEach(l => console.log(`- ${l.title} (${l.type})`));

    await mongoose.disconnect();
}

main().catch(err => console.error(err));
