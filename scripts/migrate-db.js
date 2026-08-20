const { MongoClient } = require('mongodb');
require('dotenv').config();

// Source MongoDB URI from environment or command line
const sourceUri = process.env.MONGODB_URI;
// Target MongoDB URI passed as first CLI argument
const targetUri = process.argv[2];

if (!targetUri) {
  console.error('\n❌ ERROR: Please provide target MongoDB Connection String as an argument!');
  console.log('\nUsage:');
  console.log('  node scripts/migrate-db.js "mongodb+srv://<user>:<password>@cluster.mongodb.net/test?retryWrites=true&w=majority"\n');
  process.exit(1);
}

async function migrate() {
  console.log('🚀 Starting MongoDB Data Migration...');
  console.log('Source URI:', sourceUri.replace(/:([^@]+)@/, ':****@'));
  console.log('Target URI:', targetUri.replace(/:([^@]+)@/, ':****@'));

  const sourceClient = new MongoClient(sourceUri);
  const targetClient = new MongoClient(targetUri);

  try {
    await sourceClient.connect();
    await targetClient.connect();

    console.log('\n✅ Connected to both MongoDB databases!');

    // Get database handles (uses database name from URI or defaults to 'test')
    const sourceDb = sourceClient.db();
    const targetDb = targetClient.db();

    const collections = await sourceDb.listCollections().toArray();
    console.log(`\nFound ${collections.length} collection(s) to migrate:`, collections.map(c => c.name).join(', '));

    for (const colInfo of collections) {
      const colName = colInfo.name;
      if (colName.startsWith('system.')) continue;

      console.log(`\n📦 Migrating collection: ${colName}...`);
      const docs = await sourceDb.collection(colName).find({}).toArray();

      if (docs.length === 0) {
        console.log(`   └─ Skipping ${colName} (0 documents found)`);
        continue;
      }

      // Clear existing target collection data before copying
      await targetDb.collection(colName).deleteMany({});

      // Insert all documents into target collection
      const result = await targetDb.collection(colName).insertMany(docs);
      console.log(`   └─ Successfully copied ${result.insertedCount} document(s) to target ${colName}`);
    }

    console.log('\n🎉 Migration completed successfully!');
    console.log('Don\'t forget to update MONGODB_URI in rental-backend/.env with your new connection string!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
  } finally {
    await sourceClient.close();
    await targetClient.close();
  }
}

migrate();
