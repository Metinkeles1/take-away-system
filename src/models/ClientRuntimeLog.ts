import mongoose, { Schema } from "mongoose";

export const CLIENT_LOG_RETENTION_DAYS = 30;

const ClientRuntimeLogSchema = new Schema(
  {
    at: { type: Date, required: true },
    kind: { type: String, required: true },
    message: String,
    path: String,
    href: String,
    online: Boolean,
    userAgent: String,
    language: String,
    platform: String,
    details: Schema.Types.Mixed,
  },
  { versionKey: false },
);

ClientRuntimeLogSchema.index({ at: -1 });
ClientRuntimeLogSchema.index(
  { at: 1 },
  { expireAfterSeconds: CLIENT_LOG_RETENTION_DAYS * 24 * 60 * 60 },
);

if (process.env.NODE_ENV !== "production" && mongoose.models.ClientRuntimeLog) {
  mongoose.deleteModel("ClientRuntimeLog");
}

const ClientRuntimeLogModel =
  mongoose.models.ClientRuntimeLog ??
  mongoose.model("ClientRuntimeLog", ClientRuntimeLogSchema);

export default ClientRuntimeLogModel;
