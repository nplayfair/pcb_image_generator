require('dotenv').config();
const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const { ImageGenerator } = require('@nplayfair/npe_gerber');
const AWS = require('aws-sdk');

const app = express();
const s3 = new AWS.S3({
  accessKeyId: process.env.ID,
  secretAccessKey: process.env.SECRET,
  endpoint: process.env.S3_URL,
  s3ForcePathStyle: true,
  signatureVersion: 'v4',
});

// Options
const PORT = process.env.PORT || 3000;
const folderConfig = {
  tmpDir: process.env.TEMP_DIR || path.join(__dirname, 'tmp'),
  imgDir: process.env.IMG_DIR || path.join(__dirname, 'img'),
};
// Image processing configuration
const imgConfig = {
  resizeWidth: 600,
  density: 1000,
  compLevel: 1,
};

app.use(fileUpload());
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use('/img', express.static(folderConfig.imgDir));

const fileProc = new ImageGenerator(folderConfig, imgConfig);

// Upload route
app.post('/upload', (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send('No files were uploaded.');
  }
  if (Object.keys(req.files).length > 1) {
    return res.status(400).send('Please only upload one file.');
  }

  // Move the uploaded file to the tmpDir and process file
  const archive = req.files.gerberArchive;
  const uploadPath = path.join(folderConfig.tmpDir, archive.name);

  // Move the uploaded file to the tmp dir
  return archive.mv(uploadPath, (err) => {
    if (err) return res.status(500).send(err);
    return fileProc
      .gerberToStream(uploadPath)
      .then((stream) => {
        const imageName = `${path.basename(archive.name, '.zip')}.png`;
        // Construct params object
        const params = {
          Bucket: process.env.BUCKET,
          Key: imageName,
          Body: stream,
        };
        // Upload to S3
        s3.upload(params, (s3err, data) => {
          if (err) {
            console.error(s3err);
          } else {
            res.render('image', { imgUrl: data.Location });
          }
        });
      })
      .catch((e) => res.status(400).send(`Error occurred: ${e}`));
  });
});

// Upload page
app.get('/', (req, res) => {
  res.render('index');
});

// Image page
app.get('/image', (req, res) => {
  res.render('image', { imgUrl: '/img/test.png' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
