const cloudinary = require('cloudinary').v2;
require('dotenv').config();

// Parse CLOUDINARY_URL
if (process.env.CLOUDINARY_URL) {
  const url = process.env.CLOUDINARY_URL.replace('cloudinary://', '').split('@');
  const [api_key, api_secret] = url[0].split(':');
  const cloud_name = url[1];

  cloudinary.config({
    cloud_name,
    api_key,
    api_secret
  });
} else {
  console.error('Error: CLOUDINARY_URL is missing in environment variables.');
  process.exit(1);
}

const FAVICON_URL = 'https://www.gertvankeulen.nl/cms/wp-content/uploads/2021/06/cropped-favicon-192x192.png';

async function run() {
  console.log('Uploading brand favicon to Cloudinary...');
  const result = await cloudinary.uploader.upload(FAVICON_URL, {
    public_id: 'gertvankeulen_favicon',
    overwrite: true
  });
  console.log(`Success! Favicon uploaded. Public ID: ${result.public_id}, URL: ${result.secure_url}`);
}

run().catch((err) => {
  console.error('Failed to upload favicon:', err.message);
  process.exit(1);
});
