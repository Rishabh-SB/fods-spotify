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

    // Prepare unique tracks set and counts
    const uniqueTracksSet = new Set();
    const topTracksCounts = {};
    const topArtistsCounts = {};
    let totalMsPlayed = 0;
    let totalSkipped = 0;
    let totalPlays = 0;
    let repeatTracks = 0;

    filtered.forEach((e) => {
      const track = e.master_metadata_track_name;
      uniqueTracksSet.add(track);

      topTracksCounts[track] = (topTracksCounts[track] || 0) + 1;
      topArtistsCounts[e.master_metadata_album_artist_name] =
        (topArtistsCounts[e.master_metadata_album_artist_name] || 0) + 1;

      totalMsPlayed += e.ms_played;
      totalSkipped += e.skipped ? 1 : 0;
      totalPlays++;
    });

    repeatTracks = totalPlays - uniqueTracksSet.size;

    // For skipByPlatform etc. you can add raw counts similarly if needed

    // Return all raw data (no pre-computed averages/ratios)
    res.status(200).json({
      top_tracks_counts: topTracksCounts,
      top_artists_counts: topArtistsCounts,
      total_ms_played: totalMsPlayed,
      total_skipped: totalSkipped,
      total_plays: totalPlays,
      repeat_tracks: repeatTracks,
      unique_tracks: [...uniqueTracksSet],
      // If you want skip by platform/artist raw stats include them here
      monthly_new_tracks: {}, // optional, if required
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Error during analysis.", details: err.message });
  }
};
