const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const fileProc = require('./fileProcessor.js')
require('dotenv').config()
const app = express();


// Options
const PORT = process.env.PORT || 3000;
const imgDir = process.env.IMG_DIR || path.join(__dirname, 'img');
fileProc.config();
app.use(fileUpload());
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use('/img', express.static(imgDir));

// Temporary folder
const tmpDir = process.env.TEMP_DIR || path.join(__dirname, 'tmp');

// Image processing configuration
const config = {
  resizeWidth: 600,
  density: 1000,
  compLevel: 1,
}

// Upload route
app.post('/upload', (req, res) => {
  let archive;
  let uploadPath;

  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send('No files were uploaded.');
  } else if (Object.keys(req.files).length > 1) {
    return res.status(400).send('Please only upload one file.');
  }

  archive = req.files.gerberArchive;
  uploadPath = path.join(tmpDir, archive.name);

  // Move the uploaded file to the tmp dir
  archive.mv(uploadPath, (err) => {
    if (err)
      return res.status(500).send(err);
    fileProc.gerberToImage(uploadPath, config, imgDir)
      .then(filename => {
        res.send(`Generated image ${filename}`);
      })
  });
});

// Upload page
app.get('/', (req, res) => {
  res.render('index');
})

// Image page
app.get('/image', (req, res) => {
  res.render('image');
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});