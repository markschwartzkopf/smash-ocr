const fs = require("fs");
const Filter = require("node-image-filter");
const Jimp = require("jimp");
const xml2js = require("xml2js");
const parser = new xml2js.Parser();
const obsWebsocketJs = require("obs-websocket-js");
const obs = new obsWebsocketJs();
const { exec } = require("child_process");

const confidenceThreshold = 90;
let p1Count = 0;
let p2Count = 0;
p1Score = -1;
p2Score = -1;
p1Maybe = -1;
p2Maybe = -1;

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
      if (diff < 150 && curr[0] + curr[1] + curr[2] > 150) {
        dataCopy[px * 4] = 0;
        dataCopy[px * 4 + 1] = 0;
        dataCopy[px * 4 + 2] = 0;
      }
    }
  }

  return dataCopy;
};

let i = 1;
obs
  .connect({ address: "localhost:4444", password: "pbmax" })
  .then(() => {
    infiniteOCR();
  })
  .catch((err) => {
    console.log(err);
  });

function infiniteOCR() {
  let start = Date.now();
  obs
    .send("TakeSourceScreenshot", {
      sourceName: "OCR",
      saveToFilePath: __dirname + "/OBS.png",
    })
    .then(() => {
      //console.log("elapsedOBS:" + (Date.now() - start));
      //start = Date.now();
      return new Promise((res, rej) => {
        Filter.render(__dirname + "/OBS.png", CustomInvertFilter, (result) => {
          let fileStream = fs.createWriteStream("processed.png");
          result.data.pipe(fileStream);
          fileStream.on("close", () => {
            res();
          });
        });
      });
    })
    .then(() => {
      fs.unlinkSync(__dirname + "/OBS.png");
      //console.log("elapsedInvert:" + (Date.now() - start));
      //start = Date.now();
      return Jimp.read(__dirname + "/processed.png");
    })
    .then((char1_0) => {
      fs.unlinkSync(__dirname + "/processed.png");
      //console.log("elapsedJimpRead:" + (Date.now() - start));
      //start = Date.now();
      let char1_1 = char1_0.clone();
      let char1_2 = char1_0.clone();
      let char2_0 = char1_0.clone();
      let char2_1 = char1_0.clone();
      let char2_2 = char1_0.clone();
      char1_0.crop(73, 2, 33, 44).write(__dirname + "/char1_0.png");
      char1_1.crop(40, 2, 33, 44).write(__dirname + "/char1_1.png");
      char1_2.crop(6, 2, 33, 44).write(__dirname + "/char1_2.png");
      char2_0.crop(566, 2, 33, 44).write(__dirname + "/char2_0.png");
      char2_1.crop(534, 2, 33, 44).write(__dirname + "/char2_1.png");
      char2_2.crop(500, 2, 33, 44).write(__dirname + "/char2_2.png");
    })
    .then(() => {
      //console.log("elapsedJimpCrop:" + (Date.now() - start));
      //start = Date.now();
      return pngsToOcrData([
        "char1_0.png",
        "char1_1.png",
        "char1_2.png",
        "char2_0.png",
        "char2_1.png",
        "char2_2.png",
      ]);
    })
    .then((data) => {
      dataToScores(data);
      console.log(
        "1:" + p1Score + " c1:" + p1Count + " 2:" + p2Score + " c2:" + p2Count
      );
      //console.log("elapsedOCR:" + (Date.now() - start));
      start = Date.now();
    })
    .then(() => {
      i++;
      setTimeout(() => {
        infiniteOCR();
      }, 10);
    })
    .catch((err) => {
      console.log(JSON.stringify(err));
    });
}

function pngsToOcrData(filenames) {
  return new Promise((res, rej) => {
    pngsToHocr(filenames, "temp")
      .then(() => {
        return hocrFileToData(__dirname + "/temp.hocr", filenames.length);
      })
      .then((data) => {
        fs.unlink(__dirname + "/temp.hocr", (err) => {
          rej(err);
        });
        res(data);
      });
  });
}

function dataToScores(data) {
  let player1Score = -1;
  if (data[0].conf > confidenceThreshold) {
    p1Count = 0;
    player1Score = data[0].digit;
    if (data[1].conf > confidenceThreshold) {
      player1Score += data[1].digit * 10;
      if (data[2].conf > confidenceThreshold) {
        player1Score += data[1].digit * 100;
      }
    }
  } else p1Count++;
  if (player1Score > p1Score) {
    if ((p1Maybe = player1Score)) {
      p1Score = player1Score;
    } else p1Maybe = player1Score
  }
  let player2Score = -1;
  if (data[3].conf > confidenceThreshold) {
    p2Count = 0;
    player2Score = data[3].digit;
    if (data[4].conf > confidenceThreshold) {
      player2Score += data[4].digit * 10;
      if (data[5].conf > confidenceThreshold) {
        player2Score += data[5].digit * 100;
      }
    }
  } else p2Count++;
  if (player2Score > p2Score) {
    if ((p2Maybe = player2Score)) {
      p2Score = player2Score;
    } else p2Maybe = player2Score
  }
}

function pngsToHocr(inFiles, outPath) {
  return new Promise((res, rej) => {
    let filelist = "";
    inFiles.forEach((x, index) => {
      filelist += x;
      if (index < inFiles.length - 1) filelist += "\n";
    });
    fs.writeFileSync(__dirname + "/filelist.txt", filelist);
    exec(
      "wsl tesseract filelist.txt " + outPath + " --dpi 300 -l digits smashbox",
      (error, stdout, stderr) => {
        if (error) {
          rej("OCRError: " + error.message);
        } else {
          fs.unlink(__dirname + "/filelist.txt", (err) => {
            rej(err);
          });
          res();
        }
      }
    );
  });
}

function hocrFileToData(path, length) {
  return new Promise((res, rej) => {
    fs.readFile(path, function (err, data) {
      if (err) {
        rej(err);
      } else {
        parser.parseString(data, function (err, result) {
          let rtn = [];
          for (let x = 0; x < length; x++) {
            let hocrChar =
              result?.html?.body?.[0]?.div?.[x].div?.[0]?.p?.[0]?.span?.[0]
                ?.span?.[0];
            let digit = hocrChar?._[0];
            let conf = hocrChar?.$?.title;
            if (typeof conf == "string") {
              conf = conf.split("x_wconf ")[1];
            }
            if (!conf) conf = 0;
            rtn.push({ digit: parseInt(digit), conf: parseInt(conf) });
          }
          res(rtn);
        });
      }
    });
  });
}

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
