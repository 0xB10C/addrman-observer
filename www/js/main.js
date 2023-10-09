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
    let fr = new FileReader();
    let type;
    fr.onload = async function (e) {
      if (type == "json") {
        let getrawaddrman = JSON.parse(e.target.result);
        processGetRawAddrman(getrawaddrman);
      } else if (type == "gzip") {
        
      }
    };
    var files = document.getElementById("selectFiles").files;
    let file = files.item(0)

    if (file.type == "application/json") {
      type = "json";
      fr.readAsText(file);
    } else if (file.type == "application/gzip") {
      type = "gzip";
      readAndDecompressGzip(file);
      //fr.readAsArrayBuffer(file)
    } else {
      console.error("Unsupported file type ", file.type)
    }
  }
});

window.onload = (event) => {
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has("url")) {
    loadFromURL(searchParams.get("url"));
  }
};

async function readAndDecompressGzip(file) {
  const arrayBuffer = await file.arrayBuffer();
  const gzipData = new Uint8Array(arrayBuffer);

  try {
    const decompressedText = await decompressGzip(gzipData);
    console.log("drawing")
    processGetRawAddrman(JSON.parse(decompressedText));
  } catch (error) {
    console.error('Error decompressing GZIP file:', error);
  }
}

async function decompressGzip(data) {
  const decompressionStream = new DecompressionStream('gzip');
  const readableStream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    }
  });

  const decompressedStream = readableStream.pipeThrough(decompressionStream);
  const chunks = [];
  const reader = decompressedStream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const concatenatedChunks = new Uint8Array([...chunks.reduce((acc, chunk) => [...acc, ...Array.from(chunk)], [])]);
    const textDecoder = new TextDecoder();
    return textDecoder.decode(concatenatedChunks);
  } finally {
    reader.releaseLock();
  }
}
