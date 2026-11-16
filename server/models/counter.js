import mongoose from 'mongoose'

// Products keep short numeric ids (the catalogue started with DummyJSON's 1 to 194), so
// new ones take the next number from this counter instead of a Mongo ObjectId.
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    value: { type: Number, default: 0 }
  },
  { versionKey: false }
)

const Counter = mongoose.model('Counter', counterSchema)

// $inc is atomic, so two admins adding products at once can never get the same number.
export async function nextSequence(name) {
  const counter = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { value: 1 } },
    { returnDocument: 'after', upsert: true }
  )
  return counter.value
}

// Moves the counter past the highest id already in use, after a seed for example.
export async function syncSequence(name, highest) {
  await Counter.updateOne({ _id: name }, { $max: { value: highest } }, { upsert: true })
}

export default Counter
