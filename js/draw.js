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
const NEW_BUCKETS_PER_BUCKET_COLUMN = 32;
const TRIED_BUCKETS_PER_BUCKET_COLUMN = 16;
const NEW_HEIGHT = BUCKET_PIXEL_SIZE * NEW_BUCKETS_PER_BUCKET_COLUMN;
const TRIED_HEIGHT = BUCKET_PIXEL_SIZE * TRIED_BUCKETS_PER_BUCKET_COLUMN;

function address_network_type(addrinfo) {
  if (addrinfo.address.includes("onion")) {
    return "tor";
  } else if (addrinfo.address.includes("internal")) {
    return "internal";
  } else if (addrinfo.address.includes("i2p")) {
    return "i2p";
  } else if (addrinfo.address.includes("[")) {
    return "ipv6";
  } else if (addrinfo.address.split(".").length == 4) {
    return "ipv4";
  }
  return "unknown";
}

function setWebsocketStatus(status) {
  document.getElementById("websocket-status").innerText = status;
}

function port(addrinfo) {
  return addrinfo.address.split(":").slice(-1);
}

function preprocess(addrinfo) {
  addrinfo.port = port(addrinfo);
  addrinfo.net_type = address_network_type(addrinfo);
  return addrinfo;
}

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

function init_table(
  size,
  height,
  canvasName,
  canvasHighlightName,
  buckets_per_bucket_column
) {
  let table = new Array(size * 64);
  let tableAddrPos = new Array(size * 64);

  for (const i of table.keys()) {
    let bucket = Math.floor(i / NUM_ADDR_PER_BUCKET);
    let bucket_pos = i % NUM_ADDR_PER_BUCKET;
    let [x, y] = calc_addr_x_y(bucket, bucket_pos, buckets_per_bucket_column);
    tableAddrPos[i] = [x, y];
  }

  let tree = d3
    .quadtree()
    .x((d) => tableAddrPos[d.bucket * NUM_ADDR_PER_BUCKET + d.position][0])
    .y((d) => tableAddrPos[d.bucket * NUM_ADDR_PER_BUCKET + d.position][1])
    .extent([
      [0, 0],
      [height * 1.1, height * 1.1],
    ]);

  // The main canvas for drawing buckets and addresses
  var canvas = d3.select(canvasName);
  canvas
    .attr("width", height)
    .attr("height", height)
    .style("position", "absolute")
    .style("left", "0")
    .style("top", "0")
    .style("z-layer:", "99")
    .style("border", "solid 1px gray");
  var context = canvas.node().getContext("2d");

  // A highlight canvas for drawing mouse-over highlights
  var canvasHighlight = d3.select(canvasHighlightName);
  canvasHighlight
    .attr("width", height)
    .attr("height", height)
    .style("border", "solid 1px red");
  var contextHighlight = canvasHighlight.node().getContext("2d");

  let state = {
    table: table,
    tableAddrPos: tableAddrPos,
    context: context,
    contextHighlight: contextHighlight,
    tree: tree,
    currentZoom: d3.zoomIdentity,
    height: height,
    num_buckets: size,
  };

  const zoomContext = d3
    .zoom()
    .scaleExtent([1, 16])
    .translateExtent([
      [0, 0],
      [height, height],
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

function draw_background(is_zoom, tableState, highlight) {
  transform = tableState.currentZoom;
  tableState.contextHighlight.save();
  tableState.contextHighlight.clearRect(
    0,
    0,
    tableState.height,
    tableState.height
  );
  tableState.contextHighlight.translate(transform.x, transform.y);
  tableState.contextHighlight.scale(transform.k, transform.k);
  tableState.contextHighlight.beginPath();
  for (position = 0; position < tableState.num_buckets; position++) {
    let [x, y] = tableState.tableAddrPos[position * NUM_ADDR_PER_BUCKET];
    tableState.contextHighlight.fillStyle = "#eee";
    tableState.contextHighlight.fillRect(
      x - 0.5,
      y - 0.5,
      BUCKET_PIXEL_SIZE - BUCKET_PIXEL_PADDING,
      BUCKET_PIXEL_SIZE - BUCKET_PIXEL_PADDING
    );
    if (is_zoom && transform.k > 4) {
      tableState.contextHighlight.fillStyle = "black";
      tableState.contextHighlight.font = "2px sans-serif";
      tableState.contextHighlight.fillText("bucket " + position, x, y + 1.5);
    }
  }
  if (highlight) {
    draw_highlight(highlight, tableState);
  }
  tableState.contextHighlight.fill();
  tableState.contextHighlight.restore();
}

function draw_highlight(addrInfo, tableState) {
  let addrToHighlight = [];
  switch (highlightSelect.node().value) {
    case "same-source":
      addrToHighlight = tableState.table
        .filter(Boolean)
        .filter((a) => a.source == addrInfo.source);
      break;
    case "same-port":
      addrToHighlight = tableState.table
        .filter(Boolean)
        .filter((a) => a.port == addrInfo.port);
      break;
    case "same-address":
      addrToHighlight = tableState.table
        .filter(Boolean)
        .filter((a) => a.address == addrInfo.address);
      break;
    default:
  }

  if (addrToHighlight.length > 0) {
    for (const addrInfo of addrToHighlight) {
      let [x, y] =
        tableState.tableAddrPos[
          addrInfo.bucket * NUM_ADDR_PER_BUCKET + addrInfo.position
        ];
      tableState.contextHighlight.strokeStyle = "black";
      tableState.contextHighlight.lineWidth = 1;
      tableState.contextHighlight.strokeRect(
        x,
        y,
        ADDR_PIXEL_SIZE,
        ADDR_PIXEL_SIZE
      );
    }
  }
}

function draw(is_zoom, tableState) {
  d3.select("#tooltip").style("opacity", 0);
  d3.select("#debug").text(
    tableState.table.filter(Boolean).length + " addresses drawn"
  );
  transform = tableState.currentZoom;
  tableState.context.save();
  tableState.context.clearRect(0, 0, tableState.height, tableState.height);
  tableState.context.translate(transform.x, transform.y);
  tableState.context.scale(transform.k, transform.k);
  tableState.context.beginPath();

  draw_background(is_zoom, tableState);

  if (!is_zoom) {
    position = 0;
    for (const addrInfo of tableState.table) {
      let [x, y] = tableState.tableAddrPos[position];
      if (addrInfo === undefined) {
        if (transform.k > 3) {
          tableState.context.strokeStyle = "gray";
          tableState.context.lineWidth = 0.1;
          tableState.context.strokeRect(x, y, ADDR_PIXEL_SIZE, ADDR_PIXEL_SIZE);
        }
      } else {
        tableState.context.fillStyle =
          network_to_color[address_network_type(addrInfo)];
        tableState.context.fillRect(x, y, ADDR_PIXEL_SIZE, ADDR_PIXEL_SIZE); // x, y, width and height
      }
      position++;
    }
  }
  tableState.context.fill();
  tableState.context.restore();
}

function formatTooltip(addrinfo) {
  return `
    <table>
        <tr><td>address</td><td>${addrinfo.address}</td></tr>
        <tr><td>network</td><td>${addrinfo.net_type}</td></tr>
        <tr><td>source</td><td>${addrinfo.source}</td></tr>
        <tr><td>bucket</td><td>${addrinfo.bucket}</td></tr>
        <tr><td>position</td><td>${addrinfo.position}</td></tr>
        <tr><td>services</td><td>${addrinfo.services}</td></tr>
    </table>`;
}