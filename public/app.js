let jsonData = [];

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
  document.getElementById("status").textContent = "Analyzing...";
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(jsonData),
  });
  if (!response.ok) {
    document.getElementById("status").textContent = "Error analyzing data";
    return;
  }
  const result = await response.json();
  document.getElementById("status").textContent = "Analysis complete.";

  displayResults(result);
  drawChart(result.monthly_new_tracks);
}

function displayResults(data) {
  const resDiv = document.getElementById("results");
  resDiv.innerHTML = `
    <h3>Top Tracks</h3><pre>${JSON.stringify(data.top_tracks, null, 2)}</pre>
    <h3>Top Artists</h3><pre>${JSON.stringify(data.top_artists, null, 2)}</pre>
    <h3>Total Listening Hours</h3><p>${data.total_hours.toFixed(2)}</p>
    <h3>Skip Rate</h3><p>${(data.skip_rate * 100).toFixed(2)}%</p>
    <h3>Repeat Tracks</h3><p>${data.repeat_tracks}</p>
    <h3>Exploration Ratio</h3><p>${(data.exploration_ratio * 100).toFixed(
      2
    )}%</p>
  `;
}

let myChart = null;
function drawChart(monthlyData) {
  const ctx = document.getElementById("monthlyChart").getContext("2d");
  if (myChart) myChart.destroy();
  const labels = Object.keys(monthlyData);
  const values = Object.values(monthlyData);
  myChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Unique Tracks Discovered",
          data: values,
          backgroundColor: "#1DB954",
        },
      ],
    },
    options: {
      scales: { y: { beginAtZero: true } },
      plugins: { legend: { display: false } },
    },
  });
}
