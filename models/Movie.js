const mongoose = require("mongoose");

const MovieSchema = new mongoose.Schema({
    tmdbId: Number,
    title: String,
    poster: String,
    rating: Number,
    overview: String,
    language: String,
    releaseDate: String
});

module.exports = mongoose.model("Movie", MovieSchema);
