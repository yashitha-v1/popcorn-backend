const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,

    // store TMDB IDs directly
    watchlist: {
        type: [Number],
        default: []
    }
});

module.exports = mongoose.model("User", userSchema);
