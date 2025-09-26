const { parse } = require("date-fns");

function countBy(array, keyFn) {
  const counts = {};
  array.forEach((item) => {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function sortDesc(obj) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const data = req.body;

  // Filter valid entries with track and artist names
  const filtered = data.filter(
    (e) => e.master_metadata_track_name && e.master_metadata_album_artist_name
  );

  // Parsing dates and preparing fields
  filtered.forEach((e) => {
    e.tsDate = new Date(e.ts);
    e.skipped = typeof e.skipped === "boolean" ? e.skipped : false;
    e.ms_played = e.ms_played || 0;
  });

  // Wrapped Summary
  const topTracksCount = countBy(filtered, (e) => e.master_metadata_track_name);
  const topArtistsCount = countBy(
    filtered,
    (e) => e.master_metadata_album_artist_name
  );

  const topTracks = sortDesc(topTracksCount).slice(0, 10);
  const topArtists = sortDesc(topArtistsCount).slice(0, 10);

  const totalMsPlayed = filtered.reduce((sum, e) => sum + e.ms_played, 0);
  const totalHours = totalMsPlayed / (1000 * 60 * 60);

  // Skip Analysis
  const skipCount = filtered.reduce(
    (count, e) => count + (e.skipped ? 1 : 0),
    0
  );
  const skipRate = filtered.length > 0 ? skipCount / filtered.length : 0;

  const skipByPlatform = {};
  filtered.forEach((e) => {
    if (e.platform) {
      skipByPlatform[e.platform] = skipByPlatform[e.platform] || {
        skipped: 0,
        total: 0,
      };
      skipByPlatform[e.platform].skipped += e.skipped ? 1 : 0;
      skipByPlatform[e.platform].total += 1;
    }
  });
  Object.keys(skipByPlatform).forEach((key) => {
    skipByPlatform[key] =
      skipByPlatform[key].total > 0
        ? skipByPlatform[key].skipped / skipByPlatform[key].total
        : 0;
  });

  const skipByArtistCount = {};
  filtered.forEach((e) => {
    let artist = e.master_metadata_album_artist_name;
    if (artist) {
      skipByArtistCount[artist] = skipByArtistCount[artist] || {
        skipped: 0,
        total: 0,
      };
      skipByArtistCount[artist].skipped += e.skipped ? 1 : 0;
      skipByArtistCount[artist].total += 1;
    }
  });
  const skipByArtist = {};
  Object.entries(skipByArtistCount)
    .sort((a, b) => b[1].skipped / b[1].total - a[1].skipped / a[1].total)
    .slice(0, 10)
    .forEach(([artist, val]) => {
      skipByArtist[artist] = val.total > 0 ? val.skipped / val.total : 0;
    });

  // Repeat vs Exploration
  const trackCounts = countBy(filtered, (e) => e.master_metadata_track_name);
  const repeats = Object.values(trackCounts).filter((c) => c > 1).length;
  const totalTracks = Object.values(trackCounts).length;
  const explorationRatio = totalTracks > 0 ? 1 - repeats / totalTracks : 0;

  const monthlyNewTracks = {};
  filtered.forEach((e) => {
    const month = e.ts.substring(0, 7);
    if (!monthlyNewTracks[month]) monthlyNewTracks[month] = new Set();
    monthlyNewTracks[month].add(e.master_metadata_track_name);
  });
  const monthlyNewCounts = {};
  Object.entries(monthlyNewTracks).forEach(([month, set]) => {
    monthlyNewCounts[month] = set.size;
  });

  // Compose response
  res.status(200).json({
    top_tracks: Object.fromEntries(topTracks),
    top_artists: Object.fromEntries(topArtists),
    total_hours: totalHours,
    skip_rate: skipRate,
    skips_platform: skipByPlatform,
    skips_artist: skipByArtist,
    repeat_tracks: repeats,
    exploration_ratio: explorationRatio,
    monthly_new_tracks: monthlyNewCounts,
  });
};
