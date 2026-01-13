const mongoose = require("mongoose");

const movieSchema = new mongoose.Schema({
    tmdbId: { type: Number, unique: true },
    title: String,
    poster: String,
    rating: Number,
    overview: String
});

module.exports = mongoose.model("Movie", movieSchema);
