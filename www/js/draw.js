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

network_to_color = {
  ipv4: d3.schemeDark2[0],
  ipv6: d3.schemeDark2[1],
  tor: d3.schemeDark2[2],
  i2p: d3.schemeDark2[3],
  interal: d3.schemeDark2[4],
  unknown: d3.schemeDark2[5],
};

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
const tooltip = d3.select("#tooltip");

function init_addrman_tables(
  size,
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

  let width = window.innerWidth * 0.9;

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
    .style("border", "solid 1px gray");
  var context = canvas.node().getContext("2d");

  // A highlight canvas for drawing mouse-over highlights
  var canvasHighlight = d3.select(canvasHighlightName);
  canvasHighlight
    .attr("width", width)
    .attr("height", height)
    .style("border", "solid 1px red");
  var contextHighlight = canvasHighlight.node().getContext("2d");

  let state = {
    tables: tables,
    tree: tree,
    context: context,
    contextHighlight: contextHighlight,
    currentZoom: d3.zoomIdentity,
    height: height,
    width: width,
  };

  const zoomContext = d3
    .zoom()
    .scaleExtent([0.33, 16])
    .translateExtent([
      [0, 0],
      [width, height],
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
        .style("top", e.clientY + 5 + "px")
        .style("left", e.clientX + 5 + "px")
        .html(formatTooltip(addrinfo));
      tooltip.transition().delay(100).duration(10).style("opacity", 1);
      draw_background(false, state, addrinfo);
    } else {
      tooltip.style("opacity", 0);
    }
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

  for(const [_, tableInfo] of Object.entries(state.tables)) {
    for (bucket = 0; bucket < tableInfo.buckets; bucket++) {
      let [x, y] = tableInfo.positions[bucket * NUM_ADDR_PER_BUCKET];
      state.contextHighlight.fillStyle = "#eee";
      state.contextHighlight.fillRect(x - 0.5, y - 0.5, BUCKET_PIXEL_SIZE - BUCKET_PIXEL_PADDING, BUCKET_PIXEL_SIZE - BUCKET_PIXEL_PADDING);
      if (is_zoom && transform.k > 4) {
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
  d3.select("#tooltip").style("opacity", 0);
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
          state.context.fillStyle = network_to_color[addrInfo.network];
          state.context.fillRect(x, y, ADDR_PIXEL_SIZE, ADDR_PIXEL_SIZE); // x, y, width and height
        }
        position++;
      }
    }
  }
  state.context.fill();
  state.context.restore();
}

function formatTooltip(addrinfo) {
  return `
    <table>
        <tr><td>address</td><td>${addrinfo.address}</td></tr>
        <tr><td>port</td><td>${addrinfo.port}</td></tr>
        <tr><td>services</td><td>${addrinfo.services}</td></tr>
        <tr><td>time</td><td>${addrinfo.time}</td></tr>
        <tr><td>network</td><td>${addrinfo.network}</td></tr>
        <tr><td>bucket</td><td>${addrinfo.bucket}</td></tr>
        <tr><td>position</td><td>${addrinfo.position}</td></tr>
        <tr><td>source</td><td>${addrinfo.source}</td></tr>
        <tr><td>source network</td><td>${addrinfo.source_network}</td></tr>
    </table>`;
}
