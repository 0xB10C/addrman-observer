const statsTable = d3.select("#stats");

let state = init_addrman_tables(
  NEW_HEIGHT,
  "#canvas",
  "#canvas_highlight",
);

draw(false, state);

function processGetRawAddrman(addrman) {
  state = init_addrman_tables(
    NEW_HEIGHT,
    "#canvas",
    "#canvas_highlight",
  );

  stats = {
    minNTime: +Infinity,
    maxNTime: -Infinity,
  }

  for (const table_name of ["new", "tried"]) {
    for (const bucket_position in addrman[table_name]) {
      entry = addrman[table_name][bucket_position];
      entry["bucket"] = parseInt(bucket_position.split("/")[0]);
      entry["position"] = parseInt(bucket_position.split("/")[1]);
      entry["table"] = table_name;
      state.tables[table_name].table[entry.bucket * 64 + entry.position] = entry;
      state.tree.add(entry);
      stats.maxNTime = Math.max(stats.maxNTime, entry.time)
      stats.minNTime = Math.min(stats.minNTime, entry.time)
    }
  }
  state.stats = stats;
  state.ageColorScale = d3.scaleSequential([stats.minNTime, stats.maxNTime], d3.interpolateRdYlGn);
  statsTable.html(formatStats(state.stats))
  drawColorLegend(state)
  draw(false, state);
}

function loadFromURL(url) {
  console.log("loading getrawaddrman from ", url);
  fetch(url)
    .then((res) => res.json())
    .then((getrawaddrman) => {
      processGetRawAddrman(getrawaddrman);
    })
    .catch((err) => {
      throw err;
    });
}

document.getElementById("load-url").onclick = function () {
  let url = document.getElementById("url").value;
  loadFromURL(url);
};

document.getElementById('selectFiles').addEventListener('change', function (e) {
  if (e.target.files[0]) {
    var fr = new FileReader();
    fr.onload = function (e) {
      let getrawaddrman = JSON.parse(e.target.result);
      processGetRawAddrman(getrawaddrman);
    };
    var files = document.getElementById("selectFiles").files;

    fr.readAsText(files.item(0));
  }
});

window.onload = (event) => {

  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has("url")) {
    loadFromURL(searchParams.get("url"));
  }

};

function formatStats(stats) {
  return `
  <div class="row row-cols-2">
    <div class="col">
      <span class="row">
        <span class="text-muted small col">oldest address</span>
        <span class="col-auto">${new Date(stats.minNTime * 1000).toLocaleString()} (${stats.minNTime})</span>
      </span>
    </div>
    <div class="col">
      <span class="row">
        <span class="text-muted small col">newest address</span>
        <span class="col-auto">${new Date(stats.maxNTime * 1000).toLocaleString()} (${stats.maxNTime})</span>
      </span>
    </div>
  </div>`;
}

// Download JSON button
const downloadBtn = document.getElementById("download-json-btn");

downloadBtn.addEventListener("click", () => {
  if (!state || !state.tables) {
    alert("No addrman data loaded yet!");
    return;
  }

  const dataStr = JSON.stringify({
    new: state.tables.new.table,
    tried: state.tables.tried.table
  }, null, 2); // pretty print

  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "getrawaddrman.json";
  a.click();

  URL.revokeObjectURL(url);
});