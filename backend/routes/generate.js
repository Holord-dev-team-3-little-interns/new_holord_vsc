// routes/generate.js - UPDATED: NO QR CODE
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sharp = require('sharp');
const { callNanoBanana } = require("../services/nanobanana");
const { uploadToCDN } = require("../services/cdnUploader");
// ⚡ REMOVED QR CODE IMPORT

const router = express.Router();

// Multer setup for temporary uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadsDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

// Force 9:16 aspect ratio on AI output
async function force916AspectRatio(imagePath) {
  try {
    console.log("🔄 Forcing 9:16 aspect ratio on AI output...");
    
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    
    console.log(`📐 AI output dimensions: ${metadata.width}x${metadata.height}`);
    
    // Target 9:16 dimensions (portrait)
    const targetWidth = 720;   // 9 parts
    const targetHeight = 1280; // 16 parts
    
    const outputPath = imagePath.replace(/\.[^/.]+$/, '_916.png');
    
    await image
      .resize(targetWidth, targetHeight, {
        fit: 'cover',    // Crop to fill
        position: 'center' // Center the crop
      })
      .png() // Convert to PNG for consistency
      .toFile(outputPath);
    
    console.log(`✅ 9:16 aspect ratio applied: ${targetWidth}x${targetHeight}`);
    return outputPath;
    
  } catch (error) {
    console.error("❌ Error forcing 9:16:", error);
    return imagePath; // Return original if processing fails
  }
}

router.post("/", upload.single("photo"), async (req, res) => {
  let userPhotoPath = null;
  let aiImagePath = null;
  let processedImagePath = null;

  try {
    console.log("📸 Received generate request");
    console.log("Request body keys:", Object.keys(req.body));
    console.log("Request file:", req.file ? req.file.originalname : "No file");
    
    if (!req.file) {
      throw new Error("No photo file uploaded");
    }

    const outfitCount = parseInt(req.body.outfit_count) || 1;
    const clothingItems = [];
    
    console.log("🔍 Parsing multiple outfits from request...");
    console.log("Request body content:", req.body);

    // Parse multiple outfits using simple field format (clothing_0, clothing_1, etc.)
    for (let i = 0; i < outfitCount; i++) {
      const clothingFile = req.body[`clothing_${i}`];
      const name = req.body[`name_${i}`];
      const type = req.body[`type_${i}`];
      
      if (clothingFile) {
        clothingItems.push({
          file: clothingFile,
          name: name || `Outfit ${i + 1}`,
          type: type || "unknown",
          category: "unknown"
        });
        console.log(`✅ Added outfit ${i}:`, { name, type, file: clothingFile });
      } else {
        console.log(`❌ No outfit found at index ${i}`);
      }
    }

    // If no outfits found in simple format, try single format as fallback
    if (clothingItems.length === 0) {
      const clothingFile = req.body.clothing;
      const outfitName = req.body.outfit_name || "Unknown Outfit";
      
      if (clothingFile) {
        clothingItems.push({
          file: clothingFile,
          name: outfitName,
          type: "unknown",
          category: "unknown"
        });
        console.log(`✅ [Fallback] Added single outfit:`, { name: outfitName, file: clothingFile });
      }
    }

    userPhotoPath = req.file.path;

    console.log("🎯 Final generation parameters:", {
      totalOutfitsRequested: outfitCount,
      outfitsFound: clothingItems.length,
      outfits: clothingItems.map(item => ({ 
        name: item.name, 
        type: item.type, 
        file: item.file 
      })),
      userPhotoPath
    });

    // Validate inputs
    if (clothingItems.length === 0) {
      throw new Error("No clothing items provided. Please select at least one outfit.");
    }

    // Check if user photo exists and is readable
    if (!fs.existsSync(userPhotoPath)) {
      throw new Error("Uploaded photo file not found");
    }

    const userPhotoStats = fs.statSync(userPhotoPath);
    console.log("📊 User photo stats:", {
      size: userPhotoStats.size + " bytes",
      isFile: userPhotoStats.isFile()
    });

    if (userPhotoStats.size === 0) {
      throw new Error("Uploaded photo is empty");
    }

    // Validate clothing files exist
    for (const item of clothingItems) {
      const clothingPath = path.join("Z:", "Holord.com", "1 Projects", "20250925 Singapore Tech Week", "DRAFTS", "holord_vsc", "frontend", "clothing", item.file);
      if (!fs.existsSync(clothingPath)) {
        throw new Error(`Clothing file not found: ${item.file} at path: ${clothingPath}`);
      } else {
        console.log(`✅ Clothing file exists: ${item.file}`);
      }
    }

    // 1️⃣ Prepare image paths in CORRECT ORDER: outfits first, human last
    console.log("🔄 Preparing images in correct order for AI...");
    
    // Create array of image paths in the order: [outfit1, outfit2, ..., human]
    const imagePaths = [];
    
    // Add OUTFIT images FIRST
    for (const item of clothingItems) {
      const clothingPath = path.join("Z:", "Holord.com", "1 Projects", "20250925 Singapore Tech Week", "DRAFTS", "holord_vsc", "frontend", "clothing", item.file);
      imagePaths.push({
        path: clothingPath,
        type: 'outfit',
        name: item.name
      });
      console.log(`📁 Added outfit to image list: ${item.name}`);
    }
    
    // Add HUMAN image LAST (so AI uses this shape/pose)
    imagePaths.push({
      path: userPhotoPath,
      type: 'human',
      name: 'user_photo'
    });
    console.log(`📸 Added human photo to image list (LAST)`);
    
    console.log("🎯 Final image order for AI processing:");
    imagePaths.forEach((img, index) => {
      console.log(`   ${index + 1}. ${img.type.toUpperCase()}: ${img.name}`);
    });

    // 2️⃣ Call NanoBanana AI with CORRECT IMAGE ORDER
    console.log("🔄 Calling NanoBanana AI with controlled image order...");
    console.log(`🎯 Processing ${imagePaths.length} images in order:`);
    imagePaths.forEach((img, index) => {
      console.log(`   ${index + 1}. ${img.type}: ${img.name}`);
    });
    
    // Pass images in correct order to callNanoBanana
    aiImagePath = await callNanoBanana(imagePaths);
    console.log("✅ AI image generated:", aiImagePath);

    // Validate AI result
    if (!fs.existsSync(aiImagePath)) {
      throw new Error("AI generated image not found");
    }

    const aiImageStats = fs.statSync(aiImagePath);
    console.log("📊 AI image stats:", {
      size: aiImageStats.size + " bytes",
      isFile: aiImageStats.isFile()
    });

    if (aiImageStats.size === 0) {
      throw new Error("AI generated image is empty");
    }

    // NEW: FORCE 9:16 ASPECT RATIO ON AI OUTPUT
    console.log("🔄 Processing AI output to 9:16...");
    processedImagePath = await force916AspectRatio(aiImagePath);
    console.log("✅ Final 9:16 image:", processedImagePath);

    // Validate the processed image
    if (!fs.existsSync(processedImagePath)) {
      throw new Error("Processed 9:16 image not found");
    }

    const processedImageStats = fs.statSync(processedImagePath);
    console.log("📊 Processed image stats:", {
      size: processedImageStats.size + " bytes",
      isFile: processedImageStats.isFile()
    });

    if (processedImageStats.size === 0) {
      throw new Error("Processed 9:16 image is empty");
    }

    // 3️⃣ Upload PROCESSED image to CDN (not the original AI output)
    console.log("🔄 Uploading 9:16 image to CDN...");
    const cdnUrl = await uploadToCDN(processedImagePath); // Use processedImagePath
    console.log("✅ CDN URL:", cdnUrl);

    // ⚡ REMOVED QR CODE GENERATION - This was the main bottleneck!
    console.log("⚡ SKIPPING QR code generation for faster processing");
    
    console.log("🎉 Success! Virtual try-on completed with 9:16 output (NO QR CODE)");
    
    // 5️⃣ Return response to frontend - NO QR CODE
    const responseData = {
      success: true,
      resultImageUrl: cdnUrl, 
      // ⚡ NO qrCode field - this saves 2-5 seconds!
      outfitsUsed: clothingItems.map(item => item.name),
      outfitTypes: clothingItems.map(item => item.type),
      categories: clothingItems.map(item => item.category),
      totalOutfits: clothingItems.length,
      imageOrder: imagePaths.map(img => `${img.type}: ${img.name}`),
      aspectRatio: "9:16",
      message: generateSuccessMessage(clothingItems),
      debug: {
        cdnUrl: cdnUrl,
        qrCodeGenerated: false, // ⚡ Explicitly false
        imageOrderUsed: imagePaths.map(img => img.type),
        aspectRatioForced: true,
        timestamp: new Date().toISOString()
      }
    };

    console.log("📤 Sending FAST response to frontend (NO QR CODE):", {
      success: true,
      resultImageUrl: cdnUrl ? "✓ Present" : "✗ Missing",
      qrCode: "✗ Skipped for speed",
      outfitsUsed: clothingItems.length,
      aspectRatio: "9:16",
      timeSaved: "2-5 seconds (no QR generation)"
    });

    res.json(responseData);
    
  } catch (err) {
    console.error("❌ Error in generate route:", err.message);
    console.error("Error stack:", err.stack);
    
    // Clean up temporary files in case of error
    try {
      if (userPhotoPath && fs.existsSync(userPhotoPath)) {
        fs.unlinkSync(userPhotoPath);
        console.log("🧹 Cleaned up user photo temp file");
      }
      if (aiImagePath && fs.existsSync(aiImagePath)) {
        fs.unlinkSync(aiImagePath);
        console.log("🧹 Cleaned up AI image temp file");
      }
      if (processedImagePath && fs.existsSync(processedImagePath)) {
        fs.unlinkSync(processedImagePath);
        console.log("🧹 Cleaned up processed image temp file");
      }
    } catch (cleanupError) {
      console.error("Error during cleanup:", cleanupError.message);
    }
    
    res.status(500).json({ 
      success: false,
      error: "Virtual try-on generation failed",
      details: err.message,
      suggestion: getErrorSuggestion(err.message),
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Helper function to generate success message based on outfits
function generateSuccessMessage(clothingItems) {
  const tops = clothingItems.filter(item => item.type === 'top');
  const bottoms = clothingItems.filter(item => item.type === 'bottom');
  const fullOutfits = clothingItems.filter(item => item.type === 'full');

  if (fullOutfits.length > 0) {
    return `Virtual try-on generated successfully with ${fullOutfits[0].name}!`;
  }

  if (tops.length > 0 && bottoms.length > 0) {
    return `Virtual try-on generated successfully with ${tops[0].name} and ${bottoms[0].name}!`;
  }

  if (tops.length > 0) {
    return `Virtual try-on generated successfully with ${tops[0].name}!`;
  }

  if (bottoms.length > 0) {
    return `Virtual try-on generated successfully with ${bottoms[0].name}!`;
  }

  return `Virtual try-on generated successfully with ${clothingItems.length} outfit(s)!`;
}

// Helper function to provide user-friendly error suggestions
function getErrorSuggestion(errorMessage) {
  const message = errorMessage.toLowerCase();
  
  if (message.includes('timeout') || message.includes('time out')) {
    return "The AI processing is taking too long. Please try again with a smaller image or different outfit.";
  } else if (message.includes('network') || message.includes('fetch') || message.includes('connect')) {
    return "Cannot connect to the AI service. Please check your internet connection and try again.";
  } else if (message.includes('size') || message.includes('large')) {
    return "The image file is too large. Please try with a smaller image (under 10MB).";
  } else if (message.includes('format') || message.includes('invalid')) {
    return "The image format is not supported. Please use JPEG, PNG, or WebP formats.";
  } else if (message.includes('clothing') || message.includes('outfit') || message.includes('not found')) {
    return "There was an issue with the selected outfit file. Please try a different outfit or contact support.";
  } else if (message.includes('api') || message.includes('key') || message.includes('quota')) {
    return "AI service is currently unavailable. Please try again later.";
  } else if (message.includes('path') && message.includes('undefined')) {
    return "The clothing file was not properly selected. Please try selecting the outfit again.";
  } else if (message.includes('no clothing items')) {
    return "Please select at least one outfit before generating the virtual try-on.";
  } else {
    return "Please try again with a different photo or outfit. Ensure good lighting and clear full-body photos work best.";
  }
}

module.exports = router;