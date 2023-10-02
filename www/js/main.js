let newTableState = init_table(
    NUM_NEW_BUCKETS,
    NEW_HEIGHT,
    "#newCanvas",
    "#newCanvasHighlight",
    NEW_BUCKETS_PER_BUCKET_COLUMN
  );
let triedTableState = init_table(
    NUM_TRIED_BUCKETS,
    TRIED_HEIGHT,
    "#triedCanvas",
    "#triedCanvasHighlight",
    TRIED_BUCKETS_PER_BUCKET_COLUMN
  );
draw(false, newTableState);
draw(false, triedTableState);

function processGetRawAddrman(addrman) {
  newTableState = init_table(
    NUM_NEW_BUCKETS,
    NEW_HEIGHT,
    "#newCanvas",
    "#newCanvasHighlight",
    NEW_BUCKETS_PER_BUCKET_COLUMN
  );
  triedTableState = init_table(
    NUM_TRIED_BUCKETS,
    TRIED_HEIGHT,
    "#triedCanvas",
    "#triedCanvasHighlight",
    TRIED_BUCKETS_PER_BUCKET_COLUMN
  );

  for (const bucket_position in addrman.new) {
    entry = addrman.new[bucket_position];
    entry["bucket"] = parseInt(bucket_position.split("/")[0]);
    entry["position"] = parseInt(bucket_position.split("/")[1]);
    newTableState.table[entry.bucket * 64 + entry.position] = entry;
    newTableState.tree.add(entry);
  }

  for (const bucket_position in addrman.tried) {
    entry = addrman.tried[bucket_position];
    entry["bucket"] = parseInt(bucket_position.split("/")[0]);
    entry["position"] = parseInt(bucket_position.split("/")[1]);
    triedTableState.table[entry.bucket * 64 + entry.position] = entry;
    triedTableState.tree.add(entry);
  }

  draw(false, newTableState);
  draw(false, triedTableState);
}

function loadFromURL(url) {
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

document.getElementById('selectFiles').addEventListener('change', function(e) {
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
