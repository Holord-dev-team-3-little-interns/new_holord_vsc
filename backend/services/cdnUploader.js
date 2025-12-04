const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const axios = require("axios");

// Your actual ImageBB API key
const IMGBB_API_KEY = '54225f4bd9a7d64a22f7bb25e441d0ae';

async function uploadToCDN(filePath) {
  try {
    console.log("📤 Uploading to ImageBB CDN with your API key...");
    console.log("File path:", filePath);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read the file
    const fileBuffer = fs.readFileSync(filePath);
    const base64Image = fileBuffer.toString('base64');

    // Create form data
    const formData = new FormData();
    formData.append('image', base64Image);

    // Upload to ImageBB with your API key
    const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
      params: {
        key: IMGBB_API_KEY,
        expiration: 15552000 // 6 months in seconds
      },
      headers: {
        ...formData.getHeaders()
      },
      timeout: 30000
    });

    if (response.data && response.data.success && response.data.data) {
      const imageData = response.data.data;
      console.log("✅ ImageBB upload successful!");
      console.log("📷 Image URL:", imageData.url);
      console.log("🗑️ Delete URL:", imageData.delete_url);
      
      return imageData.url;
    } else {
      throw new Error('ImageBB API returned unsuccessful response');
    }
    
  } catch (error) {
    console.error("❌ ImageBB upload error:", error.message);
    
    if (error.response) {
      console.error("API Error Details:", error.response.data);
    }
    
    // Fallback to local serving
    return serveLocally(filePath);
  }
}

function serveLocally(filePath) {
  const filename = path.basename(filePath);
  const localUrl = `http://localhost:5000/uploads/${filename}`;
  console.log("🔄 Using local URL as fallback:", localUrl);
  return localUrl;
}

module.exports = { uploadToCDN };