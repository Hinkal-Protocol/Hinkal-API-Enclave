import mongoose, { Schema } from 'mongoose';

const RequestIdSchema = new Schema({
  requestId: { type: String, required: true, unique: true },
});

const RequestIdModel = mongoose.model('RequestId', RequestIdSchema);

export const consumeRequestId = async (requestId: string): Promise<boolean> => {
  try {
    await RequestIdModel.create({ requestId });
    return true;
  } catch {
    return false;
  }
};
