let jsonData = [];
const batchSize = 2000;
const MAX_CONCURRENT = 25;
let aggregatedResults = null;
let timerInterval = null;
let startTime = null;

function updateProgress(entriesProcessed, totalEntries) {
  const percentage = (entriesProcessed / totalEntries) * 100;
  document.getElementById("progressBar").style.width = percentage + "%";
  document.getElementById(
    "batchProgressText"
  ).textContent = `Processed ${entriesProcessed} of ${totalEntries} entries (${percentage.toFixed(
    1
  )}%)`;
}

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

function startLiveTimer() {
  startTime = Date.now();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const elapsedMs = Date.now() - startTime;
    const elapsedSeconds = (elapsedMs / 1000).toFixed(2);
    document.getElementById(
      "timerText"
    ).textContent = `Time elapsed: ${elapsedSeconds} seconds`;
  }, 10);
}

function stopLiveTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

async function analyze() {
  if (jsonData.length === 0) {
    alert("No data loaded!");
    return;
  }
  document.getElementById("status").textContent = "Analyzing in parallel...";
  updateProgress(0, jsonData.length);
  startLiveTimer();

  aggregatedResults = initializeEmptyResults();
  const batches = [];
  for (let i = 0; i < jsonData.length; i += batchSize) {
    batches.push(jsonData.slice(i, i + batchSize));
  }

  let completed = 0;
  for (let i = 0; i < batches.length; i += MAX_CONCURRENT) {
    const currentBatches = batches.slice(i, i + MAX_CONCURRENT);
    const promises = currentBatches.map((batch, idx) =>
      fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      }).then((response) => {
        if (!response.ok) throw new Error(`Error in batch ${i + idx + 1}`);
        return response.json();
      })
    );
    const results = await Promise.all(promises);
    results.forEach((batchResult) => {
      aggregatedResults = mergeResults(aggregatedResults, batchResult);
    });

    completed += currentBatches.length * batchSize;
    if (completed > jsonData.length) completed = jsonData.length;
    updateProgress(completed, jsonData.length);
  }

  stopLiveTimer();
  document.getElementById("status").textContent = "Analysis complete.";

  // Compute final metrics from raw aggregated data
  const total_hours = aggregatedResults.total_ms_played / (1000 * 60 * 60);
  const skip_rate = aggregatedResults.total_plays
    ? aggregatedResults.total_skipped / aggregatedResults.total_plays
    : 0;
  const repeat_tracks = aggregatedResults.repeat_tracks;
  const exploration_ratio = aggregatedResults.total_plays
    ? aggregatedResults.unique_tracks.size / aggregatedResults.total_plays
    : 0;

  // Sort top tracks and artists
  const top_tracks_sorted = Object.entries(aggregatedResults.top_tracks_counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const top_artists_sorted = Object.entries(
    aggregatedResults.top_artists_counts
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  displayResults({
    top_tracks: Object.fromEntries(top_tracks_sorted),
    top_artists: Object.fromEntries(top_artists_sorted),
    total_hours,
    skip_rate,
    repeat_tracks,
    exploration_ratio,
  });

  const elapsedMs = Date.now() - startTime;
  const elapsedSeconds = (elapsedMs / 1000).toFixed(1);
  document.getElementById(
    "timerText"
  ).textContent = `Total time: ${elapsedSeconds} seconds`;
}

function initializeEmptyResults() {
  return {
    top_tracks_counts: {},
    top_artists_counts: {},
    total_ms_played: 0,
    total_skipped: 0,
    total_plays: 0,
    repeat_tracks: 0,
    unique_tracks: new Set(),
  };
}

function mergeResults(acc, batch) {
  for (const [track, count] of Object.entries(batch.top_tracks_counts)) {
    acc.top_tracks_counts[track] = (acc.top_tracks_counts[track] || 0) + count;
  }

  for (const [artist, count] of Object.entries(batch.top_artists_counts)) {
    acc.top_artists_counts[artist] =
      (acc.top_artists_counts[artist] || 0) + count;
  }

  acc.total_ms_played += batch.total_ms_played || 0;
  acc.total_skipped += batch.total_skipped || 0;
  acc.total_plays += batch.total_plays || 0;
  acc.repeat_tracks += batch.repeat_tracks || 0;

  if (batch.unique_tracks && Array.isArray(batch.unique_tracks)) {
    batch.unique_tracks.forEach((t) => acc.unique_tracks.add(t));
  }

  return acc;
}

// Your existing displayResults function to render final summary
function displayResults(data) {
  const resDiv = document.getElementById("results");
  const sortEntries = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);

  const topArtistEntry = sortEntries(data.top_artists)[0];
  const topTracksList = sortEntries(data.top_tracks).slice(0, 10);

  let html = `<p><b>Top Artist:</b> ${
    topArtistEntry ? topArtistEntry[0] : "None"
  } (${topArtistEntry ? topArtistEntry[1].toFixed(2) : "0"} plays)</p>`;
  html += `<b>Top Tracks:</b><ul>`;
  topTracksList.forEach(([track, count]) => {
    html += `<li>${track}: ${count.toFixed(2)}</li>`;
  });
  html += `</ul>`;

  html += `<p><b>Total Listening Hours:</b> ${data.total_hours.toFixed(2)}</p>`;
  html += `<p><b>Skip Rate:</b> ${(data.skip_rate * 100).toFixed(2)}%</p>`;
  html += `<p><b>Repeat Tracks:</b> ${data.repeat_tracks}</p>`;
  html += `<p><b>Exploration Ratio:</b> ${(
    data.exploration_ratio * 100
  ).toFixed(2)}%</p>`;

  resDiv.innerHTML = html;
}
