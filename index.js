/* eslint-disable func-names */
require('dotenv').config();
const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const expressSession = require('express-session');
const passport = require('passport');
const Auth0Strategy = require('passport-auth0');
const { ImageGenerator } = require('@nplayfair/npe_gerber');
const AWS = require('aws-sdk');
const authRouter = require('./auth.js');

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

const layerNames = [
  'CAMOutputs/DrillFiles/drills.xln',
  'CAMOutputs/GerberFiles/copper_top.gbr',
  'CAMOutputs/GerberFiles/silkscreen_top.gbr',
  'CAMOutputs/GerberFiles/soldermask_top.gbr',
  'CAMOutputs/GerberFiles/solderpaste_top.gbr',
  'CAMOutputs/GerberFiles/profile.gbr',
];

// Session config
const session = {
  secret: process.env.SESSION_SECRET,
  cookie: {},
  resave: false,
  saveUninitialized: false,
};

if (app.get('env') === 'production') {
  // Serve secure cookies, requires HTTPS
  session.cookie.secure = true;
  app.set('trust proxy', 1)
}

// Passport Config
const strategy = new Auth0Strategy(
  {
    domain: process.env.AUTH0_DOMAIN,
    clientID: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,
    callbackURL: process.env.AUTH0_CALLBACK_URL,
  },
  // eslint-disable-next-line prefer-arrow-callback
  function (accessToken, refreshToken, extraParams, profile, done) {
    /**
     * Access tokens are used to authorize users to an API
     * (resource server)
     * accessToken is the token to call the Auth0 API
     * or a secured third-party API
     * extraParams.id_token has the JSON Web Token
     * profile has all the information from the user
     */

    return done(null, profile);
  }
);

// App config
app.use(fileUpload());
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use('/img', express.static(folderConfig.imgDir));
// Auth
app.use(expressSession(session));
passport.use(strategy);
app.use(passport.initialize());
app.use(passport.session());
passport.serializeUser((user, done) => {
  done(null, user);
});
passport.deserializeUser((user, done) => {
  done(null, user);
});

// Auth middleware
app.use((req, res, next) => {
  res.locals.isAuthenticated = req.isAuthenticated();
  next();
});

app.use('/', authRouter);

const secured = (req, res, next) => {
  if (req.user) {
    return next();
  }
  res.session.returnTo = req.originalUrl;
  res.redirect('/login');
};

const fileProc = new ImageGenerator(folderConfig, imgConfig, layerNames);

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

app.get('/upload', (req, res) => res.redirect('/'));

// Upload page
app.get('/', (req, res) => {
  res.render('index');
});

// Image page
app.get('/image', (req, res) => {
  res.render('image', { imgUrl: null });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
