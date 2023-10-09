let state = init_addrman_tables(
  0,
  NEW_HEIGHT,
  "#canvas",
  "#canvas_highlight",
);

draw(false, state);

function processGetRawAddrman(addrman) {
  state = init_addrman_tables(
    0,
    NEW_HEIGHT,
    "#canvas",
    "#canvas_highlight",
  );

  for (const table_name of ["new", "tried"]) {
    for (const bucket_position in addrman[table_name]) {
      entry = addrman[table_name][bucket_position];
      entry["bucket"] = parseInt(bucket_position.split("/")[0]);
      entry["position"] = parseInt(bucket_position.split("/")[1]);
      entry["table"] = table_name;
      state.tables[table_name].table[entry.bucket * 64 + entry.position] = entry;
      state.tree.add(entry);
    }
  }

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

window.onload = (event) => {

  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has("url")) {
    loadFromURL(searchParams.get("url"));
  }

};