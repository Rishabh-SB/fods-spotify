module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed. Use POST." });
    return;
  }

  let data;
  try {
    if (!req.body || typeof req.body === "string") {
      let raw = "";
      await new Promise((resolve) => {
        req.on("data", (chunk) => (raw += chunk));
        req.on("end", resolve);
      });
      data = JSON.parse(raw);
    } else {
      data = req.body;
    }
  } catch (err) {
    res
      .status(400)
      .json({ error: "Invalid JSON in request body", details: err.message });
    return;
  }

  if (!Array.isArray(data) || data.length === 0) {
    res.status(400).json({ error: "JSON data should be a non-empty array" });
    return;
  }

  try {
    // Filter valid entries
    const filtered = data.filter(
      (e) =>
        e.master_metadata_track_name &&
        e.master_metadata_album_artist_name &&
        e.ts &&
        typeof e.ms_played === "number"
    );

    if (filtered.length === 0) {
      res
        .status(400)
        .json({ error: "No valid Spotify listening entries found." });
      return;
    }

    // Parsing and preparing
    filtered.forEach((e) => {
      e.tsDate = new Date(e.ts);
      e.skipped = typeof e.skipped === "boolean" ? e.skipped : false;
    });

    // Helper functions
    const countBy = (array, keyFn) => {
      const counts = {};
      array.forEach((item) => {
        const key = keyFn(item);
        counts[key] = (counts[key] || 0) + 1;
      });
      return counts;
    };
    const sortDesc = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);

    // Wrapped summary
    const topTracksCount = countBy(
      filtered,
      (e) => e.master_metadata_track_name
    );
    const topArtistsCount = countBy(
      filtered,
      (e) => e.master_metadata_album_artist_name
    );

    const topTracks = sortDesc(topTracksCount).slice(0, 10);
    const topArtists = sortDesc(topArtistsCount).slice(0, 10);

    const totalMsPlayed = filtered.reduce((sum, e) => sum + e.ms_played, 0);
    const totalHours = totalMsPlayed / (1000 * 60 * 60);

    // Skip analysis
    const skipCount = filtered.reduce(
      (count, e) => count + (e.skipped ? 1 : 0),
      0
    );
    const skipRate = filtered.length > 0 ? skipCount / filtered.length : 0;

    const skipByPlatformCounts = {};
    filtered.forEach((e) => {
      if (e.platform) {
        if (!skipByPlatformCounts[e.platform]) {
          skipByPlatformCounts[e.platform] = { skipped: 0, total: 0 };
        }
        skipByPlatformCounts[e.platform].skipped += e.skipped ? 1 : 0;
        skipByPlatformCounts[e.platform].total += 1;
      }
    });
    const skipByPlatform = {};
    Object.keys(skipByPlatformCounts).forEach((platform) => {
      const vals = skipByPlatformCounts[platform];
      skipByPlatform[platform] = vals.total ? vals.skipped / vals.total : 0;
    });

    const skipByArtistCounts = {};
    filtered.forEach((e) => {
      const artist = e.master_metadata_album_artist_name;
      if (artist) {
        if (!skipByArtistCounts[artist]) {
          skipByArtistCounts[artist] = { skipped: 0, total: 0 };
        }
        skipByArtistCounts[artist].skipped += e.skipped ? 1 : 0;
        skipByArtistCounts[artist].total += 1;
      }
    });
    const skipByArtistArray = Object.entries(skipByArtistCounts).map(
      ([artist, vals]) => ({
        artist,
        skipRate: vals.total ? vals.skipped / vals.total : 0,
      })
    );
    const skipByArtistSorted = skipByArtistArray
      .sort((a, b) => b.skipRate - a.skipRate)
      .slice(0, 10);
    const skipByArtist = {};
    skipByArtistSorted.forEach((item) => {
      skipByArtist[item.artist] = item.skipRate;
    });

    // Repeat and exploration
    const trackCounts = countBy(filtered, (e) => e.master_metadata_track_name);
    const repeats = Object.values(trackCounts).filter((c) => c > 1).length;
    const totalTracks = Object.values(trackCounts).length;
    const explorationRatio = totalTracks ? 1 - repeats / totalTracks : 0;

    // Monthly new tracks
    const monthlyNewTrackSets = {};
    filtered.forEach((e) => {
      const month = e.ts.substring(0, 7);
      if (!monthlyNewTrackSets[month]) monthlyNewTrackSets[month] = new Set();
      monthlyNewTrackSets[month].add(e.master_metadata_track_name);
    });
    const monthlyNewTracks = {};
    Object.entries(monthlyNewTrackSets).forEach(([month, set]) => {
      monthlyNewTracks[month] = set.size;
    });

    res.status(200).json({
      top_tracks: Object.fromEntries(topTracks),
      top_artists: Object.fromEntries(topArtists),
      total_hours: totalHours,
      skip_rate: skipRate,
      skips_platform: skipByPlatform,
      skips_artist: skipByArtist,
      repeat_tracks: repeats,
      exploration_ratio: explorationRatio,
      monthly_new_tracks: monthlyNewTracks,
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Error during analysis.", details: err.message });
  }
};
