process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const PORT = process.env.PORT || 5000;


require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Movie = require("./models/Movie");
const User = require("./models/User");

const app = express();

const TMDB_KEY = process.env.TMDB_API_KEY;
const TMDB = "https://api.themoviedb.org/3";



/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());

async function tmdb(url) {
    const res = await axios.get(url);
    return res.data;
}
/* ================= DATABASE ================= */
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Error:", err));

/* ================= AUTH MIDDLEWARE ================= */
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch {
        res.status(401).json({ message: "Invalid token" });
    }
};

/* ================= ROOT ================= */
app.get("/", (req, res) => {
    res.send("🍿 PopcornPick Backend Running");
});

/* ================= MOVIES ================= */

/* Fetch from TMDB & store in MongoDB */
app.get("/api/fetch-movies", async (req, res) => {
    try {
        const response = await axios.get(
            "https://api.themoviedb.org/3/trending/movie/day",
            { params: { api_key: process.env.TMDB_API_KEY } }
        );

        for (const m of response.data.results) {
            await Movie.updateOne(
                { tmdbId: m.id },
                {
                    tmdbId: m.id,
                    title: m.title,
                    poster: m.poster_path,
                    rating: m.vote_average,
                    overview: m.overview,
                    language: m.original_language,
                    releaseDate: m.release_date
                },
                { upsert: true }
            );
        }

        res.json({ success: true, count: response.data.results.length });
    } catch (err) {
        res.status(500).json({ error: "TMDB fetch failed" });
    }
});

/* Get movies for frontend */


/* Search movies */
app.get("/api/search", async (req, res) => {
    const q = req.query.q || "";
    const movies = await Movie.find({
        title: { $regex: q, $options: "i" }
    });
    res.json(movies);
});

/* Filter movies */
app.get("/api/filter", async (req, res) => {
    const { rating, language } = req.query;
    let filter = {};
    if (rating) filter.rating = { $gte: Number(rating) };
    if (language) filter.language = language;
    res.json(await Movie.find(filter));
});

/* ================= AUTH ================= */

/* Signup */
app.post("/api/auth/signup", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Basic validation
        if (!name || !email || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }

        // Email format validation (backend safety)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: "Invalid email address" });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: "Email already exists" });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = await User.create({
            name,
            email,
            password: hashedPassword
        });

        // Create JWT
        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        // Send response
        res.json({
            token,
            user: {
                name: user.name,
                email: user.email
            }
        });

    } catch (err) {
        res.status(500).json({ error: "Signup failed" });
    }
});

/* Login */
app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Wrong password" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: "7d"
    });

    res.json({ token, user: { name: user.name, email: user.email } });
});

/* ================= WATCHLIST ================= */
app.post("/api/watchlist/:movieId", authMiddleware, async (req, res) => {
    try {
        const movieId = Number(req.params.movieId);

        if (!movieId) {
            return res.status(400).json({ error: "Invalid movie id" });
        }

        await User.findByIdAndUpdate(
            req.userId,
            { $addToSet: { watchlist: movieId } }
        );

        res.json({ success: true });
    } catch (err) {
        console.error("Watchlist error:", err);
        res.status(500).json({ error: "Server error" });
    }
});



/* Get watchlist */

app.get("/api/watchlist", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(404).json([]);
        }

        // 🔥 return TMDB IDs only
        res.json(user.watchlist || []);
    } catch (err) {
        console.error("Watchlist fetch error:", err);
        res.status(500).json([]);
    }
});

app.get("/api/movies", async (req, res) => {
    try {
        const {
            type = "movie",
            page = 1,
            search = "",
            genre = "",
            rating = "",
            language = ""
        } = req.query;

        if (type !== "movie" && type !== "tv") {
            return res.json({ results: [] });
        }

        let url;

        // 🔍 SEARCH
        if (search && search.trim() !== "") {
            url = `${TMDB}/search/${type}?api_key=${TMDB_KEY}&query=${encodeURIComponent(
                search
            )}&page=${page}`;
        }
        // 🔥 DEFAULT LISTING
        else {
            if (type === "movie") {
                url = `${TMDB}/discover/movie?api_key=${TMDB_KEY}&page=${page}&sort_by=popularity.desc`;
            } else {
                url = `${TMDB}/trending/tv/week?api_key=${TMDB_KEY}&page=${page}`;
            }
        }

        // 🎯 SAFE FILTERS (ONE BY ONE)
        if (genre) {
            const safeGenre = genre.split(",")[0]; // TMDB allows only one
            url += `&with_genres=${safeGenre}`;
        }

        if (rating) {
            url += `&vote_average.gte=${rating}`;
        }

        if (language) {
            url += `&with_original_language=${language}`;
        }

        console.log("TMDB URL:", url);

        const response = await axios.get(url);

        res.json({
            results: Array.isArray(response.data.results)
                ? response.data.results
                : []
        });

    } catch (err) {
        console.error("❌ /api/movies FAILED:", err.message);
        res.json({ results: [] }); // ❗ NEVER 500
    }
});
app.get("/api/trending", async (req, res) => {
    try {
        const type = req.query.type === "tv" ? "tv" : "movie";

        const url = `${TMDB}/trending/${type}/day?api_key=${TMDB_KEY}`;
        console.log("TRENDING URL:", url);

        const response = await axios.get(url);

        res.json({
            results: Array.isArray(response.data.results)
                ? response.data.results
                : []
        });

    } catch (err) {
        console.error("❌ Trending failed:", err.message);
        res.json({ results: [] }); // NEVER crash frontend
    }
});

app.get("/api/movie/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const type = req.query.type || "movie";

        if (type !== "movie" && type !== "tv") {
            return res.status(400).json({ error: "Invalid type" });
        }

        const [details, credits, videos, providers] = await Promise.all([
            tmdb(`${TMDB}/${type}/${id}?api_key=${TMDB_KEY}`),
            tmdb(`${TMDB}/${type}/${id}/credits?api_key=${TMDB_KEY}`),
            tmdb(`${TMDB}/${type}/${id}/videos?api_key=${TMDB_KEY}`),
            tmdb(`${TMDB}/${type}/${id}/watch/providers?api_key=${TMDB_KEY}`)
        ]);

        const trailer =
            videos?.results?.find(
                v => v.type === "Trailer" && v.site === "YouTube"
            ) || null;

        res.json({
            details,
            credits,
            trailerKey: trailer?.key || null,
            ottLink: providers.results?.IN || null
        });
    } catch (err) {
        console.error("❌ Movie/TV details error:", err.message);
        res.status(500).json({ error: "Details fetch failed" });
    }
});
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log("Server running on port", PORT);
});



