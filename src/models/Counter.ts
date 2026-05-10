import mongoose, { Schema } from "mongoose";

const CounterSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false },
);

const CounterModel =
  mongoose.models.Counter ?? mongoose.model("Counter", CounterSchema);

export async function nextSequence(name: string): Promise<number> {
  const doc = await CounterModel.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  ).lean<{ seq: number }>();
  return doc!.seq;
}

export default CounterModel;
