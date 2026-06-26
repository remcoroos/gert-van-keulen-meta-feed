require('dotenv').config();
const axios = require('axios');
const xml2js = require('xml2js');
const cloudinary = require('cloudinary').v2;
const fs = require('fs-extra');

// Helper to compute Hamming distance between two 64-bit hex hashes
function getHammingDistance(hex1, hex2) {
  if (!hex1 || !hex2 || hex1.length !== hex2.length) {
    return 999;
  }
  let distance = 0;
  for (let i = 0; i < hex1.length; i++) {
    const val1 = parseInt(hex1[i], 16);
    const val2 = parseInt(hex2[i], 16);
    let xor = val1 ^ val2;
    while (xor > 0) {
      if (xor & 1) distance++;
      xor = xor >> 1;
    }
  }
  return distance;
}

// Cloudinary Configuration
if (process.env.CLOUDINARY_URL) {
  // Configured automatically via CLOUDINARY_URL env variable
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

async function processFeed() {
  try {
    console.log('Fetching Gert van Keulen source feed...');
    const response = await axios.get('https://gertvankeulen-vehicle-feed.fly.dev/feed.xml');
    const xml = response.data;

    console.log('Parsing XML...');
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(xml);
    const allItems = result.rss.channel.item;

    // Ensure allItems is an array
    let itemsToProcess = Array.isArray(allItems) ? allItems : [allItems];

    // Filter out sold vehicles completely (do not show them on the dashboard or XML feed)
    itemsToProcess = itemsToProcess.filter(item => {
      const titleLower = (item['g:title'] || '').toLowerCase();
      const descLower = (item['g:description'] || '').toLowerCase();
      
      const isSold = titleLower.includes('verkocht') || 
                     descLower.includes('deze auto is verkocht') || 
                     descLower.includes('verkocht!') ||
                     descLower.startsWith('verkocht');
      
      if (isSold) {
        console.log(`  Skipping sold vehicle: ${item['g:id']} - ${item['g:title']}`);
        return false;
      }
      return true;
    });

    // Mark placeholder items based on filename, title, and description (but process ALL of them so they can be shown in dashboard)
    const placeholderIds = new Set();
    itemsToProcess.forEach(item => {
      const id = item['g:id'];
      const imageLink = item['g:image_link'] || '';
      const filename = imageLink.substring(imageLink.lastIndexOf('/') + 1).toLowerCase();
      
      const titleLower = (item['g:title'] || '').toLowerCase();
      const descLower = (item['g:description'] || '').toLowerCase();

      const isPlaceholderFilename = filename.includes('nieuw-binnen') || 
                                    filename.includes('placeholder') || 
                                    filename.includes('no-image') || 
                                    filename.includes('geen-afbeelding') || 
                                    filename.includes('coming-soon') || 
                                    filename.includes('foto-volgt') || 
                                    filename.includes('volgt-snel') || 
                                    filename.includes('geen-foto') || 
                                    filename.includes('afbeelding-volgt');

      const isPlaceholderText = titleLower.includes('binnenkort verwacht') || 
                                titleLower.includes('verwacht') ||
                                titleLower.includes('coming soon') ||
                                titleLower.includes('foto\'s volgen') ||
                                titleLower.includes('fotos volgen') ||
                                descLower.includes('binnenkort verwacht') || 
                                descLower.includes('verwacht') ||
                                descLower.includes('coming soon') ||
                                descLower.includes('foto\'s volgen') ||
                                descLower.includes('fotos volgen') ||
                                descLower.includes('foto\'s en info volgen') ||
                                descLower.includes('afbeeldingen volgen') ||
                                descLower.includes('fotos volgen snel') ||
                                descLower.includes('foto\'s volgen snel') ||
                                descLower.includes('volgen spoedig') ||
                                descLower.includes('volgt spoedig') ||
                                descLower.includes('volgen snel') ||
                                descLower.includes('volgt snel');

      if (isPlaceholderFilename || isPlaceholderText) {
        placeholderIds.add(id);
      }
    });
    console.log(`Detected ${placeholderIds.size} items with placeholders (total items: ${itemsToProcess.length}).`);

    const processedItems = await Promise.all(itemsToProcess.map(async (item) => {
      const id = item['g:id'];
      const rawBrand = item['g:brand'] || '';
      const rawModel = item['g:model'] || '';
      const rawTitle = item['g:title'] || '';
      
      const priceString = item['g:price'] || ''; // e.g. "12850 EUR"
      const originalImage = item['g:image_link'];

      // Extract details
      const color = item['g:color'] || '';
      const rawMileage = item['g:mileage'] || '';
      let mileage = rawMileage;
      if (mileage) {
        const numMileage = mileage.replace(/\D/g, '');
        if (numMileage) {
          mileage = `${new Intl.NumberFormat('nl-NL').format(numMileage)} km`;
        }
      }
      const year = item['g:year'] || '';
      const description = [mileage, year].filter(Boolean).join(', ') || `Prachtige auto bij Autobedrijf Gert van Keulen. Bekijk alle details op onze website.`;

      // Format price for text overlay
      const priceVal = priceString.split(' ')[0] || '0';
      const formattedPrice = `€ ${new Intl.NumberFormat('nl-NL').format(priceVal)},-`;

      // Optical separation: Split the brand/model from the rest of the title!
      const brandModelPrefix = `${rawBrand} ${rawModel}`.trim();
      let mainOverlayTitle = rawTitle.toUpperCase();
      let subOverlayTitle = '';

      if (brandModelPrefix && rawTitle.toLowerCase().startsWith(brandModelPrefix.toLowerCase())) {
        mainOverlayTitle = rawTitle.substring(0, brandModelPrefix.length).trim().toUpperCase();
        let remaining = rawTitle.substring(brandModelPrefix.length).trim();
        // Remove any leading separators like 'I', '-', '|'
        let cleaned = remaining.replace(/^[-|I]\s*/i, '');
        // Replace inner separators 'I' or '|' with a premium bullet
        subOverlayTitle = cleaned.replace(/\s+[\|I]\s+/g, ' • ');
      }

      // Truncation setting: limit to approx 1 line for clean spacing
      const MAX_SUB_LENGTH = 75; 
      if (subOverlayTitle.length > MAX_SUB_LENGTH) {
        subOverlayTitle = subOverlayTitle.substring(0, MAX_SUB_LENGTH).replace(/\s+\S*$/, '') + ' ...';
      }

      const cloudinaryPublicId = `gertvankeulen_meta_feed/${id}`;

      try {
        // Step 1: Upload (or ensure exists)
        const uploadResult = await cloudinary.uploader.upload(originalImage, {
          public_id: cloudinaryPublicId,
          overwrite: true,
          phash: true
        });

        // Check if the uploaded image matches a known placeholder by ETag, bytes size, or perceptual hash (pHash) pattern
        const etag = (uploadResult.etag || '').replace(/"/g, '');
        const size = uploadResult.bytes || 0;
        const phash = uploadResult.phash;

        // Known placeholders
        const knownPlaceholderEtags = [
          '67839c06072eb1acc5e797db713d4f1d', // TinQ standard low-res
          '440312b86948ed57e4e72d1c5c7b6c98', // TinQ standard high-res
          'e7d6e58777ff003439e5ffeb393eb958', // TinQ with "INCL. TREKHAAK" banner
          '6577d40e4ab43a13ef26f68320887395'  // Showroom "Foto's volgen snel"
        ];
        const knownPlaceholderSizes = [
          559112,
          2157156,
          2187780,
          2611657
        ];
        const knownPlaceholderPHashes = [
          '0d8f17272bea447c', // TinQ standard low-res
          '9c17f2c72bca443c', // TinQ standard high-res
          '9c3fb2a72be85414', // TinQ with "INCL. TREKHAAK" banner
          'fc2f49dbdaa4006a'  // Showroom "Foto's volgen snel"
        ];

        let matchesPlaceholder = knownPlaceholderEtags.includes(etag) || knownPlaceholderSizes.includes(size);
        let matchedBy = matchesPlaceholder ? 'ETag/Size' : null;

        if (!matchesPlaceholder && phash) {
          for (const targetPHash of knownPlaceholderPHashes) {
            const distance = getHammingDistance(phash, targetPHash);
            if (distance <= 12) {
              matchesPlaceholder = true;
              matchedBy = `pHash (Hamming distance: ${distance} to template ${targetPHash})`;
              break;
            }
          }
        }

        if (matchesPlaceholder) {
          placeholderIds.add(id);
          console.log(`  ⚠ Auto-detected stock placeholder image for vehicle ${id} (Matched by: ${matchedBy}).`);
        }

        // Step 2: Build delivery URL with "Smart Padding" and Text Overlays
        const transformation = [
          // 1. Scale vehicle to fit max width 1080 or height 800 (prevents stretching)
          { width: 1080, height: 800, crop: 'limit' },
          
          // 2. Pad vehicle to top of a square 1080x1080 canvas
          { width: 1080, height: 1080, crop: 'pad', background: 'white', gravity: 'north' },
          
          // Top left brand logo overlay (uploaded as gertvankeulen_favicon)
          { overlay: 'gertvankeulen_favicon', gravity: 'north_west', x: 40, y: 40, width: 90, crop: 'scale' }
        ];

        // Main Title (Brand + Model) -> BOLD UPPERCASE, anchored to top of white block (Roboto font matching Meta UI)
        transformation.push({
          overlay: { font_family: 'Roboto', font_size: 46, font_weight: 'bold', text: mainOverlayTitle },
          gravity: 'north_west', x: 60, y: 824, color: '#1a1a1a', width: 960, crop: 'fit'
        });

        // Subtitle (Options) -> REGULAR, smaller, pushed below title
        if (subOverlayTitle) {
          transformation.push({
            overlay: { font_family: 'Roboto', font_size: 39, text: subOverlayTitle },
            gravity: 'north_west', x: 60, y: 888, color: '#555555', width: 960, crop: 'fit'
          });
        }

        // Description (Mileage + Year) -> anchored to bottom
        transformation.push({
          overlay: { font_family: 'Roboto', font_size: 41, font_weight: 'bold', text: description },
          gravity: 'south_west', x: 60, y: 45, color: '#555555', width: 500, crop: 'fit'
        });
        
        // Price Text -> anchored to bottom right (brand orange color #f39200)
        transformation.push({
          overlay: { font_family: 'Roboto', font_size: 56, font_weight: 'bold', text: formattedPrice },
          gravity: 'south_east', x: 60, y: 45, color: '#f39200'
        });

        const metaImage = cloudinary.url(cloudinaryPublicId, {
          transformation: transformation,
          secure: true,
          format: 'jpg',
          quality: 80,
          version: uploadResult.version
        });

        // Extract store code and formatting URLs
        const storeCode = item['g:vehicle_fulfillment']?.['g:store_code'] || '';
        const rawUrl = item['g:link_template'] || item['g:link'] || '';
        const finalLink = rawUrl.replace('{store_code}', storeCode);

        const rawCondition = (item['g:condition'] || '').toLowerCase();
        const finalCondition = rawCondition === 'new' ? 'new' : 'used';

        const finalPrice = `${parseFloat(priceVal || 0).toFixed(2)} EUR`;

        console.log(`  ✓ ${id}: ${rawBrand} ${rawModel} - ${finalPrice}`);

        return {
          'g:id': id,
          'g:title': rawTitle,
          'g:description': description,
          'link': finalLink,        // Standard RSS link
          'g:link': finalLink,      // Google/Meta specific link
          'g:image_link': metaImage,
          'g:brand': rawBrand,
          'g:model': rawModel,
          'g:condition': finalCondition,
          'g:availability': 'in stock',
          'g:price': finalPrice,
          'g:color': color,
          'g:year': year,
          'g:mileage': rawMileage
        };
      } catch (err) {
        console.error(`Error processing image for ${id}:`, err.message);
        
        const rawBrand = item['g:brand'] || 'Auto';
        const rawModel = item['g:model'] || '';
        const rawMileage = item['g:mileage'] || '';
        const year = item['g:year'] || '';
        const description = [rawMileage, year].filter(Boolean).join(', ') || `Prachtige ${rawBrand} bij Autobedrijf Gert van Keulen.`;
        
        const rawCondition = (item['g:condition'] || '').toLowerCase();
        const finalCondition = rawCondition === 'new' ? 'new' : 'used';

        const rawUrl = item['g:link_template'] || item['g:link'] || '';

        return {
          'g:id': id,
          'g:title': item['g:title'] || `${rawBrand} ${rawModel}`,
          'g:description': description,
          'link': rawUrl,
          'g:link': rawUrl,
          'g:image_link': item['g:image_link'],
          'g:brand': rawBrand,
          'g:model': rawModel,
          'g:condition': finalCondition,
          'g:availability': 'in stock',
          'g:price': item['g:price'] || '0 EUR',
          'g:color': item['g:color'] || '',
          'g:year': year,
          'g:mileage': rawMileage
        };
      }
    }));

    // Filter out items with placeholder images for the Meta XML feed
    const filteredItems = processedItems.filter(item => !placeholderIds.has(item['g:id']));
    console.log(`Meta feed: ${filteredItems.length} items (${processedItems.length - filteredItems.length} placeholders excluded).`);

    // Generate Meta Feed XML (filtered)
    console.log('Generating Meta Feed XML...');
    const builder = new xml2js.Builder();
    const finalXml = builder.buildObject({
      rss: {
        $: { 'xmlns:g': 'http://base.google.com/ns/1.0', version: '2.0' },
        channel: {
          title: 'Autobedrijf Gert van Keulen - Meta Product Feed - GEACTUALISEERD',
          description: 'Geoptimaliseerde feed voor Autobedrijf Gert van Keulen (Facebook/Instagram Ads)',
          link: 'https://www.gertvankeulen.nl',
          item: filteredItems
        }
      }
    });

    // Generate vehicles.json (ALL items, flagged if placeholder, for dashboard monitor)
    console.log('Generating vehicles.json for dashboard...');
    const vehiclesJson = processedItems.map(item => ({
      id: item['g:id'],
      title: item['g:title'],
      description: item['g:description'],
      link: item['g:link'],
      image: item['g:image_link'],
      brand: item['g:brand'],
      model: item['g:model'],
      condition: item['g:condition'],
      price: item['g:price'],
      color: item['g:color'],
      year: item['g:year'],
      mileage: item['g:mileage'],
      isPlaceholder: placeholderIds.has(item['g:id'])
    }));

    await fs.ensureDir('../public');
    await fs.writeFile('../public/meta-product-feed.xml', finalXml);
    await fs.writeFile('../public/vehicles.json', JSON.stringify(vehiclesJson, null, 2));
    await fs.writeFile('../public/last_updated.txt', new Date().toISOString());
    console.log(`Done! Feed: public/meta-product-feed.xml (${filteredItems.length} items), Dashboard: public/vehicles.json (${vehiclesJson.length} items).`);

  } catch (err) {
    console.error('Fatal execution error:', err.message);
    process.exit(1);
  }
}

processFeed();
