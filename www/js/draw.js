const NUM_NEW_BUCKETS = 1024;
const NUM_TRIED_BUCKETS = 256;
const NUM_ADDR_PER_BUCKET = 64;
const NUM_ADDR_PER_ADDR_COLUMN = 8;
const ADDR_PIXEL_SIZE = 2;
const ADDR_PIXEL_PADDING = 1;
const ADDR_PIXEL_SIZE_AND_PADDING = ADDR_PIXEL_SIZE + ADDR_PIXEL_PADDING;
const BUCKET_PIXEL_PADDING = 2;
const BUCKET_PIXEL_SIZE =
  NUM_ADDR_PER_ADDR_COLUMN * ADDR_PIXEL_SIZE_AND_PADDING + BUCKET_PIXEL_PADDING;
const NEW_BUCKETS_PER_BUCKET_ROW = 32;
const TRIED_BUCKETS_PER_BUCKET_ROW = 16;
const NEW_HEIGHT = BUCKET_PIXEL_SIZE * NEW_BUCKETS_PER_BUCKET_ROW;
const TRIED_HEIGHT = BUCKET_PIXEL_SIZE * TRIED_BUCKETS_PER_BUCKET_ROW;

// How far we can translate x and y outside of the addrman tables
const D3JS_ZOOM_MAX_X_Y_TRANSLATE = 1000;

const NETWORK_COLOR = {
  ipv4: d3.schemeDark2[0],
  ipv6: d3.schemeDark2[1],
  onion: d3.schemeDark2[2],
  i2p: d3.schemeDark2[3],
  internal: d3.schemeDark2[4],
  not_publicly_routable: d3.schemeDark2[4],
  unknown: d3.schemeDark2[5],
};

// defines colors for frequently used services. This is set in the colorSelect
// EventListener
let SERVICE_COLORS = {};

SERVICE_NODE_NETWORK = 1 << 0
SERVICE_NODE_BLOOM = 1 << 2
SERVICE_NODE_WITNESS = 1 << 3
SERVICE_NODE_COMPACT_FILTERS = 1 << 6
SERVICE_NODE_NETWORK_LIMITED = 1 << 10
SERVICE_NODE_P2P_V2 = 1 << 11
SERVICE_TEMP_FULL_RBF = 1 << 26

const SERVICES_NAME = {
  1: "NETWORK",
  4: "BLOOM",
  8: "WITNESS",
  64: "COMPACT_FILTERS",
  1024: "NETWORK_LIMITED",
  2048: "P2P_V2",
  67108864: "FULL_RBF",
}

function calc_addr_x_y(bucket, bucket_pos, buckets_per_bucket_column) {
  let bucket_x = (bucket % buckets_per_bucket_column) * BUCKET_PIXEL_SIZE;
  let bucket_pos_x =
    ADDR_PIXEL_SIZE_AND_PADDING * (bucket_pos % NUM_ADDR_PER_ADDR_COLUMN);
  let x = bucket_x + bucket_pos_x;
  let bucket_y =
    Math.floor(bucket / buckets_per_bucket_column) * BUCKET_PIXEL_SIZE;
  let y =
    bucket_y +
    ADDR_PIXEL_SIZE_AND_PADDING *
      Math.floor(bucket_pos / NUM_ADDR_PER_ADDR_COLUMN);
  return [x, y];
}

const highlightSelect = d3.select("#highlight");
const colorSelect = d3.select("#color");
const colorLegend = d3.select("#address-color-legend");
const tooltip = d3.select("#tooltip");

function init_addrman_tables(
  height,
  canvasName,
  canvasHighlightName
) {
  let tables = {
    "new": {
      "table": new Array(NUM_NEW_BUCKETS * NUM_ADDR_PER_BUCKET),
      "positions": new Array(NUM_NEW_BUCKETS * NUM_ADDR_PER_BUCKET),
      "buckets": NUM_NEW_BUCKETS,
      "buckets_per_row": NEW_BUCKETS_PER_BUCKET_ROW,
      "x_offset": 0,
    },
    "tried": {
      "table": new Array(NUM_TRIED_BUCKETS * NUM_ADDR_PER_BUCKET),
      "positions": new Array(NUM_TRIED_BUCKETS * NUM_ADDR_PER_BUCKET),
      "buckets": NUM_TRIED_BUCKETS,
      "buckets_per_row": TRIED_BUCKETS_PER_BUCKET_ROW,
      "x_offset": BUCKET_PIXEL_SIZE * NEW_BUCKETS_PER_BUCKET_ROW + 32,
    },
  };

  for([_, tableInfo] of Object.entries(tables)) {
    for (const i of tableInfo.table.keys()) {
      let bucket = Math.floor(i / NUM_ADDR_PER_BUCKET);
      let position = i % NUM_ADDR_PER_BUCKET;
      let [x, y] = calc_addr_x_y(bucket, position, tableInfo.buckets_per_row);
      tableInfo.positions[i] = [x + tableInfo.x_offset, y];
    }
  }

  let border_width = 1 // px;
  let width = document.getElementById("canvas_wrapper").clientWidth - border_width * 2;

  let tree = d3
    .quadtree()
    .x((d) => tables[d.table].positions[d.bucket * NUM_ADDR_PER_BUCKET + d.position][0])
    .y((d) => tables[d.table].positions[d.bucket * NUM_ADDR_PER_BUCKET + d.position][1])
    .extent([
      [0, 0],
      [width * 1.1, height * 1.1],
    ]);

  // The main canvas for drawing buckets and addresses
  var canvas = d3.select(canvasName);
  canvas
    .attr("height", height)
    .attr("width", width)
    .style("position", "absolute")
    .style("left", "0")
    .style("top", "0")
    .style("z-layer:", "99")
    .style("border", `solid ${border_width}px gray`);
  var context = canvas.node().getContext("2d");

  // A highlight canvas for drawing mouse-over highlights
  var canvasHighlight = d3.select(canvasHighlightName);
  canvasHighlight
    .attr("width", width)
    .attr("height", height)
    .style("border", `solid ${border_width}px red`);
  var contextHighlight = canvasHighlight.node().getContext("2d");

  let state = {
    tables: tables,
    tree: tree,
    context: context,
    contextHighlight: contextHighlight,
    currentZoom: d3.zoomIdentity,
    height: height,
    width: width,
    ageColorScale: null,
    stats: null,
  };

  const zoomContext = d3
    .zoom()
    .scaleExtent([0.33, 16])
    .translateExtent([
      [-D3JS_ZOOM_MAX_X_Y_TRANSLATE, -D3JS_ZOOM_MAX_X_Y_TRANSLATE],
      [width+D3JS_ZOOM_MAX_X_Y_TRANSLATE, height+D3JS_ZOOM_MAX_X_Y_TRANSLATE],
    ])
    .on("zoom", ({ transform }) => {
      state.currentZoom = transform;
      draw(true, state);
    })
    .on("end", ({ transform }) => {
      draw(false, state);
    });

  // zooming on the highlight canvas as it sits above the main canvas
  d3.select(state.context.canvas).call(zoomContext);

  // mouse over on the highlight canvas as it sits above the main canvas
  d3.select(state.context.canvas).on("mousemove", (e) => {
    x =
      (e.clientX -
        e.target.getBoundingClientRect().left -
        state.currentZoom.x) /
      state.currentZoom.k;
    y =
      (e.clientY - e.target.getBoundingClientRect().top - state.currentZoom.y) /
      state.currentZoom.k;

    addrinfo = tree.find(x - ADDR_PIXEL_SIZE / 2, y - ADDR_PIXEL_SIZE / 2, 2);
    if (addrinfo) {
      tooltip
        .transition()
        .duration(10)
        .style("top", e.clientY + 5 + "px")
        .style("left", e.clientX + 5 + "px")
        .style("opacity", 1)
      tooltip.html(formatTooltip(addrinfo, state.stats));
      draw_background(false, state, addrinfo);
    } else {
      tooltip.transition()
        .duration(10)
        .style("opacity", 0);
    }
  });

  colorSelect.node().addEventListener("change", (_) => {
    drawColorLegend(state)
    draw(false, state)
  });

  return state;
}

function draw_background(is_zoom, state, highlight) {
  transform = state.currentZoom;
  state.contextHighlight.save();
  state.contextHighlight.clearRect(0,0, state.width, state.height);
  state.contextHighlight.translate(transform.x, transform.y);
  state.contextHighlight.scale(transform.k, transform.k);
  state.contextHighlight.beginPath();

  for(const [tableName, tableInfo] of Object.entries(state.tables)) {

    let [x, y] = tableInfo.positions[0];
    state.contextHighlight.fillStyle = "black";
    state.contextHighlight.font = "14px sans-serif";
    state.contextHighlight.fillText(`${tableName} table - ${tableInfo.buckets} buckets with ${NUM_ADDR_PER_BUCKET} address slots each`, x, y - 10);

    for (bucket = 0; bucket < tableInfo.buckets; bucket++) {
      let [x, y] = tableInfo.positions[bucket * NUM_ADDR_PER_BUCKET];
      state.contextHighlight.fillStyle = "#eee";
      state.contextHighlight.fillRect(x - 0.5, y - 0.5, BUCKET_PIXEL_SIZE - BUCKET_PIXEL_PADDING, BUCKET_PIXEL_SIZE - BUCKET_PIXEL_PADDING);
      if (is_zoom && transform.k > 3) {
        state.contextHighlight.fillStyle = "black";
        state.contextHighlight.font = "2px sans-serif";
        state.contextHighlight.fillText("bucket " + bucket, x, y + 1.5);
      }
    }
  }

  if (highlight) {
    draw_highlight(highlight, state);
  }
  state.contextHighlight.fill();
  state.contextHighlight.restore();
}

function draw_highlight(addrInfo, state) {
  for(const [_, tableInfo] of Object.entries(state.tables)) {
    let addrToHighlight = [];
    switch (highlightSelect.node().value) {
      case "selected":
        addrToHighlight = tableInfo.table
          .filter(Boolean)
          .filter((a) => a == addrInfo);
        break;
      case "same-source":
        addrToHighlight = tableInfo.table
          .filter(Boolean)
          .filter((a) => a.source == addrInfo.source);
        break;
      case "same-port":
        addrToHighlight = tableInfo.table
          .filter(Boolean)
          .filter((a) => a.port == addrInfo.port);
        break;
      case "same-address":
        addrToHighlight = tableInfo.table
          .filter(Boolean)
          .filter((a) => a.address == addrInfo.address);
        break;
      case "same-services":
        addrToHighlight = tableInfo.table
          .filter(Boolean)
          .filter((a) => a.services == addrInfo.services);
        break;
      default:
    }

    for (const addrInfo of addrToHighlight) {
      let [x, y] =
        tableInfo.positions[
          addrInfo.bucket * NUM_ADDR_PER_BUCKET + addrInfo.position
        ];
      state.contextHighlight.strokeStyle = "black";
      state.contextHighlight.lineWidth = 1;
      state.contextHighlight.strokeRect(x, y, ADDR_PIXEL_SIZE, ADDR_PIXEL_SIZE);
    }
  }
}

function draw(is_zoom, state) {
  tooltip.style("opacity", 0);
  transform = state.currentZoom;
  state.context.save();
  state.context.clearRect(0, 0, state.width, state.height);
  state.context.translate(transform.x, transform.y);
  state.context.scale(transform.k, transform.k);
  state.context.beginPath();

  draw_background(is_zoom, state);

  if (!is_zoom) {
    for(const [_, tableInfo] of Object.entries(state.tables)) {
      position = 0;
      for (const addrInfo of tableInfo.table) {
        let [x, y] = tableInfo.positions[position];
        if (addrInfo === undefined) {
          if (transform.k > 3) {
            state.context.strokeStyle = "gray";
            state.context.lineWidth = 0.1;
            state.context.strokeRect(x, y, ADDR_PIXEL_SIZE, ADDR_PIXEL_SIZE);
          }
        } else {
          state.context.fillStyle = address_color(addrInfo, state);
          state.context.fillRect(x, y, ADDR_PIXEL_SIZE, ADDR_PIXEL_SIZE); // x, y, width and height
        }
        position++;
      }
    }
  }
  state.context.fill();
  state.context.restore();
}

function formatTooltip(addrinfo, stats) {
  return `
    <table>
      <tr><td class="text-muted small px-2">address</td><td>${addrinfo.address}</td></tr>
      <tr><td class="text-muted small px-2">port</td><td>${addrinfo.port}</td></tr>
      <tr><td class="text-muted small px-2">services</td><td>${addrinfo.services} (${services_names(addrinfo.services)})</td></tr>
      <tr><td class="text-muted small px-2">time</td><td>${new Date(addrinfo.time*1000).toLocaleString()}</td></tr>
      <tr><td class="text-muted small px-2">relative age*</td><td>${Math.floor((stats.maxNTime - addrinfo.time)).toDDHHMMSS()}</td></tr>
      <tr><td class="text-muted small px-2">network</td><td>${addrinfo.network}</td></tr>
      <tr><td class="text-muted small px-2">bucket</td><td>${addrinfo.bucket}</td></tr>
      <tr><td class="text-muted small px-2">position</td><td>${addrinfo.position}</td></tr>
      <tr><td class="text-muted small px-2">source</td><td>${addrinfo.source}</td></tr>
      <tr><td class="text-muted small px-2">source network</td><td>${addrinfo.source_network}</td></tr>
    </table>
    <hr class="m-1">
    <span class="text-muted small">*age is relative to the newest address<span>`;
}

function services_names(services) {
  let service_names = []
  for (const service of Object.keys(SERVICES_NAME)) {
    if (services & service) {
      service_names.push(SERVICES_NAME[service])
    }
  }
  return service_names.join(", ")
}

function address_color(addrInfo, state) {
  switch (colorSelect.node().value) {
    case "network":
      return NETWORK_COLOR[addrInfo.network];
    case "source_network":
      return NETWORK_COLOR[addrInfo.source_network];
    case "services":
      return SERVICE_COLORS.hasOwnProperty(addrInfo.services)? SERVICE_COLORS[addrInfo.services]: d3.schemeTableau10[9];
    case "age":
      return state.ageColorScale(addrInfo.time);
    default:
      return "#b10c00";
  }
}

function drawColorLegend(state) {
  colorLegend.node().innerHTML = '';
  switch (colorSelect.node().value) {
    case "network":
      let possible_networks = Array.from(new Set(state.tables.new.table.filter(Boolean).map(a => a.network).concat(state.tables.tried.table.filter(Boolean).map(a => a.network))))
      colorLegend.html(possible_networks.map((k) => `<span style="color:${NETWORK_COLOR[k]}">■</span> ${k}&nbsp;&nbsp;`).join("  "));
      break;
    case "source_network":
      let possible_source_networks = Array.from(new Set(state.tables.new.table.filter(Boolean).map(a => a.source_network).concat(state.tables.tried.table.filter(Boolean).map(a => a.source_network))))
      colorLegend.html(possible_source_networks.map((k) => `<span style="color:${NETWORK_COLOR[k]}">■</span> ${k}&nbsp;&nbsp;`).join("  "));
      break;
    case "services":
      // Object with service flag counts (e.g. {1033: 630, 1036: 5, 1037: 156, ..})
      let flagCounts = tableInfo.table.filter(Boolean).reduce(function (acc, curr) {
        return acc[curr.services] ? ++acc[curr.services] : acc[curr.services] = 1, acc
      }, {})
      let sortedFlags = Object.keys(flagCounts).map(k => ([k, flagCounts[k]])).sort((a, b) => (b[1] - a[1]));
      // take up to 9 of most used service flags. We are limited to 9 here as
      // the color map doesn't have more colors
      let flagsToShow = sortedFlags.slice(0, Math.min(9, sortedFlags.length))
      flagsToShow.map((e, i) =>
        SERVICE_COLORS[e[0]] = d3.schemeTableau10[i]
      )
      console.log(flagsToShow)

      colorLegend.html(
        Object.keys(SERVICE_COLORS).map((services) =>
            `<span style="color:${SERVICE_COLORS[services]}">■</span> ${services}&nbsp;&nbsp;`
        ).concat(`<span style="color: ${d3.schemeTableau10[9]}">■</span> other&nbsp;&nbsp;`).join("  ")
      );
      break;
    case "age":
      let oldest = document.createElement('span');
      let newest = document.createElement('span');
      oldest.textContent = "oldest ";
      newest.textContent = " newest";
      colorLegend.node().appendChild(oldest)
      colorLegend.node().appendChild(ramp(state.ageColorScale.interpolator()))
      colorLegend.node().appendChild(newest)
      break;
    default:
      alert("not implemented")
      colorLegend.textContent("not implemented")
  }
}

Number.prototype.toDDHHMMSS = function () {
  let duration = this;
  let days    = Math.floor(duration / 86400)
  duration -= days * 86400;
  let hours   = Math.floor(duration / 3600);
  duration -= hours * 3600;
  let minutes = Math.floor(duration / 60);
  duration -= minutes * 60;
  let seconds = duration % 60;

  return days+"d " + hours+'h '+minutes+'min '+seconds + "s";
}

function ramp(color, n = 256) {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext("2d");
  canvas.width = n;
  canvas.height = 16;
  canvas.style.imageRendering = "pixelated";
  for (let i = 0; i < n; ++i) {
    context.fillStyle = color(i / (n - 1));
    context.fillRect(i, 0, 1, canvas.height);
  }
  return canvas;
}
