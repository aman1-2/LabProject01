import mongoose from 'mongoose';

const familyMemberSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owner ID is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 100,
    },
    relation: {
      type: String,
      required: [true, 'Relation is required'],
      trim: true,
      maxlength: 50,
    },
    age: {
      type: Number,
      required: [true, 'Age is required'],
      min: [0, 'Age must be non-negative'],
      max: [125, 'Age must be 125 or less'],
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      default: 'other',
    },
  },
  {
    timestamps: true,
  }
);

familyMemberSchema.index({ ownerId: 1, createdAt: -1 });

export const FamilyMember = mongoose.model('FamilyMember', familyMemberSchema);
