import mongoose from "mongoose";

const globalForDb = globalThis as typeof globalThis & {
  __drift_mongoose_promise?: Promise<typeof mongoose>;
};

/**
 * Lazy Mongoose connection.
 *
 * `getDb()` is the only public entry point and is called at request time,
 * not at module load. This lets the Next.js build succeed even when
 * MONGODB_URI is not in the build environment (e.g. local `next build`
 * without a `.env` yet). The actual connection is opened the first time a
 * route needs it, and from that point on it's cached on globalThis to
 * survive HMR + multi-instance serverless redeploys.
 */
async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  return mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, bufferCommands: false });
}

export function getDb() {
  if (!globalForDb.__drift_mongoose_promise) {
    globalForDb.__drift_mongoose_promise = connect();
  }
  return globalForDb.__drift_mongoose_promise.then((m) => m.connection);
}
