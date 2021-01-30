const StreamZip = require('node-stream-zip');
const fs = require('fs-extra');
const path = require('path');
const pcbStackup  = require('pcb-stackup');
const sharp = require('sharp');

// Filenames we need to extract from the archive
const gerberFiles = [
  'CAMOutputs/DrillFiles/drills.xln',
  'CAMOutputs/GerberFiles/copper_top.gbr',
  'CAMOutputs/GerberFiles/silkscreen_top.gbr',
  'CAMOutputs/GerberFiles/soldermask_top.gbr',
  'CAMOutputs/GerberFiles/solderpaste_top.gbr',
  'CAMOutputs/GerberFiles/profile.gbr'
]

// Storage folders
const tmpDir = process.env.TEMP_DIR || path.join(__dirname, 'tmp');
const imgDir = process.env.IMG_DIR || path.join(__dirname, 'img');

function config() {
  // Create tmpDir if it does not exist
  fs.ensureDirSync(tmpDir);
  // Create imgDir if it does not exist
  fs.ensureDirSync(imgDir);
}

function handleError(e) {
  // Clean up temp files
  cleanupFiles();
  console.error(e);
  return e;
}

/**
 * Extracts the passed in zip file
 * @param {string} fileName
 * @returns {Promise} Promise object represents number of files extracted
 */
async function extractArchive(fileName) {
  // Configure archive to use
  const archive =  new StreamZip({
    file: fileName,
    storeEntries: true
  });
  return new Promise((resolve, reject) => {
    // Try to extract
    archive.on('ready', () => {
      let extDir = path.join(tmpDir, 'archive');
      fs.mkdirSync(extDir, { recursive: true });
      archive.extract(null, extDir, (err, count) => {
        if(!err) {
          archive.close();
          resolve(count);
        } else {
          const errMsg = 'Error extracting archive';
          console.err(errMsg);
          archive.close();
          reject(errMsg)
        }
      })
    })
  })
}

async function getLayers(fileName) {
  return new Promise((resolve, reject) => {
    const tempDir = path.join(tmpDir, 'archive');
    extractArchive(fileName)
      .then(numfiles => {
        console.log(`${numfiles} files extracted successfully`);
        const layers = gerberFiles.map(fileName => ({
          filename: fileName,
          gerber: fs.createReadStream(path.join(tempDir, fileName))
        }));
        if(numfiles > 0) {
          // Some files were extracted
          resolve(layers);
        } else {
          const errMsg = 'No files were extracted';
          reject(errMsg);
        }
      })
      .catch(e => {
        console.log(e);
      })
  })
}

function cleanupFiles() {
  try {
    let folder = path.join(tmpDir, 'archive');
    fs.emptyDirSync(folder);
    console.log('Temp files removed.');
  } catch (err) {
    console.error(err);
  }
}

async function gerberToImage(gerber, config, outputDir) {
  // Set filenames
  const imageName = path.basename(gerber, '.zip');
  const destFile = path.join(outputDir, imageName) + '.png';

  // Make sure output dir exists
  try {
    fs.ensureDirSync(outputDir);
  } 
  catch (e) {
    console.error(e)
  }

  return new Promise((resolve, reject) => {
    getLayers(gerber)
      .then(pcbStackup)
      .then(stackup => {
        sharp(Buffer.from(stackup.top.svg), { density: config.density })
        .resize({ width: config.resizeWidth })
        .png({ 
          compressionLevel: config.compLevel })
        .toFile(destFile)
      })
      .then(() => {
        cleanupFiles();
        resolve(destFile);
      })
      .catch((e) => {
        handleError(e);
        reject(e);
      })
  });
}

module.exports = {
  config,
  extractArchive,
  getLayers,
  cleanupFiles,
  gerberToImage
}