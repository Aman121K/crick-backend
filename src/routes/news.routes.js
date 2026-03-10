const express = require('express');
const News = require('../models/News');

const router = express.Router();

router.get('/public', async (_req, res) => {
  try {
    const items = await News.find({isPublished: true})
      .sort({createdAt: -1})
      .select('_id title summary content imageUrl thumbnailUrl tag createdAt createdBy')
      .populate('createdBy', 'name');

    return res.json({items});
  } catch (error) {
    return res.status(500).json({message: 'Failed to fetch news'});
  }
});

module.exports = router;
