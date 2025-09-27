let jsonData = [];
const batchSize = 1000;
const MAX_CONCURRENT = 2; // Adjust up or down if needed
let aggregatedResults = null;

document.getElementById("fileInput").addEventListener("change", (e) => {
  const files = e.target.files;
  let loadedCount = 0;
  jsonData = [];

  Array.from(files).forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (Array.isArray(data)) {
          jsonData = jsonData.concat(data);
        } else {
          jsonData.push(data);
        }
        loadedCount++;
        if (loadedCount === files.length) {
          document.getElementById(
            "status"
          ).textContent = `${jsonData.length} entries loaded. Ready to analyze.`;
        }
      } catch (err) {
        alert("Error parsing JSON file: " + file.name);
      }
    };
    reader.readAsText(file);
  });
});

async function analyze() {
  if (jsonData.length === 0) {
    alert("No data loaded!");
    return;
  }
  document.getElementById("status").textContent = "Analyzing in parallel...";

  aggregatedResults = initializeEmptyResults();

  const batches = [];
  for (let i = 0; i < jsonData.length; i += batchSize) {
    batches.push(jsonData.slice(i, i + batchSize));
  }

  let processed = 0;
  let inFlight = [];
  let batchIndex = 0;

  async function uploadBatch(batch, idx) {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });
    if (!response.ok) {
      throw new Error(
        `Error analyzing batch starting at index ${idx * batchSize}`
      );
    }
    const batchResult = await response.json();
    return batchResult;
  }

  // Helper function to control concurrency
  async function processInParallel() {
    let results = [];
    while (batchIndex < batches.length || inFlight.length > 0) {
      // Start as many as allowed
      while (inFlight.length < MAX_CONCURRENT && batchIndex < batches.length) {
        const current = batchIndex;
        const promise = uploadBatch(batches[current], current).then(
          (result) => ({ idx: current, result })
        );
        inFlight.push(promise);
        batchIndex++;
      }

      // Wait for first one to finish
      const finished = await Promise.race(inFlight);
      results.push(finished.result);

      // Remove resolved from inFlight
      inFlight = inFlight.filter((p) => p !== finished);
      processed += batchSize;
      document.getElementById("status").textContent = `Processed ${Math.min(
        processed,
        jsonData.length
      )} / ${jsonData.length} entries`;
    }
    return results;
  }

  try {
    const allResults = await processInParallel();
    allResults.forEach((batchResult) => {
      aggregatedResults = mergeResults(aggregatedResults, batchResult);
    });
    document.getElementById("status").textContent = "Analysis complete.";
    displayResults(aggregatedResults);
    drawChart(aggregatedResults.monthly_new_tracks);
  } catch (err) {
    document.getElementById("status").textContent = err.message;
  }
}

// ... keep initializeEmptyResults, mergeResults, mergeCountObjects, weightedAverage, mergeWeightedAverages, displayResults as before ...

function initializeEmptyResults() {
  return {
    top_tracks: {},
    top_artists: {},
    total_hours: 0,
    skip_rate: 0,
    skips_platform: {},
    skips_artist: {},
    repeat_tracks: 0,
    exploration_ratio: 0,
    monthly_new_tracks: {},
  };
}

function mergeResults(agg, batch) {
  // Merge top_tracks and top_artists counts
  agg.top_tracks = mergeCountObjects(agg.top_tracks, batch.top_tracks);
  agg.top_artists = mergeCountObjects(agg.top_artists, batch.top_artists);

  // Sum total hours
  agg.total_hours += batch.total_hours;

  // Weighted average skip rate
  agg.skip_rate = weightedAverage(
    agg.skip_rate,
    agg.total_hours,
    batch.skip_rate,
    batch.total_hours
  );

  // Merge skips_platform and skips_artist (averaged weighted by total_hours per platform/artist)
  agg.skips_platform = mergeWeightedAverages(
    agg.skips_platform,
    batch.skips_platform
  );
  agg.skips_artist = mergeWeightedAverages(
    agg.skips_artist,
    batch.skips_artist
  );

  // For repeat_tracks and exploration_ratio, tricky to merge without all data, so just sum repeats (approximation)
  agg.repeat_tracks += batch.repeat_tracks;
  agg.exploration_ratio = (agg.exploration_ratio + batch.exploration_ratio) / 2;

  // Merge monthly new tracks counts (sum)
  agg.monthly_new_tracks = mergeCountObjects(
    agg.monthly_new_tracks,
    batch.monthly_new_tracks
  );

  return agg;
}

function mergeCountObjects(a, b) {
  const result = { ...a };
  for (const [key, value] of Object.entries(b)) {
    result[key] = (result[key] || 0) + value;
  }
  return result;
}

function weightedAverage(avg1, weight1, avg2, weight2) {
  if (weight1 + weight2 === 0) return 0;
  return (avg1 * weight1 + avg2 * weight2) / (weight1 + weight2);
}

function mergeWeightedAverages(a, b) {
  // Since we don't have counts per keys, just average the values (approximation)
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const result = {};
  keys.forEach((key) => {
    const v1 = a[key] || 0;
    const v2 = b[key] || 0;
    result[key] = (v1 + v2) / ((v1 > 0 ? 1 : 0) + (v2 > 0 ? 1 : 0) || 1);
  });
  return result;
}

function displayResults(data) {
  const resDiv = document.getElementById("results");
  // Convert top_tracks and top_artists to sorted arrays for display
  const sortEntries = (obj) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

  const topTracksSorted = sortEntries(data.top_tracks);
  const topArtistsSorted = sortEntries(data.top_artists);

  let html = "<h3>Top Tracks</h3><ul>";
  topTracksSorted.forEach(([track, count]) => {
    html += `<li>${track}: ${count.toFixed(2)}</li>`;
  });
  html += "</ul>";

  html += "<h3>Top Artists</h3><ul>";
  topArtistsSorted.forEach(([artist, count]) => {
    html += `<li>${artist}: ${count.toFixed(2)}</li>`;
  });
  html += "</ul>";

  html += `<h3>Total Listening Hours</h3><p>${data.total_hours.toFixed(2)}</p>`;
  html += `<h3>Skip Rate</h3><p>${(data.skip_rate * 100).toFixed(2)}%</p>`;
  html += `<h3>Repeat Tracks</h3><p>${data.repeat_tracks}</p>`;
  html += `<h3>Exploration Ratio</h3><p>${(
    data.exploration_ratio * 100
  ).toFixed(2)}%</p>`;

  resDiv.innerHTML = html;
}
