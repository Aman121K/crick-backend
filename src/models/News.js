const mongoose = require('mongoose');

const newsSchema = new mongoose.Schema(
  {
    title: {type: String, required: true, trim: true},
    summary: {type: String, required: true, trim: true},
    content: {type: String, default: '', trim: true},
    imageUrl: {type: String, default: '', trim: true},
    thumbnailUrl: {type: String, default: '', trim: true},
    tag: {type: String, default: 'MYCRICKET', trim: true},
    isPublished: {type: Boolean, default: true},
    createdBy: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
  },
  {timestamps: true}
);

module.exports = mongoose.model('News', newsSchema);
