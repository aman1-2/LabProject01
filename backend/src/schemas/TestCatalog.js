import mongoose from 'mongoose';

const testCatalogSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Test name is required'],
      trim: true,
      index: true,
    },
    slug: {
      type: String,
      required: [true, 'Slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: ['single', 'package', 'imaging', 'plan'],
      index: true,
    },
    sampleType: {
      type: String,
      required: [true, 'Sample type is required'],
      trim: true,
    },
    // CRITICAL per CONTEXT §5.1 & prompt: Imaging tests (MRI, X-Ray, Ultrasound) are false
    homeCollectionAvailable: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    basePrice: {
      type: Number,
      required: [true, 'Base price is required'],
      min: [0, 'Base price cannot be negative'],
    },
    strikePrice: {
      type: Number,
      min: [0, 'Strike price cannot be negative'],
      default: null,
    },
    turnaroundHrs: {
      type: Number,
      required: [true, 'Turnaround time in hours is required'],
      min: [1, 'Turnaround time must be at least 1 hour'],
    },
    prepInstructions: {
      type: String,
      required: [true, 'Preparation instructions are required'],
      trim: true,
    },
    parametersCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    parameters: {
      type: [String],
      default: [],
    },
    description: {
      type: String,
      required: [true, 'Clinical description is required'],
      trim: true,
    },
    frequency: {
      type: String,
      trim: true,
      default: null, // e.g. 'Every 3 months' for care plans
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
    tags: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

testCatalogSchema.index({ category: 1, basePrice: 1 });
testCatalogSchema.index({ name: 'text', description: 'text' });

export const TestCatalog = mongoose.models.TestCatalog || mongoose.model('TestCatalog', testCatalogSchema);
export default TestCatalog;
