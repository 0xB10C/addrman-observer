let newTableState;
let triedTableState;

function processGetAddrmanInfo(getaddrmaninfo) {
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
  for (const entry of getaddrmaninfo.new_table) {
    newTableState.table[entry.bucket * 64 + entry.position] = entry;
    newTableState.tree.add(preprocess(entry));
  }

  for (const entry of getaddrmaninfo.tried_table) {
    triedTableState.table[entry.bucket * 64 + entry.position] = entry;
    triedTableState.tree.add(preprocess(entry));
  }
  draw(false, newTableState);
  draw(false, triedTableState);
}

document.getElementById("load-url").onclick = function () {
  let url = document.getElementById("url").value;
  fetch(url)
    .then((res) => res.json())
    .then((getaddrmaninfo) => {
      processGetAddrmanInfo(getaddrmaninfo);
    })
    .catch((err) => {
      throw err;
    });
};

document.getElementById("load-file").onclick = function () {
  var files = document.getElementById("selectFiles").files;
  if (files.length != 1) {
    console.log("Selected multiple files. Please only select a single file.");
    return false;
  }

  var fr = new FileReader();
  fr.onload = function (e) {
    let getaddrmaninfo = JSON.parse(e.target.result);
    processGetAddrmanInfo(getaddrmaninfo);
  };

  fr.readAsText(files.item(0));
};
