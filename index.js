const fs = require("fs");
const Tesseract = require("tesseract.js");
const { PSM } = Tesseract;
const Filter = require("node-image-filter");
const fill = require("flood-fill");
const Jimp = require("jimp");
const obsWebsocketJs = require("obs-websocket-js");
const obs = new obsWebsocketJs();

const { createWorker } = Tesseract;
const myRecognize = async (image, langs, options) => {
  const worker = createWorker(options);
  await worker.load();
  await worker.loadLanguage("digits");
  await worker.initialize("digits");
  //await worker.loadLanguage(langs);
  //await worker.initialize(langs);
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_WORD,
    tessedit_char_whitelist: "0123456789",
    tessjs_create_hocr: 0,
    tessjs_create_tsv: 0,
  });
  return worker.recognize(image).finally(async () => {
    await worker.terminate();
  });
};

let CustomInvertFilter = function (pixels) {
  var data = pixels.data;
  function xyToIndex(x, y) {
    return x + y * pixels.width;
  }

  let dataCopy = new Array(data.length).fill(255);
  const w = 1;

  for (let x = w; x < pixels.width - w; x++) {
    for (let y = w; y < pixels.height - w; y++) {
      let compare = [];
      let px = xyToIndex(x - w, y);
      compare.push([data[px * 4], data[px * 4 + 1], data[px * 4 + 2]]);
      px = xyToIndex(x + w, y);
      compare.push([data[px * 4], data[px * 4 + 1], data[px * 4 + 2]]);
      px = xyToIndex(x, y - w);
      compare.push([data[px * 4], data[px * 4 + 1], data[px * 4 + 2]]);
      px = xyToIndex(x, y + w);
      compare.push([data[px * 4], data[px * 4 + 1], data[px * 4 + 2]]);
      px = xyToIndex(x - w, y - w);
      compare.push([data[px * 4], data[px * 4 + 1], data[px * 4 + 2]]);
      px = xyToIndex(x + w, y - w);
      compare.push([data[px * 4], data[px * 4 + 1], data[px * 4 + 2]]);
      px = xyToIndex(x - w, y + w);
      compare.push([data[px * 4], data[px * 4 + 1], data[px * 4 + 2]]);
      px = xyToIndex(x + w, y + w);
      compare.push([data[px * 4], data[px * 4 + 1], data[px * 4 + 2]]);
      px = xyToIndex(x, y);
      let curr = [data[px * 4], data[px * 4 + 1], data[px * 4 + 2]];
      let diff = 0;
      for (let i = 0; i < compare.length; i++) {
        let b = curr[2] - curr[0];
        let g = curr[1] - curr[0];
        if (b < 0) b = 0;
        if (g < 0) g = 0;
        let [h, s, l] = RGBToHSL(curr);
        let [compareH, cs, cl] = RGBToHSL(compare[i]);
        let lWeight = 1 - Math.abs(l * 2 - 1);
        let hueDiff = Math.abs(h - compareH);
        if (hueDiff > 3) hueDiff = 6 - hueDiff;
        hueDiff = hueDiff * lWeight * s;
        diff +=
          Math.abs(curr[0] - compare[i][0]) +
          Math.abs(curr[1] - compare[i][1]) +
          Math.abs(curr[2] - compare[i][2]) +
          b +
          g +
          hueDiff * 300;
      }
      if (diff < 90 && curr[0] + curr[1] + curr[2] > 150) {
        dataCopy[px * 4] = 0;
        dataCopy[px * 4 + 1] = 0;
        dataCopy[px * 4 + 2] = 0;
      }
    }
  }

  return dataCopy;
};
obs
  .connect({ address: "localhost:4444", password: 'pbmax' })
  .then(() => {
    
    infiniteOCR();
  })
  .catch((err) => {
    console.log(err);
  })

function infiniteOCR()
{obs.send('TakeSourceScreenshot', {sourceName: 'OCR', saveToFilePath: __dirname + "/OBS.png"}).then(() => {
  //let start = Date.now();
  console.log(0)
  Filter.render(__dirname + "/OBS.png", CustomInvertFilter, (result) => {
    result.data.pipe(fs.createWriteStream("result.png"));
  });
  console.log(1)
  //console.log("elapsed:" + (Date.now() - start));
  Jimp.read(__dirname + "/result.png")
    .then((testImg) => {
      console.log(2)
      return testImg
        .scale(0.9)
        .scan(0, 0, testImg.bitmap.width, testImg.bitmap.height, (x, y, idx) => {
          let brightness =
            testImg.bitmap.data[idx] +
            testImg.bitmap.data[idx + 1] +
            testImg.bitmap.data[idx + 2];
          if (brightness < 255 * 3)
            testImg.bitmap.data[idx] =
              testImg.bitmap.data[idx + 1] =
              testImg.bitmap.data[idx + 2] =
                0;
        })
        .write("result2.png");
    })
    .then(() => {
      //console.log("elapsed:" + (Date.now() - start));
      /* nocr.decodeFile(__dirname + "/result2.png", function(error, data){
        console.log(data); // Hello World!
        console.log("elapsed:" + (Date.now() - start));
      }); */
      console.log(3)
      myRecognize(__dirname + "/result2.png", "eng", {
        //logger: (m) => console.log(m),
      }).then((res) => {
        //console.log(Object.getOwnPropertyNames(res.data));
        /* fs.writeFile("ocrData.json", JSON.stringify(res.data.symbols), (err) => {
          if (err) console.error(err);
        }); */
        let text = res.data.text.replace(/[^0-9]/gi, "");
        console.log("text: " + text + " confidence: " + res.data.confidence);
        infiniteOCR();
        //console.log("elapsed:" + (Date.now() - start));
      });
    });
})}




function RGBToHSL(rgb) {
  // Make r, g, and b fractions of 1
  r = rgb[0] / 255;
  g = rgb[1] / 255;
  b = rgb[2] / 255;

  // Find greatest and smallest channel values
  let cmin = Math.min(r, g, b),
    cmax = Math.max(r, g, b),
    delta = cmax - cmin,
    h = 0,
    s = 0,
    l = 0;
  // Calculate hue
  // No difference
  if (delta == 0) h = 0;
  // Red is max
  else if (cmax == r) h = ((g - b) / delta) % 6;
  // Green is max
  else if (cmax == g) h = (b - r) / delta + 2;
  // Blue is max
  else h = (r - g) / delta + 4;

  // Make negative hues positive
  if (h < 0) h += 6;

  // Calculate lightness
  l = (cmax + cmin) / 2;

  // Calculate saturation
  s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return [h, s, l];
}
