import assert from 'node:assert/strict'
import test from 'node:test'
import { databaseConfig } from './database.mjs'

test('requires a configured URI and rejects placeholder credentials', () => {
  assert.throws(() => databaseConfig({}), /Set MONGODB_URI/)
  assert.throws(() => databaseConfig({ MONGODB_URI: 'mongodb+srv://<db_username>:<db_password>@cluster0.btnjg7b.mongodb.net/' }), /Set MONGODB_URI/)
  assert.throws(() => databaseConfig({ MONGODB_URI: 'https://example.com' }), /MongoDB connection string/)
})

test('uses the Atlas URI and an explicit database name', () => {
  const uri = 'mongodb+srv://example:example@cluster0.btnjg7b.mongodb.net/'
  assert.deepEqual(databaseConfig({ MONGODB_URI: uri }), { uri, name: 'dragons_dungeon' })
  assert.equal(databaseConfig({ MONGODB_URI: uri, MONGODB_DB_NAME: 'development' }).name, 'development')
})

test('builds the Atlas URI from separate credentials and encodes special characters', () => {
  const config = databaseConfig({ MONGO_USERNAME: 'example@user', MONGO_PASSWORD: 'example:/?#%password' })
  assert.equal(config.uri, 'mongodb://example%40user:example%3A%2F%3F%23%25password@ac-wiglvce-shard-00-00.btnjg7b.mongodb.net:27017,ac-wiglvce-shard-00-01.btnjg7b.mongodb.net:27017,ac-wiglvce-shard-00-02.btnjg7b.mongodb.net:27017/?ssl=true&replicaSet=atlas-5mxowm-shard-0&authSource=admin')
  assert.equal(config.name, 'dragons_dungeon')
  assert.throws(() => databaseConfig({ MONGO_USERNAME: 'example' }), /Set MONGODB_URI/)
})

test('explicit connection URI takes precedence over separate credentials', () => {
  const uri = 'mongodb://localhost:27017/'
  assert.equal(databaseConfig({ MONGODB_URI: uri, MONGO_USERNAME: 'example', MONGO_PASSWORD: 'example' }).uri, uri)
})

test('fills URI placeholders from separate credentials', () => {
  const config = databaseConfig({
    MONGODB_URI: 'mongodb://<db_username>:<db_password>@localhost:27017/?authSource=admin',
    MONGO_USERNAME: 'example@user',
    MONGO_PASSWORD: 'example$&:/password',
  })
  assert.equal(config.uri, 'mongodb://example%40user:example%24%26%3A%2Fpassword@localhost:27017/?authSource=admin')
})