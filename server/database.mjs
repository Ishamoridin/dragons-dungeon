import 'dotenv/config'
import { MongoClient } from 'mongodb'
import { pathToFileURL } from 'node:url'

export function databaseConfig(env = process.env) {
  const configuredUri = env.MONGODB_URI?.trim()
  const uri = (configuredUri && env.MONGO_USERNAME && env.MONGO_PASSWORD
    ? configuredUri.replaceAll('<db_username>', () => encodeURIComponent(env.MONGO_USERNAME)).replaceAll('<db_password>', () => encodeURIComponent(env.MONGO_PASSWORD))
    : configuredUri) || (env.MONGO_USERNAME && env.MONGO_PASSWORD
    ? `mongodb://${encodeURIComponent(env.MONGO_USERNAME)}:${encodeURIComponent(env.MONGO_PASSWORD)}@ac-wiglvce-shard-00-00.btnjg7b.mongodb.net:27017,ac-wiglvce-shard-00-01.btnjg7b.mongodb.net:27017,ac-wiglvce-shard-00-02.btnjg7b.mongodb.net:27017/?ssl=true&replicaSet=atlas-5mxowm-shard-0&authSource=admin`
    : undefined)
  if (!uri || /<db_username>|<db_password>/.test(uri)) {
    throw new Error('Set MONGODB_URI or both MONGO_USERNAME and MONGO_PASSWORD in .env with your Atlas database credentials.')
  }
  if (!/^mongodb(?:\+srv)?:\/\//.test(uri)) {
    throw new Error('MONGODB_URI must be a MongoDB connection string.')
  }
  return { uri, name: env.MONGODB_DB_NAME?.trim() || 'dragons_dungeon' }
}

export async function connectDatabase(env = process.env) {
  const { uri, name } = databaseConfig(env)
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 })
  try {
    await client.connect()
    const database = client.db(name)
    await database.command({ ping: 1 })
    return { client, database }
  } catch {
    await client.close()
    throw new Error('MongoDB connection failed. Check credentials, Atlas network access, and connectivity.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { client } = await connectDatabase()
    await client.close()
    console.log('MongoDB connection verified.')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}